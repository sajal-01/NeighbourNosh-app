/**
 * Food-request helpers — Firestore CRUD for the `requests` collection.
 *
 * Receiver users can post a food request when they need food but don't see
 * a matching donation.  The request is stored in the `requests` Firestore
 * collection and can later be matched to a donation by an admin or donor.
 */

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  updateDoc,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

const db = getFirestore();

// ── Document type ─────────────────────────────────────────────────────────────

export interface FoodRequestDoc {
  id: string;
  receiverId: string;
  description: string;
  servings: number;
  /** "Veg" | "NonVeg" | "Both" */
  dietaryType: string;
  /** "volunteer" → ask a volunteer to deliver; "self" → receiver picks up */
  deliveryMode: "volunteer" | "self";
  /** "open" | "matched" | "fulfilled" | "cancelled" */
  status: string;
  /** Firestore donation ID once a donation is matched to this request. */
  assignedDonationId: string | null;
  /** Firestore user ID of the volunteer, once assigned. */
  assignedVolunteerId: string | null;
  /** Array of donor UIDs who can potentially fulfill this request. */
  possibleDonorsId: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  /** "normal" | "emergency" — defaults to "normal" for legacy documents */
  type?: "normal" | "emergency";
  /** true for emergency hunger alerts */
  isEmergency?: boolean;
  /** Urgency window: "1h" | "3h" | "today" — only set for emergency requests */
  urgency?: string;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface FoodRequestInput {
  receiverId: string;
  description: string;
  servings: number;
  dietaryType: "Veg" | "NonVeg" | "Both";
  deliveryMode: "volunteer" | "self";
}

/**
 * Creates a new food request document in the `requests` collection.
 * @returns The auto-generated Firestore document ID.
 */
export async function createFoodRequest(
  input: FoodRequestInput,
): Promise<string> {
  const docRef = await addDoc(collection(db, "requests"), {
    receiverId: input.receiverId,
    description: input.description,
    servings: input.servings,
    dietaryType: input.dietaryType,
    deliveryMode: input.deliveryMode,
    status: "open",
    assignedDonationId: null,
    assignedVolunteerId: null,
    possibleDonorsId: [],
    type: "normal",
    isEmergency: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ── Real-time listeners ───────────────────────────────────────────────────────

/**
 * Subscribes to all food requests posted by a specific receiver,
 * sorted newest-first client-side (avoids composite index requirement).
 * Returns the unsubscribe function — call it on component unmount.
 */
export function listenToReceiverRequests(
  receiverId: string,
  callback: (requests: FoodRequestDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "requests"),
    where("receiverId", "==", receiverId),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const requests: FoodRequestDoc[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FoodRequestDoc, "id">),
        }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      callback(requests);
    },
    () => callback([]),
  );
}

/**
 * Subscribes to all open food requests where the given donor UID is in
 * the `possibleDonorsId` array, sorted newest-first client-side.
 * Returns the unsubscribe function — call it on component unmount.
 */
export function listenToDonorRequests(
  donorId: string,
  callback: (requests: FoodRequestDoc[]) => void,
): () => void {
  const q = query(
    collection(db, "requests"),
    where("possibleDonorsId", "array-contains", donorId),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const requests: FoodRequestDoc[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FoodRequestDoc, "id">),
        }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      callback(requests);
    },
    () => callback([]),
  );
}

// ── Emergency request ─────────────────────────────────────────────────────────

export interface EmergencyRequestInput {
  receiverId: string;
  description: string;
  servings: number;
  dietaryType: "Veg" | "NonVeg" | "Both";
  deliveryMode: "volunteer" | "self";
  /** "1h" | "3h" | "today" */
  urgency: string;
}

/**
 * Creates an emergency food request in the `requests` collection.
 * Sets `type: "emergency"` and `isEmergency: true` to distinguish from
 * normal requests while remaining backward-compatible.
 * @returns The new document ID.
 */
export async function createEmergencyRequest(
  input: EmergencyRequestInput,
): Promise<string> {
  const docRef = await addDoc(collection(db, "requests"), {
    receiverId: input.receiverId,
    description: input.description,
    servings: input.servings,
    dietaryType: input.dietaryType,
    deliveryMode: input.deliveryMode,
    status: "open",
    assignedDonationId: null,
    assignedVolunteerId: null,
    possibleDonorsId: [],
    type: "emergency",
    isEmergency: true,
    urgency: input.urgency,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ── Updates ───────────────────────────────────────────────────────────────────

/**
 * Marks a request as matched and records the donation that fulfills it.
 */
export async function updateRequestAssignedDonation(
  requestId: string,
  donationId: string,
): Promise<void> {
  await updateDoc(doc(db, "requests", requestId), {
    assignedDonationId: donationId,
    status: "matched",
  });
}
