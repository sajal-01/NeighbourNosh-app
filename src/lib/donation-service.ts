/**
 * Donation helpers — Cloudinary upload + Firestore CRUD + real-time listeners.
 *
 * Upload flow:
 *   Images are uploaded to Cloudinary via XMLHttpRequest (React Native's XHR
 *   runtime natively understands the { uri, type, name } file-part object,
 *   whereas the fetch polyfill throws "Unsupported FormDataPart implementation").
 *   The UI uploads eagerly on image selection so createDonation only needs
 *   to write Cloudinary URLs to Firestore.
 *
 * Firestore collections:
 *   donations/{id}       — created by donors; updated throughout lifecycle
 *   delivery_tasks/{id}  — created by the Cloudflare Worker when volunteer
 *                          delivery is requested; consumed by volunteers
 */

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  GeoPoint,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  increment,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { geohashForLocation, distanceBetween } from "geofire-common";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
} from "@/constants/cloudinary";
import { cleanupDelivery } from "@/lib/delivery-service";

const db = getFirestore();

// ── Geohash ───────────────────────────────────────────────────────────────────

/** Encodes (lat, lng) into a geohash string using geofire-common. */
export function encodeGeohash(lat: number, lng: number, precision = 9): string {
  return geohashForLocation([lat, lng], precision);
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────

export async function uploadToCloudinary(
  uri: string,
  donorId: string,
): Promise<string> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  const formData = new FormData();
  formData.append("file", {
    uri,
    type: mimeType,
    name: `donation_${Date.now()}.${ext}`,
  } as unknown as Blob);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", `donations/${donorId}`);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    );

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { secure_url: string };
          resolve(data.secure_url);
        } catch {
          reject(new Error("Invalid JSON response from Cloudinary"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: { message?: string };
          };
          reject(
            new Error(
              body.error?.message ??
                `Cloudinary upload failed (HTTP ${xhr.status})`,
            ),
          );
        } catch {
          reject(new Error(`Cloudinary upload failed (HTTP ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during image upload"));
    xhr.send(formData);
  });
}

// ── Document types ────────────────────────────────────────────────────────────

/**
 * Status lifecycle:
 *   pending → accepted → pickup_scheduled → picked_up → in_transit → delivered
 */
export type DonationStatus =
  | "pending"
  | "accepted"
  | "pickup_scheduled"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "expired"
  | "cancelled";

/**
 * Shape of a document in the `donations` Firestore collection.
 */
export interface DonationDoc {
  id: string;
  donorId: string;
  foodDescription: string;
  quantity: number;
  /** "Veg" | "NonVeg" | "Both" */
  dietaryType: string;
  status: DonationStatus | string;
  /** Firestore GeoPoint — use .latitude / .longitude */
  pickupLocation: FirebaseFirestoreTypes.GeoPoint;
  pickupGeohash: string;
  pickupAddress: string;
  /** Cloudinary secure_urls, or null when no images were uploaded */
  imageUrl: string[] | null;
  /**
   * Kept for backward compatibility. Use `deliveryAgentId` for new logic.
   * Set once a volunteer accepts the delivery.
   */
  assignedVolunteerId: string | null;
  /** Set once a receiver claims the donation. */
  receiverId: string | null;
  /** Receiver's drop-off address. */
  dropOffAddress: string | null;

  // ── Unified Delivery Agent model ──────────────────────────────────────────
  /** "self" = receiver picks up; "volunteer" = volunteer delivers */
  deliveryMode: "self" | "volunteer" | null;
  /** Who is physically transporting the food */
  deliveryAgentType: "volunteer" | "receiver" | null;
  /** UID of the delivery agent */
  deliveryAgentId: string | null;

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  expiresAt: FirebaseFirestoreTypes.Timestamp | null;
  claimedAt: FirebaseFirestoreTypes.Timestamp | null;
  deliveredAt: FirebaseFirestoreTypes.Timestamp | null;
}

/**
 * Shape of a document in the `delivery_tasks` Firestore collection.
 * Created by the Cloudflare Worker when a receiver requests volunteer delivery.
 */
export interface DeliveryTaskDoc {
  id: string;
  donationId: string;
  donorId: string;
  receiverId: string;
  pickupAddress: string;
  dropOffAddress: string | null;
  pickupLocation: FirebaseFirestoreTypes.GeoPoint;
  dropOffLocation: FirebaseFirestoreTypes.GeoPoint | null;
  deliveryMode: "volunteer";
  /** "available" → "assigned" → "picked_up" → "in_transit" → "delivered" */
  status: string;
  assignedVolunteerId: string | null;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  // Denormalized food info for display
  foodDescription: string;
  quantity: number;
  dietaryType: string;
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Human-readable relative time (e.g. "5 mins ago"). */
export function timeAgo(
  ts: FirebaseFirestoreTypes.Timestamp | null | undefined,
): string {
  if (!ts) return "";
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

/**
 * Human-readable time-until-expiry string.
 * Color hint: green > 4 hrs, orange 1–4 hrs, red < 1 hr / expired.
 */
export function formatExpiresAt(
  ts: FirebaseFirestoreTypes.Timestamp | null | undefined,
): { label: string; color: string } {
  if (!ts) return { label: "", color: "#9ca3af" };
  const msLeft = ts.toMillis() - Date.now();
  if (msLeft <= 0) return { label: "Expired", color: "#e53935" };
  const mins = Math.floor(msLeft / 60_000);
  if (mins < 60) return { label: `Expires in ${mins}m`, color: "#e53935" };
  const hrs = Math.floor(mins / 60);
  if (hrs < 4) return { label: `Expires in ${hrs}h`, color: "#f97316" };
  if (hrs < 24) return { label: `Expires in ${hrs}h`, color: "#50b070" };
  const days = Math.floor(hrs / 24);
  return { label: `Expires in ${days}d`, color: "#50b070" };
}

/** Great-circle distance in km (wraps geofire-common `distanceBetween`). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return distanceBetween([lat1, lng1], [lat2, lng2]);
}

// ── Real-time listeners ───────────────────────────────────────────────────────

/** Subscribe to a single donation document. Returns unsubscribe. */
export function listenToDonationById(
  donationId: string,
  callback: (donation: DonationDoc | null) => void,
): () => void {
  return onSnapshot(
    doc(db, "donations", donationId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<DonationDoc, "id">) });
    },
    () => callback(null),
  );
}

/** Subscribe to all donations claimed by a specific receiver (newest first). */
export function listenToReceiverClaims(
  receiverId: string,
  callback: (docs: DonationDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "donations"),
    where("receiverId", "==", receiverId),
    limit(30),
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs: DonationDoc[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DonationDoc, "id">) }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      callback(docs);
    },
    () => callback([]),
  );
}

/** Subscribe to all donations created by a specific donor (newest first). */
export function listenToDonorDonations(
  donorId: string,
  callback: (docs: DonationDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "donations"),
    where("donorId", "==", donorId),
    limit(30),
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs: DonationDoc[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DonationDoc, "id">) }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      callback(docs);
    },
    () => callback([]),
  );
}

/** Subscribe to all pending donations (newest first). */
export function listenToPendingDonations(
  callback: (docs: DonationDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "donations"),
    where("status", "==", "pending"),
    where("deliveryAgentId", "==", null),
    limit(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const docs: DonationDoc[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DonationDoc, "id">) }))
        .filter((d) => {
          if (!d.expiresAt) return true;
          return d.expiresAt.toMillis() > now;
        })
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      callback(docs);
    },
    () => callback([]),
  );
}

/**
 * Subscribe to available delivery tasks for the Volunteer Home screen.
 * Queries `delivery_tasks` where status = "available" and no volunteer assigned.
 */
export function listenToDeliveryTasks(
  callback: (tasks: DeliveryTaskDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "delivery_tasks"),
    where("status", "==", "available"),
    where("assignedVolunteerId", "==", null),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const tasks: DeliveryTaskDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DeliveryTaskDoc, "id">),
      }));
      callback(tasks);
    },
    () => callback([]),
  );
}

// ── Firestore write actions ───────────────────────────────────────────────────

/**
 * Atomically claims a donation for a receiver with a chosen delivery mode.
 *
 * Self pickup  → status = "pickup_scheduled", deliveryAgentType = "receiver"
 * Volunteer    → status = "accepted", deliveryAgentType set later by volunteer
 */
 export async function claimDonation(
   donationId: string,
   receiverId: string,
   deliveryMode: "self" | "volunteer",
   dropOffAddress?: string,
   dropOffLocation?: GeoPoint, // ← new
 ): Promise<void> {
   const ref = doc(db, "donations", donationId);
   await runTransaction(db, async (tx) => {
     const snap = await tx.get(ref);
     if (!snap.exists())
       throw new Error("This donation is no longer available.");
     const data = snap.data()!;
     if (data.receiverId !== null)
       throw new Error("Another organisation has already claimed this food.");
     const isSelf = deliveryMode === "self";
     tx.update(ref, {
       receiverId,
       deliveryMode,
       status: isSelf ? "pickup_scheduled" : "accepted",
       deliveryAgentType: isSelf ? "receiver" : null,
       deliveryAgentId: isSelf ? receiverId : null,
       claimedAt: serverTimestamp(),
       ...(dropOffAddress ? { dropOffAddress } : {}),
       ...(dropOffLocation ? { dropOffLocation } : {}), // ← new
     });
   });
 }

/**
 * Atomically assigns a volunteer to a delivery task.
 * Updates both the `delivery_tasks` document and the `donations` document.
 *
 * Throws with a human-readable message if:
 *  - The task no longer exists
 *  - Another volunteer already claimed it
 */
export async function acceptDeliveryTask(
  taskId: string,
  donationId: string,
  volunteerId: string,
): Promise<void> {
  const taskRef = doc(db, "delivery_tasks", taskId);
  const donationRef = doc(db, "donations", donationId);

  await runTransaction(db, async (tx) => {
    const [taskSnap, donationSnap] = await Promise.all([
      tx.get(taskRef),
      tx.get(donationRef),
    ]);

    if (!taskSnap.exists())
      throw new Error("This delivery task is no longer available.");
    const taskData = taskSnap.data()!;
    if (
      taskData.assignedVolunteerId !== null ||
      taskData.status !== "available"
    )
      throw new Error(
        "This delivery has already been claimed by another volunteer.",
      );

    if (!donationSnap.exists())
      throw new Error("The associated donation no longer exists.");

    tx.update(taskRef, {
      status: "assigned",
      assignedVolunteerId: volunteerId,
    });

    tx.update(donationRef, {
      assignedVolunteerId: volunteerId,
      deliveryAgentType: "volunteer",
      deliveryAgentId: volunteerId,
      status: "pickup_scheduled",
    });
  });
}

/**
 * Update the delivery status on both the donation and the delivery task.
 * Used for intermediate stages: picked_up, in_transit.
 */
export async function updateDeliveryStatus(
  donationId: string,
  status: DonationStatus,
  taskId?: string | null,
): Promise<void> {
  await updateDoc(doc(db, "donations", donationId), {
    status,
    updatedAt: serverTimestamp(),
  });

  if (taskId) {
    await updateDoc(doc(db, "delivery_tasks", taskId), {
      status,
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Complete a delivery:
 *  1. Mark donation as delivered.
 *  2. Mark delivery task as delivered (if applicable).
 *  3. Award reward points (donor +50, delivery agent +100).
 *  4. Reset volunteer availability.
 *  5. Remove the RTDB active-delivery record.
 */
export async function completeDelivery(params: {
  donationId: string;
  taskId: string | null;
  donorId: string;
  deliveryAgentId: string;
  deliveryAgentType: "volunteer" | "receiver";
}): Promise<void> {
  const { donationId, taskId, donorId, deliveryAgentId, deliveryAgentType } =
    params;

  // Mark donation delivered
  await updateDoc(doc(db, "donations", donationId), {
    status: "delivered",
    deliveredAt: serverTimestamp(),
  });

  // Mark task delivered
  if (taskId) {
    await updateDoc(doc(db, "delivery_tasks", taskId), {
      status: "delivered",
      deliveredAt: serverTimestamp(),
    });
  }

  // Award points: +50 to donor
  await updateDoc(doc(db, "users", donorId), {
    rewardPoints: increment(50),
  });

  // Award points: +100 to delivery agent + reset volunteer availability
  const agentUpdates: Record<string, unknown> = {
    rewardPoints: increment(100),
  };
  if (deliveryAgentType === "volunteer") {
    agentUpdates.isAvailable = true;
  }
  await updateDoc(doc(db, "users", deliveryAgentId), agentUpdates);

  // Remove from RTDB
  await cleanupDelivery(donationId);
}

/** Legacy function kept for backward compatibility. */
export async function acceptDelivery(
  donationId: string,
  volunteerId: string,
): Promise<void> {
  const ref = doc(db, "donations", donationId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists())
      throw new Error("This delivery request is no longer available.");
    const data = snap.data()!;
    if (data.assignedVolunteerId !== null)
      throw new Error("Another volunteer has already accepted this delivery.");
    tx.update(ref, {
      assignedVolunteerId: volunteerId,
      deliveryAgentType: "volunteer",
      deliveryAgentId: volunteerId,
      status: "pickup_scheduled",
      acceptedAt: serverTimestamp(),
    });
  });
}

/** Updates editable fields on a donation document (donor only). */
export interface DonationUpdate {
  foodDescription?: string;
  quantity?: number;
  dietaryType?: string;
  expiresAt?: Date;
}

export async function updateDonation(
  donationId: string,
  updates: DonationUpdate,
): Promise<void> {
  await updateDoc(doc(db, "donations", donationId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/** Permanently removes a donation document. */
export async function deleteDonation(donationId: string): Promise<void> {
  await deleteDoc(doc(db, "donations", donationId));
}

// ── Donor creates donations ───────────────────────────────────────────────────

export interface DonationInput {
  donorId: string;
  foodDescription: string;
  quantity: number;
  dietaryType: string;
  pickupCoords: { latitude: number; longitude: number };
  pickupAddress: string;
  imageUrls: string[];
  expiresInHours: number;
}

export async function createDonation(input: DonationInput): Promise<string> {
  const {
    donorId,
    foodDescription,
    quantity,
    dietaryType,
    pickupCoords,
    pickupAddress,
    imageUrls,
    expiresInHours,
  } = input;

  const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);

  const docRef = await addDoc(collection(db, "donations"), {
    donorId,
    foodDescription,
    quantity,
    dietaryType,
    status: "pending",
    pickupLocation: new GeoPoint(pickupCoords.latitude, pickupCoords.longitude),
    pickupGeohash: encodeGeohash(pickupCoords.latitude, pickupCoords.longitude),
    pickupAddress,
    imageUrl: imageUrls.length > 0 ? imageUrls : null,
    assignedVolunteerId: null,
    receiverId: null,
    dropOffAddress: null,
    deliveryMode: null,
    deliveryAgentType: null,
    deliveryAgentId: null,
    claimedAt: null,
    deliveredAt: null,
    createdAt: serverTimestamp(),
    expiresAt,
  });

  return docRef.id;
}

// ── Donation created from a receiver's request ────────────────────────────────

export interface DonationFromRequestInput {
  donorId: string;
  receiverId: string;
  foodDescription: string;
  quantity: number;
  dietaryType: string;
  deliveryMode: "volunteer" | "self";
  pickupCoords: { latitude: number; longitude: number };
  pickupAddress: string;
  /** Defaults to 24 hours. */
  expiresInHours?: number;
}

/**
 * Creates a donation document that is pre-linked to a receiver's request.
 * Status starts as "accepted" since the receiver has already requested the food.
 * @returns The new donation document ID.
 */
export async function createDonationFromRequest(
  input: DonationFromRequestInput,
): Promise<string> {
  const {
    donorId,
    receiverId,
    foodDescription,
    quantity,
    dietaryType,
    deliveryMode,
    pickupCoords,
    pickupAddress,
    expiresInHours = 24,
  } = input;

  const expiresAt = new Date(Date.now() + expiresInHours * 3_600_000);

  const docRef = await addDoc(collection(db, "donations"), {
    donorId,
    foodDescription,
    quantity,
    dietaryType,
    status: "accepted",
    pickupLocation: new GeoPoint(pickupCoords.latitude, pickupCoords.longitude),
    pickupGeohash: encodeGeohash(pickupCoords.latitude, pickupCoords.longitude),
    pickupAddress,
    imageUrl: null,
    assignedVolunteerId: null,
    receiverId,
    dropOffAddress: null,
    deliveryMode,
    deliveryAgentType: null,
    deliveryAgentId: null,
    claimedAt: serverTimestamp(),
    deliveredAt: null,
    createdAt: serverTimestamp(),
    expiresAt,
  });

  return docRef.id;
}
