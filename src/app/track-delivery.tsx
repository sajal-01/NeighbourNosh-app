/**
 * track-delivery.tsx  (Donor's view)
 *
 * Shows the donor real-time progress of their donation, regardless of whether
 * a volunteer or the receiver themselves (self-pickup) is transporting it.
 *
 * Data sources:
 *  - Firestore  `donations/{id}`  → live status + delivery agent info
 *  - Firestore  `users/{uid}`     → delivery agent name/rating (one-time fetch)
 *  - RTDB       `active_deliveries/{id}` → live agent location (every 7 s)
 *
 * The screen adapts automatically using `deliveryAgentType`:
 *   "volunteer" → shows volunteer card + scooter marker
 *   "receiver"  → shows "Self Pickup by Receiver" card + walking marker
 *   null        → "Searching for volunteer..."
 */

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections, {
  type MapDirectionsResponse,
} from "react-native-maps-directions";
import { Image } from "expo-image";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { Brand } from "@/constants/theme";
import { listenToDonationById, type DonationDoc } from "@/lib/donation-service";
import {
  subscribeToDeliveryLocation,
  type ActiveDeliveryLocation,
} from "@/lib/delivery-service";
import { callService } from "@/lib/call-service";

const db = getFirestore();
const { height: SCREEN_H } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(SCREEN_H * 0.42);

// Directions API key — set EXPO_PUBLIC_GOOGLE_MAPS in your .env.
// (Same key as your Maps SDK key, with the Directions API enabled.)
const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS ?? "";

// Support contact — set EXPO_PUBLIC_SUPPORT_PHONE / EXPO_PUBLIC_SUPPORT_EMAIL in your .env.
const SUPPORT_PHONE_NUMBER =
  process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "+910000000000";
const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@example.com";

// ── Agent profile loaded from Firestore ───────────────────────────────────────

interface AgentProfile {
  name: string;
  avatarUrl?: string;
  mobileNumber?: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(status: string, deliveryAgentType: string | null): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted — Searching for Volunteer";
    case "pickup_scheduled":
      return deliveryAgentType === "receiver"
        ? "Receiver En Route to Pickup"
        : "Volunteer On The Way";
    case "picked_up":
    case "in_transit":
      return "Food In Transit 🚚";
    case "delivered":
      return "Delivered ✅";
    case "expired":
      return "Expired";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusDotColor(status: string): string {
  switch (status) {
    case "pickup_scheduled":
    case "picked_up":
    case "in_transit":
      return Brand.main;
    case "delivered":
      return "#22c55e";
    case "accepted":
      return "#f97316";
    default:
      return "#9ca3af";
  }
}

// ── Map marker components ────────────────────────────────────────────────────

function PickupMarkerView({ name }: { name: string }) {
  return (
    <View style={mk.card}>
      <View style={mk.greenCircle}>
        <Text style={mk.circleIcon}>📍</Text>
      </View>
      <View style={mk.cardText}>
        <Text style={mk.cardLabel}>Pickup</Text>
        <Text style={mk.cardName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

function AgentMarkerView({
  agentType,
}: {
  agentType: "volunteer" | "receiver";
}) {
  return (
    <View style={mk.agentWrap}>
      <View style={mk.bubble}>
        <Text style={mk.bubbleText}>
          {agentType === "volunteer" ? "Volunteer" : "Receiver"}
        </Text>
      </View>
      <View style={mk.bubbleTail} />
      <View style={mk.agentCircle}>
        <Text style={mk.agentEmoji}>
          {agentType === "volunteer" ? "🛵" : "🚶"}
        </Text>
      </View>
    </View>
  );
}

const mk = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 8,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    maxWidth: 172,
  },
  greenCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Brand.main,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  circleIcon: { fontSize: 14 },
  cardText: { flexShrink: 1 },
  cardLabel: { fontSize: 9, color: "#888", fontWeight: "500", marginBottom: 1 },
  cardName: { fontSize: 11, fontWeight: "700", color: "#0f2419" },
  agentWrap: { alignItems: "center" },
  bubble: {
    backgroundColor: "#e8f5ec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: "#b2d8be",
  },
  bubbleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Brand.main,
    textAlign: "center",
  },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#b2d8be",
    marginBottom: 2,
  },
  agentCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0faf4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: Brand.main,
  },
  agentEmoji: { fontSize: 24 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TrackDeliveryScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { t } = useTranslation();

  const [donation, setDonation] = useState<DonationDoc | null>(null);
  const [loadingDonation, setLoadingDonation] = useState(true);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [agentLocation, setAgentLocation] =
    useState<ActiveDeliveryLocation | null>(null);
  // Real route metrics from the Directions API (distance in km, duration in min).
  const [routeInfo, setRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);

  // ── Get Help modal ─────────────────────────────────────────────────────────
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  const handleCallSupport = () => {
    setHelpModalVisible(false);
    callService.call(SUPPORT_PHONE_NUMBER);
  };

  const handleEmailSupport = () => {
    setHelpModalVisible(false);
    const subject = encodeURIComponent(`Help with donation #${id ?? ""}`);
    const body = encodeURIComponent(
      `Hi Support Team,\n\nI need help with my donation.\n\nDonation ID: ${
        id ?? "N/A"
      }\nStatus: ${donation?.status ?? "N/A"}\n\nDetails:\n`,
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(
        "No Email App Found",
        "We couldn't open your email app. Please email us directly at " +
          SUPPORT_EMAIL,
      );
    });
  };

  // ── Subscribe to donation ─────────────────────────────────────────────────

  useEffect(() => {
    if (!id) {
      setLoadingDonation(false);
      return;
    }
    const unsub = listenToDonationById(id, (d) => {
      setDonation(d);
      setLoadingDonation(false);
    });
    return unsub;
  }, [id]);

  // ── Load agent profile once deliveryAgentId is known ─────────────────────

  useEffect(() => {
    if (!donation?.deliveryAgentId) {
      setAgentProfile(null);
      return;
    }
    getDoc(doc(db, "users", donation.deliveryAgentId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data()!;
          setAgentProfile({
            name: (d.name as string) || "Delivery Agent",
            avatarUrl: (d.photoURL as string) || undefined,
            mobileNumber: (d.mobileNumber as string) || "+910000000000",
          });
        } else {
          setAgentProfile({ name: "Delivery Agent" });
        }
      })
      .catch(() => setAgentProfile({ name: "Delivery Agent" }));
  }, [donation?.deliveryAgentId]);

  // ── Subscribe to live agent location from RTDB ────────────────────────────

  useEffect(() => {
    if (!id) return;
    setRouteInfo(null);
    const unsub = subscribeToDeliveryLocation(id, (loc) => {
      setAgentLocation(loc);
    });
    return unsub;
  }, [id]);

  // ── Recenter map ─────────────────────────────────────────────────────────

  const handleRecenter = () => {
    if (!donation) return;
    mapRef.current?.animateToRegion(mapRegion, 500);
  };

  // ── Not found / loading ───────────────────────────────────────────────────

  if (loadingDonation) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.errorWrap}>
          <ActivityIndicator size="large" color={Brand.main} />
          <Text style={s.errorMsg}>Loading delivery…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!donation || !id) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.errorWrap}>
          <Text style={s.errorMsg}>Donation not found.</Text>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text
              style={{ color: Brand.main, fontWeight: "600", marginTop: 12 }}
            >
              ← {t("common.back")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived display values ────────────────────────────────────────────────

  const pickupLat = donation.pickupLocation.latitude;
  const pickupLng = donation.pickupLocation.longitude;

  // Use live agent location if available, otherwise default to pickup point
  const riderLat = agentLocation?.latitude ?? pickupLat;
  const riderLng = agentLocation?.longitude ?? pickupLng;

  const midLat = (pickupLat + riderLat) / 2;
  const midLng = (pickupLng + riderLng) / 2;
  const latSpan = Math.abs(pickupLat - riderLat);
  const lngSpan = Math.abs(pickupLng - riderLng);

  const mapRegion = {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: Math.max(latSpan * 1.7, 0.014),
    longitudeDelta: Math.max(lngSpan * 1.6, 0.02),
  };

  const dotColor = statusDotColor(donation.status);
  const agentType = donation.deliveryAgentType;
  const hasLiveLocation = !!agentLocation;
  // Volunteers ride a scooter; self-pickup receivers travel on foot.
  // const directionsMode = agentType === "volunteer" ? "DRIVING" : "WALKING";
  const agentLabel =
    agentType === "volunteer"
      ? "Volunteer"
      : agentType === "receiver"
        ? "Receiver (Self Pickup)"
        : null;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t("trackDelivery.screenTitle")}</Text>
          {/*<Text style={s.headerLeaf}>🍃</Text>*/}
        </View>
      </View>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      {donation.status !== "delivered" && <View style={[s.mapContainer, { height: MAP_HEIGHT }]}>
        {/* Live tracking pill */}
        <View style={s.liveBar} pointerEvents="none">
          <View
            style={[
              s.liveDot,
              { backgroundColor: hasLiveLocation ? Brand.main : "#aaa" },
            ]}
          />
          <Text style={s.liveText}>
            {hasLiveLocation
              ? t("trackDelivery.liveTracking")
              : "Tracking Pending"}
          </Text>
          {hasLiveLocation && (
            <Text style={s.liveMuted}>
              {routeInfo
                ? ` · ${routeInfo.distanceKm.toFixed(1)} km away`
                : " · Updates every 7s"}
            </Text>
          )}
        </View>

        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Route polyline: agent → pickup, following actual roads/paths */}
          {hasLiveLocation && agentLocation && (
            <MapViewDirections
              origin={{
                latitude: agentLocation.latitude,
                longitude: agentLocation.longitude,
              }}
              destination={{ latitude: pickupLat, longitude: pickupLng }}
              apikey={GOOGLE_MAPS_APIKEY}
              // mode={directionsMode}
              mode="DRIVING"
              strokeWidth={3.5}
              strokeColor="#1a7a3c"
              lineJoin="round"
              lineCap="round"
              onReady={(result: MapDirectionsResponse) => {
                setRouteInfo({
                  distanceKm: result.distance,
                  durationMin: result.duration,
                });
              }}
              onError={(errorMessage) => {
                if (__DEV__) {
                  console.warn(
                    `[track-delivery] Directions error: ${errorMessage}`,
                  );
                }
              }}
            />
          )}

          {/* Pickup marker */}
          <Marker
            coordinate={{ latitude: pickupLat, longitude: pickupLng }}
            anchor={{ x: 0.13, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PickupMarkerView name={donation.pickupAddress} />
          </Marker>

          {/* Agent location marker (only when live location is available) */}
          {hasLiveLocation && agentType && (
            <Marker
              coordinate={{ latitude: riderLat, longitude: riderLng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={true}
            >
              <AgentMarkerView agentType={agentType} />
            </Marker>
          )}
        </MapView>

        {/* Re-center button */}
        <TouchableOpacity
          style={s.recenterBtn}
          onPress={handleRecenter}
          activeOpacity={0.85}
        >
          <View style={s.recenterInner}>
            <View style={s.crossH} />
            <View style={s.crossV} />
            <View style={s.recenterRing} />
          </View>
        </TouchableOpacity>
      </View>}

      {/* ── Bottom Panel ────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* 1. Status row */}
        <View style={s.statusRow}>
          <View style={s.statusLeft}>
            <View style={[s.statusDot, { backgroundColor: dotColor }]} />
            <Text style={[s.statusText, { color: dotColor }]}>
              {statusLabel(donation.status, agentType ?? null)}
            </Text>
          </View>
          {hasLiveLocation && (
            <View style={s.liveBadge}>
              <Text style={s.liveBadgeBar}>▌▌▌</Text>
              <Text style={s.liveBadgeTxt}>Live</Text>
            </View>
          )}
        </View>

        {/* 2. Delivery mode info */}
        <View style={s.infoCard}>
          <View style={s.infoSide}>
            <Text style={s.infoIcon}>
              {agentType === "volunteer"
                ? "🛵"
                : agentType === "receiver"
                  ? "🚶"
                  : "🔍"}
            </Text>
            <View>
              <Text style={s.infoLabel}>Delivery Method</Text>
              <Text style={s.infoValue}>
                {agentType === "volunteer"
                  ? "Volunteer Delivery"
                  : agentType === "receiver"
                    ? "Self Pickup"
                    : "Pending Assignment"}
              </Text>
            </View>
          </View>
          <View style={s.infoVDivider} />
          <View style={s.infoSide}>
            <Text style={s.infoIcon}>📦</Text>
            <View>
              <Text style={s.infoLabel}>Food</Text>
              <Text style={s.infoValue}>{donation.quantity} Servings</Text>
            </View>
          </View>
        </View>

        {/* 3. Responsible person card */}
        <Text style={s.sectionLabel}>Responsible Person</Text>
        {agentType && agentLabel ? (
          <View style={s.volunteerCard}>
            {agentProfile?.avatarUrl ? (
              <Image
                source={{ uri: agentProfile.avatarUrl }}
                style={s.volunteerAvatar}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  s.volunteerAvatar,
                  { alignItems: "center", justifyContent: "center" },
                ]}
              >
                <Text style={{ fontSize: 26 }}>
                  {agentType === "volunteer" ? "🛵" : "🚶"}
                </Text>
              </View>
            )}
            <View style={s.volunteerInfo}>
              <Text style={s.volunteerName}>
                {agentProfile?.name ?? "Loading…"}
              </Text>
              <Text style={s.volunteerMeta}>{agentLabel}</Text>
            </View>
            {donation.status !== "delivered" && (
              <TouchableOpacity
                style={s.callBtn}
                activeOpacity={0.8}
                onPress={() =>
                  callService.call(agentProfile?.mobileNumber as string)
                }
              >
                <Text style={s.callBtnIcon}>📞</Text>
                <Text style={s.callBtnText}>{t("track.call")}</Text>
              </TouchableOpacity>)}
          </View>
        ) : (
          <View style={s.volunteerCard}>
            <View
              style={[
                s.volunteerAvatar,
                {
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f0f0f0",
                },
              ]}
            >
              <Text style={{ fontSize: 24 }}>🔍</Text>
            </View>
            <View style={s.volunteerInfo}>
              <Text style={s.volunteerName}>Searching…</Text>
              <Text style={s.volunteerMeta}>
                {donation.deliveryMode === "volunteer"
                  ? "Looking for a volunteer nearby"
                  : "Awaiting receiver selection"}
              </Text>
            </View>
          </View>
        )}

        {/* 4. Pickup location */}
        <View style={s.dropoffCard}>
          <View style={s.dropoffIconBox}>
            <Text style={s.dropoffIconTxt}>📍</Text>
          </View>
          <View style={s.dropoffInfo}>
            <Text style={s.dropoffLabel}>
              {t("trackDelivery.pickupLocation")}
            </Text>
            <Text style={s.dropoffName} numberOfLines={1}>
              {donation.pickupAddress.split(",")[0]}
            </Text>
            <Text style={s.dropoffAddress} numberOfLines={2}>
              {donation.pickupAddress}
            </Text>
          </View>
        </View>

        {/* 5. Drop-off location (if known) */}
        {donation.dropOffAddress && (
          <View style={s.dropoffCard}>
            <View style={[s.dropoffIconBox, { backgroundColor: "#e3eeff" }]}>
              <Text style={s.dropoffIconTxt}>🏛</Text>
            </View>
            <View style={s.dropoffInfo}>
              <Text style={s.dropoffLabel}>
                {t("trackDelivery.dropOffLocation")}
              </Text>
              <Text style={s.dropoffName} numberOfLines={1}>
                {donation.dropOffAddress.split(",")[0]}
              </Text>
              <Text style={s.dropoffAddress} numberOfLines={2}>
                {donation.dropOffAddress}
              </Text>
            </View>
          </View>
        )}

        {/* 6. Delivery details */}
        <Text style={s.sectionLabel}>Delivery Details</Text>
        <View style={s.detailsCard}>
          <View style={s.detailSide}>
            <Text style={s.detailIcon}>📦</Text>
            <View>
              <Text style={s.detailValue}>{donation.quantity} Servings</Text>
              <Text style={s.detailSub}>Food Type: {donation.dietaryType}</Text>
            </View>
          </View>
          <View style={s.infoVDivider} />
          <View style={s.detailSide}>
            <Text style={s.detailIcon}>📍</Text>
            <View>
              <Text style={s.detailSub}>{t("trackDelivery.status")}</Text>
              <Text style={s.detailValue}>
                {donation.status === "delivered" ? "Delivered ✅" : "Active"}
              </Text>
            </View>
          </View>
        </View>

        {/* 7. Help */}
        <View style={s.helpCard}>
          <View style={s.helpIconBox}>
            <Text style={s.helpIconTxt}>🎧</Text>
          </View>
          <View style={s.helpInfo}>
            <Text style={s.helpTitle}>Need help with this donation?</Text>
            <Text style={s.helpSub}>Contact support for any issues.</Text>
          </View>
          <TouchableOpacity
            style={s.getHelpBtn}
            activeOpacity={0.8}
            onPress={() => setHelpModalVisible(true)}
          >
            <Text style={s.getHelpTxt}>Get Help →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Get Help modal ──────────────────────────────────────────────── */}
      <Modal
        visible={helpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpModalVisible(false)}
      >
        <Pressable
          style={s.modalBackdrop}
          onPress={() => setHelpModalVisible(false)}
        >
          <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Need Help?</Text>
            <Text style={s.modalSubtitle}>
              Choose how you'd like to reach us about this donation.
            </Text>

            <TouchableOpacity
              style={s.modalOption}
              activeOpacity={0.75}
              onPress={handleCallSupport}
            >
              <View style={[s.modalOptionIcon, { backgroundColor: "#e6f4ea" }]}>
                <Text style={s.modalOptionEmoji}>📞</Text>
              </View>
              <View style={s.modalOptionText}>
                <Text style={s.modalOptionTitle}>Call Support Team</Text>
                <Text style={s.modalOptionSub}>
                  Speak with someone right away
                </Text>
              </View>
              <Text style={s.modalChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.modalOption}
              activeOpacity={0.75}
              onPress={handleEmailSupport}
            >
              <View style={[s.modalOptionIcon, { backgroundColor: "#e3eeff" }]}>
                <Text style={s.modalOptionEmoji}>✉️</Text>
              </View>
              <View style={s.modalOptionText}>
                <Text style={s.modalOptionTitle}>Write Feedback</Text>
                <Text style={s.modalOptionSub}>
                  Email us with the details
                </Text>
              </View>
              <Text style={s.modalChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.modalCancelBtn}
              activeOpacity={0.75}
              onPress={() => setHelpModalVisible(false)}
            >
              <Text style={s.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorMsg: { fontSize: 16, color: "#555", textAlign: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#fff",
    position: "relative",
  },
  backBtn: { position: "absolute", left: 14, padding: 4, zIndex: 1 },
  backArrow: { fontSize: 22, color: "#333", fontWeight: "500" },
  headerCenter: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 19, fontWeight: "700", color: Brand.main },
  headerLeaf: { fontSize: 18 },
  bellWrap: { position: "absolute", right: 14, padding: 4 },
  bellIcon: { fontSize: 22 },
  bellBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#e53935",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  bellBadgeTxt: { color: "#fff", fontSize: 9, fontWeight: "700" },

  mapContainer: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#e5e3df",
  },

  liveBar: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.93)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  liveText: { fontSize: 12, fontWeight: "700", color: "#1a1a1a" },
  liveMuted: { fontSize: 11, color: "#666" },

  recenterBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10,
  },
  recenterInner: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  recenterRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#555",
    position: "absolute",
  },
  crossH: {
    position: "absolute",
    width: 22,
    height: 2,
    backgroundColor: "#555",
    borderRadius: 1,
  },
  crossV: {
    position: "absolute",
    width: 2,
    height: 22,
    backgroundColor: "#555",
    borderRadius: 1,
  },

  scroll: { flex: 1, backgroundColor: "#f2f3f5" },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 15, fontWeight: "700" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: "#b8d4c2",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#f0faf4",
  },
  liveBadgeBar: { fontSize: 9, color: Brand.main, letterSpacing: 1 },
  liveBadgeTxt: { fontSize: 12, fontWeight: "700", color: Brand.main },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  infoSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  infoVDivider: { width: 1, height: 36, backgroundColor: "#e8ece9" },
  infoIcon: { fontSize: 22 },
  infoLabel: { fontSize: 11, color: "#888", marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: "700", color: "#0f2419" },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: -4,
    marginTop: 2,
    marginLeft: 2,
  },

  volunteerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  volunteerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    flexShrink: 0,
    backgroundColor: "#d0eada",
  },
  volunteerInfo: { flex: 1 },
  volunteerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 4,
  },
  volunteerMeta: { fontSize: 13, color: "#666" },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#b8d4c0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f0faf3",
  },
  callBtnIcon: {
    fontSize: 13,
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Brand.main,
  },

  dropoffCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dropoffIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  dropoffIconTxt: { fontSize: 20 },
  dropoffInfo: { flex: 1 },
  dropoffLabel: { fontSize: 11, color: "#888", marginBottom: 3 },
  dropoffName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 3,
  },
  dropoffAddress: { fontSize: 12, color: "#666", lineHeight: 17 },

  detailsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  detailSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  detailIcon: { fontSize: 22 },
  detailValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  detailSub: { fontSize: 12, color: "#888" },

  helpCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  helpIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e6f4ea",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  helpIconTxt: { fontSize: 18 },
  helpInfo: { flex: 1 },
  helpTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  helpSub: { fontSize: 12, color: "#888" },
  getHelpBtn: {
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  getHelpTxt: { fontSize: 13, fontWeight: "600", color: "#333" },

  // ── Get Help modal ──────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e0e0e0",
    alignSelf: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f2419",
    textAlign: "center",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 18,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#eef0ee",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  modalOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalOptionEmoji: { fontSize: 19 },
  modalOptionText: { flex: 1 },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  modalOptionSub: { fontSize: 12, color: "#888" },
  modalChevron: { fontSize: 22, color: "#c4c4c4", flexShrink: 0 },
  modalCancelBtn: {
    marginTop: 4,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#f4f5f4",
  },
  modalCancelTxt: { fontSize: 15, fontWeight: "600", color: "#555" },
});
