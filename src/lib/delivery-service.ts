/**
 * Real-time delivery tracking service.
 *
 * Uses Firebase Realtime Database to push / consume live location updates
 * for the active delivery agent (either a volunteer or a self-pickup receiver).
 *
 * RTDB structure:
 *   active_deliveries/{donationId}/
 *     latitude          number
 *     longitude         number
 *     timestamp         number   (ms since epoch)
 *     deliveryAgentId   string
 *     deliveryAgentType "volunteer" | "receiver"
 *
 * Rules of use:
 *  - Only the delivery agent calls `startLocationPublishing`.
 *  - Donors and receivers call `subscribeToDeliveryLocation`.
 *  - `cleanupDelivery` is called once on completion to remove the RTDB record.
 *  - Location is published every 7 seconds while active.
 *  - A single module-level interval is kept because a user can only be the
 *    active delivery agent for one donation at a time.
 */

import * as Location from "expo-location";
import {
  getDatabase,
  ref,
  set,
  onValue,
  remove,
} from "@react-native-firebase/database";

const rtdb = getDatabase();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveDeliveryLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
  deliveryAgentId: string;
  deliveryAgentType: "volunteer" | "receiver";
}

// ── Module-level tracking state ───────────────────────────────────────────────

let _publishInterval: ReturnType<typeof setInterval> | null = null;

// ── Internal helpers ──────────────────────────────────────────────────────────

async function pushLocation(
  donationId: string,
  agentId: string,
  agentType: "volunteer" | "receiver",
): Promise<void> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await set(ref(rtdb, `active_deliveries/${donationId}`), {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: Date.now(),
      deliveryAgentId: agentId,
      deliveryAgentType: agentType,
    });
  } catch (err) {
    if (__DEV__) {
      console.warn("[delivery-service] Location push failed:", err);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request location permission, push the current position immediately, then
 * continue publishing every 7 seconds.
 *
 * Returns a cleanup function that stops the interval — call it when the
 * delivery screen unmounts or the delivery completes.
 *
 * Throws if foreground location permission is denied.
 */
export async function startLocationPublishing(
  donationId: string,
  agentId: string,
  agentType: "volunteer" | "receiver",
): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error(
      "Location permission is required to track the delivery. " +
        "Please enable it in your device settings.",
    );
  }

  // Push immediately, then on interval
  await pushLocation(donationId, agentId, agentType);

  // Clear any stale interval from a previous session
  if (_publishInterval) clearInterval(_publishInterval);

  _publishInterval = setInterval(() => {
    void pushLocation(donationId, agentId, agentType);
  }, 7_000);

  return () => {
    if (_publishInterval) {
      clearInterval(_publishInterval);
      _publishInterval = null;
    }
  };
}

/**
 * Subscribe to live location updates for a donation's active delivery agent.
 *
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToDeliveryLocation(
  donationId: string,
  callback: (location: ActiveDeliveryLocation | null) => void,
): () => void {
  const locationRef = ref(rtdb, `active_deliveries/${donationId}`);
  const unsubscribe = onValue(locationRef, (snapshot) => {
    callback((snapshot.val() as ActiveDeliveryLocation | null) ?? null);
  });
  // RN Firebase onValue returns an unsubscribe function directly
  return unsubscribe as unknown as () => void;
}

/**
 * Remove the active-delivery record from RTDB once the delivery is complete.
 * Safe to call even if the record no longer exists.
 */
export async function cleanupDelivery(donationId: string): Promise<void> {
  try {
    await remove(ref(rtdb, `active_deliveries/${donationId}`));
  } catch (err) {
    if (__DEV__) {
      console.warn("[delivery-service] cleanupDelivery failed:", err);
    }
  }
}

/**
 * Stop location publishing without removing the RTDB record.
 * Use this when the screen unmounts mid-delivery (app backgrounded).
 */
export function stopLocationPublishing(): void {
  if (_publishInterval) {
    clearInterval(_publishInterval);
    _publishInterval = null;
  }
}
