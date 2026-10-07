/**
 * Saved pickup locations.
 *
 * Addresses are stored as the `savedAddresses` array on the user document
 * (`users/{uid}.savedAddresses`), matching the existing Firestore schema:
 *
 *   id:           string   — unique identifier within the array
 *   houseNo:      string   — place/building name  (e.g. "Royal Kitchen, HSR Bengaluru")
 *   fullAddress:  string   — area / locality      (e.g. "kengri, bengaluru")
 *   lat:          number
 *   lng:          number
 *   contactName:  string
 *   contactPhone: string
 *   building:     string
 *   landmark:     string
 */

import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  GeoPoint,
} from "@react-native-firebase/firestore";
import { encodeGeohash } from "@/lib/donation-service";

const db = getFirestore();

// ── Raw Firestore shape ───────────────────────────────────────────────────────

interface RawSavedAddress {
  id: string;
  houseNo: string;
  fullAddress: string;
  lat: number;
  lng: number;
  /** Firestore GeoPoint — mirrors lat/lng for geo-queries */
  gpsLocation: GeoPoint;
  /** Geohash of lat/lng for proximity queries */
  geohash: string;
  contactName: string;
  contactPhone: string;
  building: string;
  landmark: string;
  /** Whether this is the user's primary address (drives top-level field sync) */
  isPrimary?: boolean;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface SavedLocation {
  id: string;
  /** houseNo — place/building name used as the primary display label */
  label: string;
  /** fullAddress — area/locality string */
  address: string;
  latitude: number;
  longitude: number;
  /** Optional extras shown as secondary detail in the picker */
  building?: string;
  landmark?: string;
  contactName?: string;
  isPrimary?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readAddresses(userId: string): Promise<RawSavedAddress[]> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return [];
  return (snap.data()?.savedAddresses ?? []) as RawSavedAddress[];
}

function toSavedLocation(a: RawSavedAddress): SavedLocation {
  return {
    id: a.id,
    label: a.houseNo,
    address: a.fullAddress,
    latitude: a.lat,
    longitude: a.lng,
    building: a.building || undefined,
    landmark: a.landmark || undefined,
    contactName: a.contactName || undefined,
    isPrimary: a.isPrimary,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch all saved addresses from the user's document (preserves array order). */
export async function fetchSavedLocations(
  userId: string,
): Promise<SavedLocation[]> {
  const raw = await readAddresses(userId);
  return raw.map(toSavedLocation);
}

/**
 * Append a new address to the user's `savedAddresses` array.
 * Returns the generated `id` of the new entry.
 */
export async function saveLocation(
  userId: string,
  loc: Omit<SavedLocation, "id" | "building" | "landmark" | "contactName">,
): Promise<string> {
  const existing = await readAddresses(userId);

  const newId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const gpsLocation = new GeoPoint(loc.latitude, loc.longitude);
  const geohash = encodeGeohash(loc.latitude, loc.longitude);

  const newEntry: RawSavedAddress = {
    id: newId,
    houseNo: loc.label,
    fullAddress: loc.address,
    lat: loc.latitude,
    lng: loc.longitude,
    gpsLocation,
    geohash,
    contactName: "",
    contactPhone: "",
    building: "",
    landmark: "",
    isPrimary: loc.isPrimary ?? false,
  };

  const updatedAddresses = [...existing, newEntry];

  // Top-level gpsLocation/geohash (used by proximity queries such as
  // emergency_food_request) should only ever mirror ONE address. Only sync
  // them here when the new address is explicitly primary, or when it's the
  // only saved address there is (so there's no ambiguity about which address
  // "wins"). Otherwise leave the existing top-level fields untouched.
  const shouldSyncTopLevel =
    newEntry.isPrimary === true || updatedAddresses.length === 1;

  await updateDoc(doc(db, "users", userId), {
    savedAddresses: updatedAddresses,
    ...(shouldSyncTopLevel ? { gpsLocation, geohash } : {}),
    updatedAt: serverTimestamp(),
  });

  return newId;
}

/**
 * Remove an address by its `id` from the `savedAddresses` array.
 * Uses read-modify-write so the exact object shape doesn't need to match.
 */
export async function deleteSavedLocation(
  userId: string,
  locationId: string,
): Promise<void> {
  const existing = await readAddresses(userId);
  const deleted = existing.find((a) => a.id === locationId);
  let updated = existing.filter((a) => a.id !== locationId);

  let syncedFields: { gpsLocation: GeoPoint; geohash: string } | null = null;

  if (updated.length === 1) {
    // Only one address left — it's the de-facto primary for proximity
    // queries, so sync the top-level fields to match it.
    const onlyRemaining = updated[0];
    syncedFields = {
      gpsLocation: new GeoPoint(onlyRemaining.lat, onlyRemaining.lng),
      geohash: encodeGeohash(onlyRemaining.lat, onlyRemaining.lng),
    };
  } else if (updated.length > 1 && deleted?.isPrimary) {
    // The primary address was just deleted and multiple addresses still
    // remain — fall back to auto-promoting the first remaining address so
    // there's always an unambiguous primary instead of leaving the
    // top-level fields pointing at a now-deleted address.
    const [first, ...rest] = updated;
    updated = [{ ...first, isPrimary: true }, ...rest];
    syncedFields = {
      gpsLocation: new GeoPoint(first.lat, first.lng),
      geohash: encodeGeohash(first.lat, first.lng),
    };
  }

  await updateDoc(doc(db, "users", userId), {
    savedAddresses: updated,
    ...(syncedFields ?? {}),
    updatedAt: serverTimestamp(),
  });
}
