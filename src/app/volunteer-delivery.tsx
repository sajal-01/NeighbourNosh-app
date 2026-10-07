/**
 * volunteer-delivery.tsx
 *
 * Active delivery screen for volunteers — two-stage flow:
 *
 *   Stage A  (pickup_scheduled)         — volunteer en route to donor's pickup point.
 *   Stage B  (in_transit | picked_up)   — volunteer en route to receiver's drop-off.
 *
 * Data flow:
 *  - Listens to the Firestore donation doc in real time via listenToDonationById.
 *  - Loads donor and receiver display names from Firestore users collection.
 *  - Publishes volunteer GPS location to RTDB every 7 s via startLocationPublishing.
 *  - Subscribes to RTDB rider location for a live 🛵 map marker.
 *
 * Stage-A CTA: "✅ Food Picked Up"
 *   → updateDeliveryStatus(donationId, "in_transit", taskId)
 *
 * Stage-B CTA: "🏁 Delivery Completed"
 *   → completeDelivery({...}) + triggerDeliveryCompleted + navigate home
 */

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections, {
  type MapDirectionsResponse,
} from "react-native-maps-directions";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import {
  completeDelivery,
  haversineKm,
  listenToDonationById,
  updateDeliveryStatus,
  type DonationDoc,
  type DeliveryTaskDoc,
} from "@/lib/donation-service";
import {
  startLocationPublishing,
  subscribeToDeliveryLocation,
  type ActiveDeliveryLocation,
} from "@/lib/delivery-service";
import { triggerDeliveryCompleted } from "@/lib/notifications-api";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

const db = getFirestore();
const { height: SCREEN_H } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(SCREEN_H * 0.36);

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS ?? "";

// ── Stage colour constants ─────────────────────────────────────────────────────
const STAGE_A_COLOR = Brand.main; // green  — en route to pickup
const STAGE_B_COLOR = "#2563eb"; // blue   — en route to drop-off

// Opens turn-by-turn directions to whichever destination is active for the
// current stage. Prefers precise coordinates (target) when we have them —
// always true for the pickup point, only true for drop-off once
// dropOffLocation has loaded — and falls back to the address string
// otherwise, letting the maps app geocode it and use the volunteer's current
// GPS position as the origin.
function openStageDestinationInMaps(
  target: { latitude: number; longitude: number } | null,
  address: string | null | undefined,
): void {
  let destination: string | null = null;
  if (target) {
    destination = `${target.latitude},${target.longitude}`;
  } else if (address) {
    destination = encodeURIComponent(address);
  }

  if (!destination) {
    Alert.alert(
      "No Destination Yet",
      "We don't have an address for this stage yet.",
    );
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Could not open Google Maps."),
  );
}

// ── Map marker sub-components ─────────────────────────────────────────────────

function PickupCalloutView({ address }: { address: string }) {
  return (
    <View style={mk.card}>
      <View style={mk.greenCircle}>
        <Text style={mk.circleIcon}>📍</Text>
      </View>
      <View style={mk.cardText}>
        <Text style={mk.cardLabel}>Pickup Location</Text>
        <Text style={mk.cardName} numberOfLines={2}>
          {address}
        </Text>
      </View>
    </View>
  );
}

function DropoffCalloutView({ address }: { address: string }) {
  return (
    <View style={[mk.card, mk.destCard]}>
      <View style={mk.blueCircle}>
        <Text style={mk.circleIcon}>🏛</Text>
      </View>
      <View style={mk.cardText}>
        <Text style={[mk.cardLabel, mk.blueLabel]}>Drop-off</Text>
        <Text style={mk.cardName} numberOfLines={2}>
          {address}
        </Text>
      </View>
    </View>
  );
}

function RiderMarkerView() {
  return (
    <View style={mk.scooterCircle}>
      <Text style={mk.scooterEmoji}>🛵</Text>
    </View>
  );
}

const mk = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    maxWidth: 200,
    borderWidth: 1,
    borderColor: "#e8f0eb",
  },
  destCard: { borderColor: "#dce8f5" },
  greenCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Brand.main,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  blueCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  circleIcon: { fontSize: 14 },
  cardText: { flexShrink: 1 },
  cardLabel: {
    fontSize: 9,
    color: Brand.main,
    fontWeight: "600",
    marginBottom: 1,
  },
  blueLabel: { color: "#2563eb" },
  cardName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f2419",
  },
  scooterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f0faf4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Brand.main,
  },
  scooterEmoji: { fontSize: 22 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function VolunteerDeliveryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { donationId, taskId } = useLocalSearchParams<{
    donationId: string;
    taskId: string;
  }>();

  const [donation, setDonation] = useState<DonationDoc | null>(null);
  // dropOffLocation lives on the delivery_tasks doc, not the donation doc.
  const [dropOffLocation, setDropOffLocation] =
    useState<FirebaseFirestoreTypes.GeoPoint | null>(null);
  const [donorName, setDonorName] = useState("Loading…");
  const [receiverName, setReceiverName] = useState("Loading…");
  const [agentLocation, setAgentLocation] =
    useState<ActiveDeliveryLocation | null>(null);
  // Real route metrics from the Directions API (distance in km, duration in min).
  const [routeInfo, setRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Holds the cleanup fn returned by startLocationPublishing.
  const stopPublishRef = useRef<(() => void) | null>(null);

  // ── Subscribe to donation doc in real time ──────────────────────────────
  useEffect(() => {
    if (!donationId) return;
    const unsub = listenToDonationById(donationId, (d) => {
      setDonation(d);
      setLoading(false);
    });
    return unsub;
  }, [donationId]);

  // ── Load delivery task doc to get dropOffLocation ────────────────────────
  useEffect(() => {
    if (!taskId) return;
    getDoc(doc(db, "delivery_tasks", taskId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as Omit<DeliveryTaskDoc, "id">;
          setDropOffLocation(data.dropOffLocation ?? null);
        }
      })
      .catch(() => {
        /* drop-off pin simply won't show */
      });
  }, [taskId]);

  // ── Load donor & receiver display names ─────────────────────────────────
  useEffect(() => {
    if (!donation?.donorId) return;

    getDoc(doc(db, "users", donation.donorId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDonorName(data?.name ?? data?.displayName ?? "Donor");
        }
      })
      .catch(() => setDonorName("Donor"));

    if (donation.receiverId) {
      getDoc(doc(db, "users", donation.receiverId))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setReceiverName(data?.name ?? data?.displayName ?? "Receiver");
          }
        })
        .catch(() => setReceiverName("Receiver"));
    }
  }, [donation?.donorId, donation?.receiverId]);

  // ── Start publishing volunteer location once donation loads ─────────────
  // Runs when loading goes false (i.e., donation first received). Returns
  // a cleanup that stops publishing on unmount.
  useEffect(() => {
    if (!donationId || !user?.uid || loading) return;

    startLocationPublishing(donationId, user.uid, "volunteer")
      .then((stop) => {
        stopPublishRef.current = stop;
      })
      .catch((err: Error) => {
        if (__DEV__) {
          console.warn(
            "[volunteer-delivery] startLocationPublishing:",
            err.message,
          );
        }
      });

    return () => {
      // Stop on unmount; also covers hot-reload in dev.
      stopPublishRef.current?.();
      stopPublishRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donationId, user?.uid, loading]);

  // ── Subscribe to live rider location for map marker ──────────────────────
  useEffect(() => {
    if (!donationId) return;
    const unsub = subscribeToDeliveryLocation(donationId, setAgentLocation);
    return unsub;
  }, [donationId]);

  // ── Stage A CTA: mark food as collected (pickup → in_transit) ────────────
  const handlePickedUp = () => {
    if (!donationId || actionLoading) return;
    Alert.alert(
      t("volunteerDelivery.confirmPickup"),
      t("volunteerDelivery.confirmPickupMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Yes, Picked Up ✅",
          onPress: async () => {
            setActionLoading(true);
            try {
              await updateDeliveryStatus(
                donationId,
                "in_transit",
                taskId ?? null,
              );
              Alert.alert(
                "Great! 🚴",
                "Food picked up. Head to the receiver's address.",
              );
            } catch (err: unknown) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to update status.",
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Stage B CTA: complete delivery ────────────────────────────────────────
  const handleDeliveryComplete = () => {
    if (!donation || !user?.uid || actionLoading) return;
    Alert.alert(
      t("volunteerDelivery.confirmDelivery"),
      t("volunteerDelivery.confirmDeliveryMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Yes, Delivered 🏁",
          onPress: async () => {
            setActionLoading(true);
            try {
              await completeDelivery({
                donationId,
                taskId: taskId ?? null,
                donorId: donation.donorId,
                deliveryAgentId: user.uid,
                deliveryAgentType: "volunteer",
              });
              // Fire-and-forget delivery-completed notification.
              void triggerDeliveryCompleted(
                [donation.donorId, donation.receiverId, user.uid],
                "Delivery Complete! ✅",
                "The food has been successfully delivered to the recipient.",
              );
              // Stop location publishing — delivery is done.
              stopPublishRef.current?.();
              stopPublishRef.current = null;
              Alert.alert(
                t("volunteerDelivery.deliveryComplete"),
                t("volunteerDelivery.deliveryCompleteMsg"),
                [
                  {
                    text: t("common.backToHome"),
                    onPress: () =>
                      router.replace(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        "/(tabs)/volunteer-home" as any,
                      ),
                  },
                ],
              );
            } catch (err: unknown) {
              Alert.alert(
                "Error",
                err instanceof Error
                  ? err.message
                  : "Failed to complete delivery.",
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Derive current stage ─────────────────────────────────────────────────
  const status = donation?.status ?? "";
  const isStageA = status === "pickup_scheduled" || status === "accepted";
  const isStageB = status === "in_transit" || status === "picked_up";
  const stageColor = isStageB ? STAGE_B_COLOR : STAGE_A_COLOR;
  const stageBg = isStageB ? "#eff6ff" : "#f0faf4";

  // ── Active route target — pickup point for Stage A, drop-off for Stage B ──
  // Reused by both the distance calc below and the MapViewDirections route,
  // so the two always stay in sync with the current stage.
  //
  // Important: in Stage B this must resolve to `null` (not fall back to the
  // pickup point) when dropOffLocation hasn't loaded yet — otherwise the
  // polyline/distance/ETA would silently keep pointing at the pickup location
  // while the UI claims to be in Stage B.
  const target = isStageB
    ? dropOffLocation
      ? {
          latitude: dropOffLocation.latitude,
          longitude: dropOffLocation.longitude,
        }
      : null
    : donation
      ? {
          latitude: donation.pickupLocation.latitude,
          longitude: donation.pickupLocation.longitude,
        }
      : null;

  // Clear stale route metrics whenever the active leg (pickup vs drop-off) changes.
  useEffect(() => {
    setRouteInfo(null);
  }, [isStageB]);

  // ── Map region — centred on the active target ────────────────────────────
  const mapCenterLat = isStageB
    ? (dropOffLocation?.latitude ??
      donation?.pickupLocation.latitude ??
      12.9716)
    : (donation?.pickupLocation.latitude ?? 12.9716);

  const mapCenterLng = isStageB
    ? (dropOffLocation?.longitude ??
      donation?.pickupLocation.longitude ??
      77.5946)
    : (donation?.pickupLocation.longitude ?? 77.5946);

  const mapRegion = {
    latitude: mapCenterLat,
    longitude: mapCenterLng,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  };

  // ── Distance from rider to next target ──────────────────────────────────
  // Prefer the real route distance from the Directions API once it loads;
  // fall back to a straight-line (haversine) estimate so something shows
  // immediately while the route is still being fetched.
  let distanceKm: number | null = null;
  if (agentLocation && target) {
    distanceKm = haversineKm(
      agentLocation.latitude,
      agentLocation.longitude,
      target.latitude,
      target.longitude,
    );
  }
  const displayDistanceKm = routeInfo?.distanceKm ?? distanceKm;

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView
        style={[s.safe, { backgroundColor: "#F4FBF7" }]}
        edges={["top"]}
      >
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {t("volunteerDelivery.screenTitle")}
          </Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.main} />
          <Text style={s.loadingText}>Loading delivery info…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!donation) {
    return (
      <SafeAreaView
        style={[s.safe, { backgroundColor: "#F4FBF7" }]}
        edges={["top"]}
      >
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {t("volunteerDelivery.screenTitle")}
          </Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.loadingContainer}>
          <Text style={s.loadingText}>Delivery not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[s.safe, { backgroundColor: stageBg }]}
      edges={["top", "bottom"]}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t("volunteerDelivery.screenTitle")}</Text>
        <View style={s.headerSpacer} />
      </View>

      {/* ── Stage badge ──────────────────────────────────────────────── */}
      <View style={[s.stageBanner, { backgroundColor: stageColor }]}>
        <View style={s.stageDot} />
        <Text style={s.stageBannerText}>
          {isStageB
            ? "Stage B — En Route to Receiver 🏁"
            : "Stage A — En Route to Pickup 📍"}
        </Text>
      </View>

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <View style={[s.mapWrapper, { height: MAP_HEIGHT }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          scrollEnabled
          zoomEnabled
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {/* Pickup pin — Stage A */}
          {isStageA && (
            <Marker
              coordinate={{
                latitude: donation.pickupLocation.latitude,
                longitude: donation.pickupLocation.longitude,
              }}
            >
              <Callout tooltip>
                <PickupCalloutView address={donation.pickupAddress} />
              </Callout>
            </Marker>
          )}

          {/* Drop-off pin — Stage B */}
          {isStageB && dropOffLocation && (
            <Marker
              coordinate={{
                latitude: dropOffLocation.latitude,
                longitude: dropOffLocation.longitude,
              }}
              pinColor="#2563eb"
            >
              <Callout tooltip>
                <DropoffCalloutView
                  address={donation.dropOffAddress ?? "Drop-off location"}
                />
              </Callout>
            </Marker>
          )}

          {/* Live volunteer marker */}
          {agentLocation && (
            <Marker
              coordinate={{
                latitude: agentLocation.latitude,
                longitude: agentLocation.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <RiderMarkerView />
            </Marker>
          )}

          {/* Route: volunteer → pickup (Stage A) or volunteer → drop-off (Stage B). */}
          {/* `key` forces a clean remount when switching legs so the old route */}
          {/* doesn't linger or morph into the new one. */}
          {agentLocation && target && (
            <MapViewDirections
              key={isStageB ? "leg-dropoff" : "leg-pickup"}
              origin={{
                latitude: agentLocation.latitude,
                longitude: agentLocation.longitude,
              }}
              destination={target}
              apikey={GOOGLE_MAPS_APIKEY}
              mode="DRIVING"
              strokeWidth={4}
              strokeColor={stageColor}
              onReady={(result: MapDirectionsResponse) => {
                setRouteInfo({
                  distanceKm: result.distance,
                  durationMin: result.duration,
                });
              }}
              onError={(errorMessage) => {
                if (__DEV__) {
                  console.warn(
                    `[volunteer-delivery] Directions error: ${errorMessage}`,
                  );
                }
              }}
            />
          )}
        </MapView>
      </View>

      {/* ── Scrollable bottom panel ──────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Address + person info card ── */}
        <View style={[s.card, CARD_SHADOW]}>
          {/* Address block */}
          <View style={s.addressBlock}>
            <View
              style={[
                s.addressIconCircle,
                { backgroundColor: isStageB ? "#dbeafe" : "#d4edda" },
              ]}
            >
              <Ionicons
                name={isStageB ? "location" : "location-outline"}
                size={18}
                color={stageColor}
              />
            </View>
            <View style={s.addressText}>
              <Text style={[s.addressLabel, { color: stageColor }]}>
                {isStageB ? "Drop-off Address" : "Pickup Address"}
              </Text>
              <Text style={s.addressValue}>
                {isStageB
                  ? (donation.dropOffAddress ?? "Awaiting receiver address")
                  : donation.pickupAddress}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                s.navigateBtn,
                { borderColor: isStageB ? "#bfdbfe" : "#b8d4c0" },
              ]}
              activeOpacity={0.82}
              onPress={() =>
                openStageDestinationInMaps(
                  target,
                  isStageB ? donation.dropOffAddress : donation.pickupAddress,
                )
              }
            >
              <Ionicons name="navigate" size={13} color={stageColor} />
              <Text style={[s.navigateBtnText, { color: stageColor }]}>
                Navigate
              </Text>
            </TouchableOpacity>
          </View>

          {/* Person info (donor for Stage A, receiver for Stage B) */}
          <View
            style={[
              s.personRow,
              { borderTopColor: isStageB ? "#dbeafe" : "#e4edda" },
            ]}
          >
            <View
              style={[
                s.personAvatar,
                { backgroundColor: isStageB ? "#dbeafe" : "#d4edda" },
              ]}
            >
              <Text style={[s.personAvatarText, { color: stageColor }]}>
                {isStageB ? "R" : "D"}
              </Text>
            </View>
            <View style={s.personInfo}>
              <Text style={[s.personLabel, { color: stageColor }]}>
                {isStageB ? "Receiver" : "Donor"}
              </Text>
              <Text style={s.personName}>
                {isStageB ? receiverName : donorName}
              </Text>
              <Text style={s.personMeta}>
                {isStageB
                  ? `Deliver to: ${donation.dropOffAddress ?? "—"}`
                  : `Pick up at: ${donation.pickupAddress}`}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View
            style={[
              s.statsRow,
              { borderColor: isStageB ? "#dbeafe" : "#e4edda" },
            ]}
          >
            <View style={s.statSide}>
              <Ionicons name="navigate-outline" size={20} color={stageColor} />
              <Text style={s.statStatLabel}>Distance</Text>
              <Text style={[s.statValue, { color: stageColor }]}>
                {displayDistanceKm !== null
                  ? `${displayDistanceKm.toFixed(1)} km`
                  : "—"}
              </Text>
              {routeInfo && (
                <Text style={s.statStatLabel}>
                  ~{Math.round(routeInfo.durationMin)} min
                </Text>
              )}
            </View>
            <View style={s.statVDivider} />
            <View style={s.statSide}>
              <Ionicons name="cube-outline" size={20} color={stageColor} />
              <Text style={s.statStatLabel}>Qty</Text>
              <Text style={[s.statValue, { color: stageColor }]}>
                {donation.quantity} srv
              </Text>
            </View>
            <View style={s.statVDivider} />
            <View style={s.statSide}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={stageColor}
              />
              <Text style={s.statStatLabel}>Status</Text>
              <Text
                style={[s.statValue, { color: stageColor }]}
                numberOfLines={1}
              >
                {status.replace(/_/g, " ")}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Food description chip ── */}
        <View style={[s.foodChipRow, CARD_SHADOW]}>
          <Text style={s.foodChipEmoji}>📦</Text>
          <Text style={s.foodChipText} numberOfLines={2}>
            {donation.foodDescription} · {donation.quantity} servings ·{" "}
            {donation.dietaryType}
          </Text>
        </View>

        {/* ── Safety card ── */}
        <View style={[s.safetyCard, CARD_SHADOW]}>
          <Ionicons name="shield-checkmark" size={22} color={Brand.main} />
          <View style={s.safetyText}>
            <Text style={s.safetyTitle}>Your safety is our priority</Text>
            {/*<Text style={s.safetySub}>
              Share your location and contact details with care. Contact support
              if you feel unsafe.
            </Text>*/}
          </View>
        </View>
      </ScrollView>

      {/* ── Large CTA button — fixed at the bottom ───────────────────── */}
      {(isStageA || isStageB) && (
        <View style={s.ctaWrap}>
          <TouchableOpacity
            style={[
              s.ctaBtn,
              { backgroundColor: stageColor },
              actionLoading && s.ctaBtnDisabled,
            ]}
            activeOpacity={0.84}
            onPress={isStageB ? handleDeliveryComplete : handlePickedUp}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text style={s.ctaBtnText}>
                  {isStageB ? "🏁  Delivery Completed" : "✅  Food Picked Up"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
} as const;

const s = StyleSheet.create({
  safe: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Brand.main,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerSpacer: {
    width: 32,
  },

  // ── Stage banner ──────────────────────────────────────────────────────────
  stageBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.80)",
  },
  stageBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },

  // ── Map ───────────────────────────────────────────────────────────────────
  mapWrapper: {
    width: "100%",
    overflow: "hidden",
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },

  // ── Info card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },

  // Address block (top of info card)
  addressBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  addressIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addressText: {
    flex: 1,
    gap: 2,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addressValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2e1e",
  },
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#ffffff",
    flexShrink: 0,
  },
  navigateBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Person row (donor or receiver)
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  personAvatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  personInfo: {
    flex: 1,
    gap: 2,
  },
  personLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  personName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a2e1e",
  },
  personMeta: {
    fontSize: 12,
    color: "#666",
  },

  // Stats row (distance / qty / status)
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  statSide: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statVDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e5e7eb",
  },
  statStatLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "500",
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Food description chip ──────────────────────────────────────────────────
  foodChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  foodChipEmoji: {
    fontSize: 22,
  },
  foodChipText: {
    flex: 1,
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
  },

  // ── Safety card ───────────────────────────────────────────────────────────
  safetyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e4edda",
  },
  safetyText: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a2e1e",
    marginBottom: 2,
  },
  safetySub: {
    fontSize: 12,
    color: "#666",
  },

  // ── CTA button ────────────────────────────────────────────────────────────
  ctaWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "transparent",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 58,
    gap: 6,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaBtnDisabled: {
    opacity: 0.55,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },

  // ── Loading / not-found ───────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#666",
  },
});
