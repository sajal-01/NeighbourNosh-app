/**
 * Cloudflare Worker notification API.
 *
 * Single POST endpoint that handles five notification trigger events:
 *
 *   emergency_food_request  — Hunger Alert: finds donors within 5 km of the
 *                             receiver and notifies them.
 *   donation_accepted       — Direct notification to the donor when a receiver
 *                             claims their donation.
 *   pickup_assigned         — Direct notification to donor + receiver when a
 *                             volunteer accepts the delivery.
 *   delivery_completed      — Direct notification to all parties on drop-off.
 *   reward_achievement      — Direct notification when a user earns a reward.
 *   receiver_request        — Finds donors within 5 km of the receiver's
 *                             location, writes their IDs into the request doc,
 *                             and notifies them of a new donation request.
 *
 * All event helpers are **fire-and-forget** — errors are logged in dev but
 * never bubble up so the core donation flow is never blocked.
 */

import { getFirestore, doc, getDoc } from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { WORKER_NOTIFICATION_URL } from "@/constants/worker";

const db = getFirestore();

// ── Payload shapes (mirrors the worker's expected request body) ───────────────

interface EmergencyFoodRequestPayload {
  triggerEvent: "emergency_food_request";
  /** UID of the receiver who posted the food request */
  userId: string;
  lat: number;
  long: number;
}

interface VolunteerSearchPayload {
  triggerEvent: "volunteer_search";
  /** The donation that needs a volunteer delivery */
  donationId: string;
  lat: number;
  long: number;
}

interface ReceiverRequestPayload {
  triggerEvent: "receiver_request";
  /** The request document ID already created in Firestore by the app */
  requestId: string;
  lat: number;
  long: number;
}

interface DirectNotificationPayload {
  triggerEvent:
    | "donation_accepted"
    | "pickup_assigned"
    | "delivery_completed"
    | "reward_achievement";
  /** Use for a single recipient */
  recipientId?: string;
  /** Use for multiple recipients */
  recipientIds?: string[];
  title?: string;
  body?: string;
}

type WorkerPayload =
  | EmergencyFoodRequestPayload
  | VolunteerSearchPayload
  | ReceiverRequestPayload
  | DirectNotificationPayload;

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function postToWorker(payload: WorkerPayload): Promise<void> {
  if (!WORKER_NOTIFICATION_URL) {
    if (__DEV__) {
      console.warn(
        "[notifications-api] EXPO_PUBLIC_WORKER_NOTIFICATION_URL is not set — " +
          "push notifications are disabled. Add the URL to your .env file.",
      );
    }
    return;
  }

  try {
    const res = await fetch(WORKER_NOTIFICATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok && __DEV__) {
      console.warn(
        `[notifications-api] Worker responded ${res.status} for event "${payload.triggerEvent}"`,
      );
    }
  } catch (err) {
    if (__DEV__) {
      console.warn("[notifications-api] Failed to reach worker:", err);
    }
  }
}

// ── Helpers for recipient resolution ─────────────────────────────────────────

/** Builds the `recipientId` / `recipientIds` portion of the payload. */
function recipientFields(
  recipient: string | string[],
): Pick<DirectNotificationPayload, "recipientId" | "recipientIds"> {
  return Array.isArray(recipient)
    ? { recipientIds: recipient }
    : { recipientId: recipient };
}

// ── Typed event helpers ───────────────────────────────────────────────────────

/**
 * Hunger Alert — reads the receiver's `gpsLocation` GeoPoint from Firestore,
 * then notifies donors within 5 km.
 *
 * Silently skips when no `gpsLocation` has been saved for the user yet.
 */
export async function triggerEmergencyFoodRequest(
  userId: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    const gpsLocation = snap.data()?.gpsLocation as
      | FirebaseFirestoreTypes.GeoPoint
      | undefined;

    if (!gpsLocation) {
      if (__DEV__) {
        console.warn(
          `[notifications-api] emergency_food_request skipped — ` +
            `no gpsLocation stored for user ${userId}. ` +
            `Ask the user to save at least one address first.`,
        );
      }
      return;
    }

    await postToWorker({
      triggerEvent: "emergency_food_request",
      userId,
      lat: gpsLocation.latitude,
      long: gpsLocation.longitude,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn("[notifications-api] emergency_food_request error:", err);
    }
  }
}

/**
 * Volunteer Search — notifies available volunteers within 5 km of the pickup
 * point that a delivery task is available.
 *
 * The Cloudflare Worker will:
 *  1. Find volunteers with `isAvailable = true` within the geohash radius.
 *  2. Send push notifications with a deep-link to the volunteer home screen.
 *  3. Create a `delivery_tasks` document in Firestore.
 *
 * Only trigger this when `deliveryMode === "volunteer"`.
 */
export function triggerVolunteerSearch(
  donationId: string,
  pickupLat: number,
  pickupLong: number,
): Promise<void> {
  return postToWorker({
    triggerEvent: "volunteer_search",
    donationId,
    lat: pickupLat,
    long: pickupLong,
  });
}

/**
 * Receiver Request — reads the receiver's `gpsLocation` GeoPoint from
 * Firestore, then notifies donors within 5 km that a new donation has been
 * requested.
 *
 * The Cloudflare Worker will:
 *  1. Find donors within 5 km using the geohash radius.
 *  2. Write their UIDs into `possibleDonorsId` on the existing request doc.
 *  3. Send push notifications with a deep-link to the donor home screen.
 *
 * Call this immediately after creating the request document in Firestore.
 * Silently skips when no `gpsLocation` has been saved for the user yet.
 *
 * @param userId     UID of the receiver who submitted the request.
 * @param requestId  The `requests` collection document ID already created.
 */
export async function triggerReceiverRequest(
  userId: string,
  requestId: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    const gpsLocation = snap.data()?.gpsLocation as
      | FirebaseFirestoreTypes.GeoPoint
      | undefined;

    if (!gpsLocation) {
      if (__DEV__) {
        console.warn(
          `[notifications-api] receiver_request skipped — ` +
            `no gpsLocation stored for user ${userId}. ` +
            `Ask the user to save at least one address first.`,
        );
      }
      return;
    }

    await postToWorker({
      triggerEvent: "receiver_request",
      requestId,
      lat: gpsLocation.latitude,
      long: gpsLocation.longitude,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn("[notifications-api] receiver_request error:", err);
    }
  }
}

/**
 * Notify the donor that a receiver has accepted (claimed) their donation.
 *
 * @param recipient  Donor UID, or an array of UIDs.
 */
export function triggerDonationAccepted(
  recipient: string | string[],
  title = "Donation Claimed! 🎉",
  body = "A receiver has accepted your food donation.",
): Promise<void> {
  return postToWorker({
    triggerEvent: "donation_accepted",
    ...recipientFields(recipient),
    title,
    body,
  });
}

/**
 * Notify the donor and receiver that a volunteer has been assigned for pickup.
 *
 * Pass `null` values in the array — they are filtered out automatically.
 *
 * @param recipients  Array of UIDs (donor + receiver). Nulls are removed.
 */
export function triggerPickupAssigned(
  recipients: (string | null | undefined)[],
  title = "Volunteer Assigned! 🚴",
  body = "A volunteer has accepted the delivery and is heading to the pickup point.",
): Promise<void> {
  const ids = recipients.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return Promise.resolve();
  return postToWorker({
    triggerEvent: "pickup_assigned",
    ...recipientFields(ids.length === 1 ? ids[0] : ids),
    title,
    body,
  });
}

/**
 * Notify all relevant parties that the delivery has been completed.
 *
 * @param recipients  Array of UIDs (donor + receiver + volunteer). Nulls removed.
 */
export function triggerDeliveryCompleted(
  recipients: (string | null | undefined)[],
  title = "Delivery Complete! ✅",
  body = "The food has been successfully delivered.",
): Promise<void> {
  const ids = recipients.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return Promise.resolve();
  return postToWorker({
    triggerEvent: "delivery_completed",
    ...recipientFields(ids.length === 1 ? ids[0] : ids),
    title,
    body,
  });
}

/**
 * Notify a user that they have earned a reward or unlocked a badge.
 *
 * @param recipient  UID or array of UIDs.
 */
export function triggerRewardAchievement(
  recipient: string | string[],
  title = "New Achievement! 🏆",
  body = "You have earned a new reward. Keep it up!",
): Promise<void> {
  return postToWorker({
    triggerEvent: "reward_achievement",
    ...recipientFields(recipient),
    title,
    body,
  });
}
