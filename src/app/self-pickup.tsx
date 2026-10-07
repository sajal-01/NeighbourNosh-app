/**
 * self-pickup.tsx
 *
 * Tracking screen for receivers who chose self-pickup.
 *
 * Stage A  (pickup_scheduled) — receiver travelling to the donor's pickup point.
 * Stage B  (in_transit)       — confirm receipt / final completion step.
 *
 * The receiver is the delivery agent in this flow, so their GPS position is
 * published to RTDB throughout Stage A so the donor can track progress.
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
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections, {
  type MapDirectionsResponse,
} from "react-native-maps-directions";
import * as Location from "expo-location";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import {
  completeDelivery,
  listenToDonationById,
  updateDeliveryStatus,
  type DonationDoc,
} from "@/lib/donation-service";
import {
  startLocationPublishing,
  stopLocationPublishing,
} from "@/lib/delivery-service";
import { triggerDeliveryCompleted } from "@/lib/notifications-api";

const db = getFirestore();
const { height: SCREEN_H } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(SCREEN_H * 0.32);

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS ?? "";

// ── Stage constants ───────────────────────────────────────────────────────────
const STAGE_A_COLOR = Brand.main;
const STAGE_B_COLOR = "#7c3aed"; // purple for completion

// ── Helpers ───────────────────────────────────────────────────────────────────

function openNavigation(
  lat: number,
  lng: number,
  label: string,
  tFn: (k: string) => string,
) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(label)}`;
  Linking.openURL(url).catch(() =>
    Alert.alert(tFn("common.error"), tFn("track.openMapsError")),
  );
}

function stageBadge(status: string): {
  label: string;
  sub: string;
  color: string;
} {
  if (status === "in_transit") {
    return {
      label: "Donation Received",
      sub: "Mark as received to complete the process",
      color: STAGE_B_COLOR,
    };
  }
  return {
    label: "Travelling to Pickup",
    sub: "Head to the donor's location to collect the food",
    color: STAGE_A_COLOR,
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SelfPickupScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { donationId } = useLocalSearchParams<{ donationId: string }>();

  const [donation, setDonation] = useState<DonationDoc | null>(null);
  const [donorName, setDonorName] = useState<string>("Donor");
  const [loading, setLoading] = useState(true);
  const [ctaBusy, setCtaBusy] = useState(false);

  // Receiver's live device position — used as the Directions origin while
  // travelling to the pickup point (Stage A only).
  const [myLocation, setMyLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Real route metrics from the Directions API (distance in km, duration in min).
  const [routeInfo, setRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  const mapRef = useRef<MapView>(null);

  // Cleanup function returned by startLocationPublishing
  const stopPublishRef = useRef<(() => void) | null>(null);

  // ── Subscribe to donation ─────────────────────────────────────────────────

  useEffect(() => {
    if (!donationId) return;
    const unsub = listenToDonationById(donationId, (d) => {
      setDonation(d);
      setLoading(false);
    });
    return unsub;
  }, [donationId]);

  // ── Load donor name ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!donation?.donorId) return;
    getDoc(doc(db, "users", donation.donorId))
      .then((snap) => {
        if (snap.exists()) {
          setDonorName((snap.data()?.name as string) || "Donor");
        }
      })
      .catch(() => {});
  }, [donation?.donorId]);

  // ── Start publishing location (Stage A only) ──────────────────────────────

  useEffect(() => {
    if (!user?.uid || !donationId || !donation) return;
    if (donation.status !== "pickup_scheduled") return;

    startLocationPublishing(donationId, user.uid, "receiver")
      .then((stopFn) => {
        stopPublishRef.current = stopFn;
      })
      .catch((err) => {
        if (__DEV__) console.warn("[self-pickup] location publish error:", err);
      });

    return () => {
      stopPublishRef.current?.();
      stopPublishRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donation?.status, user?.uid, donationId]);

  // ── Stop publishing on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopLocationPublishing();
    };
  }, []);

  // ── Track my live position during Stage A (Directions origin) ────────────
  // Separate from startLocationPublishing — that one pushes to RTDB for the
  // donor's tracking screen; this one feeds the on-device route polyline.

  useEffect(() => {
    if (donation?.status !== "pickup_scheduled") {
      setMyLocation(null);
      setRouteInfo(null);
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 8000,
          distanceInterval: 25,
        },
        (loc) => {
          setMyLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );
    })().catch((err) => {
      if (__DEV__) console.warn("[self-pickup] location watch error:", err);
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [donation?.status]);

  // ── CTAs ──────────────────────────────────────────────────────────────────

  const handleFoodCollected = async () => {
    if (!donationId || !user?.uid || ctaBusy) return;
    setCtaBusy(true);
    try {
      await updateDeliveryStatus(donationId, "in_transit");
      stopPublishRef.current?.();
      stopPublishRef.current = null;
      Alert.alert(
        "Food Collected! 🎉",
        "Great! Now head home and confirm receipt when done.",
      );
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setCtaBusy(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!donation || !user?.uid || ctaBusy) return;
    setCtaBusy(true);
    try {
      await completeDelivery({
        donationId: donation.id,
        taskId: null,
        donorId: donation.donorId,
        deliveryAgentId: user.uid,
        deliveryAgentType: "receiver",
      });
      void triggerDeliveryCompleted(
        [donation.donorId, user.uid],
        "Donation Received! 🙏",
        "The receiver has successfully collected the food donation.",
      );
      Alert.alert(
        "Donation Complete! ✅",
        "Thank you for collecting the food. You've earned 100 reward points!",
        [{ text: "Great!", onPress: () => router.replace("/(tabs)" as never) }],
      );
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setCtaBusy(false);
    }
  };

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading || !donation) {
    return (
      <SafeAreaView style={st.safe} edges={["top", "bottom"]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={Brand.main} />
          <Text style={st.loadingText}>Loading delivery…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickupLat = donation.pickupLocation.latitude;
  const pickupLng = donation.pickupLocation.longitude;
  const isStageA = donation.status === "pickup_scheduled";
  const isStageB = donation.status === "in_transit";
  const stageInfo = stageBadge(donation.status);
  const accentColor = stageInfo.color;

  return (
    <SafeAreaView style={st.safe} edges={["top", "bottom"]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={st.header}>
        <TouchableOpacity
          style={st.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f2419" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t("selfPickup.screenTitle")}</Text>
        <View style={st.backBtn} />
      </View>

      {/* ── Stage badge ──────────────────────────────────────────────────── */}
      <View style={[st.stageBanner, { borderLeftColor: accentColor }]}>
        <View style={[st.stageDot, { backgroundColor: accentColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[st.stageLabel, { color: accentColor }]}>
            {stageInfo.label}
          </Text>
          <Text style={st.stageSub}>
            {stageInfo.sub}
            {isStageA && routeInfo
              ? ` · ${routeInfo.distanceKm.toFixed(1)} km · ${Math.round(routeInfo.durationMin)} min`
              : ""}
          </Text>
        </View>
      </View>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <View style={[st.mapWrapper, { height: MAP_HEIGHT }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: pickupLat,
            longitude: pickupLng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {/* Pickup pin */}
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            pinColor={Brand.main}
            title={t("selfPickup.pickupAddress")}
            description={donation.pickupAddress}
          />

          {/* My current location pin (Stage A only) */}
          {isStageA && myLocation && (
            <Marker coordinate={myLocation} title="You" pinColor="#2563eb" />
          )}

          {/* Route: my location → pickup point (Stage A only) */}
          {isStageA && myLocation && (
            <MapViewDirections
              origin={myLocation}
              destination={{ latitude: pickupLat, longitude: pickupLng }}
              apikey={GOOGLE_MAPS_APIKEY}
              mode="DRIVING"
              strokeWidth={4}
              strokeColor={accentColor}
              onReady={(result: MapDirectionsResponse) => {
                setRouteInfo({
                  distanceKm: result.distance,
                  durationMin: result.duration,
                });
                mapRef.current?.fitToCoordinates(result.coordinates, {
                  edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
                  animated: true,
                });
              }}
              onError={(errorMessage) => {
                if (__DEV__) {
                  console.warn(
                    `[self-pickup] Directions error: ${errorMessage}`,
                  );
                }
              }}
            />
          )}
        </MapView>
      </View>

      {/* ── Scrollable bottom panel ──────────────────────────────────────── */}
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Donor info card */}
        <View style={st.card}>
          <View style={[st.cardIconBox, { backgroundColor: "#d4edda" }]}>
            <Text style={st.cardIconEmoji}>🏠</Text>
          </View>
          <View style={st.cardInfo}>
            <Text style={st.cardLabel}>{t("selfPickup.donorContact")}</Text>
            <Text style={st.cardName}>{donorName}</Text>
            <Text style={st.cardAddress} numberOfLines={2}>
              {donation.pickupAddress}
            </Text>
          </View>
        </View>

        {/* Food details card */}
        <View style={st.card}>
          <View style={[st.cardIconBox, { backgroundColor: "#fef9e7" }]}>
            <Text style={st.cardIconEmoji}>🍱</Text>
          </View>
          <View style={st.cardInfo}>
            <Text style={st.cardLabel}>Food Details</Text>
            <Text style={st.cardName}>{donation.foodDescription}</Text>
            <Text style={st.cardAddress}>
              {donation.quantity} servings · {donation.dietaryType}
            </Text>
          </View>
        </View>

        {/* Navigate button (Stage A only) */}
        {isStageA && (
          <TouchableOpacity
            style={[st.navigateBtn, { borderColor: accentColor }]}
            activeOpacity={0.8}
            onPress={() =>
              openNavigation(pickupLat, pickupLng, donation.pickupAddress, t)
            }
          >
            <Ionicons name="navigate-outline" size={20} color={accentColor} />
            <Text style={[st.navigateTxt, { color: accentColor }]}>
              {t("selfPickup.navigateToPickup")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Completion card (Stage B) */}
        {isStageB && (
          <View style={[st.completionCard, { borderColor: accentColor }]}>
            <Text style={st.completionEmoji}>🎉</Text>
            <Text style={[st.completionTitle, { color: accentColor }]}>
              You have the food!
            </Text>
            <Text style={st.completionSub}>
              Tap the button below once you are home and have the donation
              safely in your possession.
            </Text>
          </View>
        )}

        {/* Safety card */}
        <View style={st.safetyCard}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={Brand.main}
          />
          <View style={{ flex: 1 }}>
            <Text style={st.safetyTitle}>Your safety is our priority</Text>
            <Text style={st.safetySub}>
              Inspect food quality before accepting. Report any issues.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ── CTA button ──────────────────────────────────────────────────── */}
      <View style={st.ctaWrap}>
        {isStageA && (
          <TouchableOpacity
            style={[
              st.ctaBtn,
              { backgroundColor: accentColor },
              ctaBusy && { opacity: 0.7 },
            ]}
            activeOpacity={0.85}
            onPress={handleFoodCollected}
            disabled={ctaBusy}
          >
            {ctaBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={st.ctaEmoji}>✅</Text>
                <Text style={st.ctaTxt}>{t("selfPickup.confirmPickup")}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isStageB && (
          <TouchableOpacity
            style={[
              st.ctaBtn,
              { backgroundColor: accentColor },
              ctaBusy && { opacity: 0.7 },
            ]}
            activeOpacity={0.85}
            onPress={handleMarkReceived}
            disabled={ctaBusy}
          >
            {ctaBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={st.ctaEmoji}>🏁</Text>
                <Text style={st.ctaTxt}>Mark as Received</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {!isStageA && !isStageB && (
          <View style={[st.ctaBtn, { backgroundColor: "#d1d5db" }]}>
            <Text style={[st.ctaTxt, { color: "#6b7280" }]}>
              {donation.status === "delivered"
                ? "Donation Completed ✅"
                : "Waiting…"}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4FBF7" },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 15, color: "#6b7280" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0f2419" },

  stageBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderLeftWidth: 4,
    gap: 10,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageLabel: { fontSize: 14, fontWeight: "700" },
  stageSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },

  mapWrapper: { width: "100%", overflow: "hidden", backgroundColor: "#d6ede0" },

  scroll: { flex: 1, backgroundColor: "#F4FBF7" },
  scrollContent: { padding: 14, paddingBottom: 20, gap: 12 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardIconEmoji: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  cardAddress: { fontSize: 12, color: "#6b7280", lineHeight: 17 },

  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  navigateTxt: { fontSize: 15, fontWeight: "700" },

  completionCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    gap: 8,
    borderWidth: 2,
  },
  completionEmoji: { fontSize: 36 },
  completionTitle: { fontSize: 18, fontWeight: "700" },
  completionSub: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
  },

  safetyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0faf4",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d6ede0",
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Brand.main,
    marginBottom: 2,
  },
  safetySub: { fontSize: 11, color: "#6b7280" },

  ctaWrap: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: 20,
    backgroundColor: "#F4FBF7",
    borderTopWidth: 1,
    borderTopColor: "#e8f0eb",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    height: 56,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  ctaEmoji: { fontSize: 22 },
  ctaTxt: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
