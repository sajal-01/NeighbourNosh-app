import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Circle, Marker } from "react-native-maps";
import { useState, useEffect } from "react";
import {
  getFirestore,
  doc,
  onSnapshot,
  GeoPoint,
} from "@react-native-firebase/firestore";
import { useRouter } from "expo-router";
import { Brand, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const db = getFirestore();
const SCAN_RADIUS_KM = 5;

// Geocoding API key — set EXPO_PUBLIC_GOOGLE_MAPS in your .env.
// (Same key used elsewhere for Directions/Distance Matrix, with the
// Geocoding API enabled too.)
const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS ?? "";

// Turns a street address into coordinates via Google's Geocoding API.
// Used as a fallback for claimDonation's dropOffLocation — the receiver's
// saved address already carries lat/lng from when it was first saved, so this
// only runs if that's somehow missing (e.g. an address saved before geocoding
// was wired up on the save-address flow).
async function geocodeAddress(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  if (!GOOGLE_MAPS_APIKEY || !address) return null;
  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_APIKEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") {
      return null;
    }
    return { latitude: loc.lat, longitude: loc.lng };
  } catch {
    return null;
  }
}
import {
  listenToPendingDonations,
  listenToReceiverClaims,
  claimDonation,
  timeAgo,
  haversineKm,
  formatExpiresAt,
  type DonationDoc,
} from "@/lib/donation-service";
import {
  triggerDonationAccepted,
  triggerVolunteerSearch,
} from "@/lib/notifications-api";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "react-i18next";

// ── Local type for saved addresses (mirrors Firestore shape) ────────────────

interface SavedAddressLocal {
  id: string;
  fullAddress: string;
  houseNo: string;
  lat: number;
  lng: number;
  isPrimary?: boolean;
}

// ── Fallback map center ───────────────────────────────────────────────────────

const FALLBACK_LAT = 12.9716;
const FALLBACK_LNG = 77.5946;

// ── Emoji / color helpers ─────────────────────────────────────────────────────

function thumbForDiet(dietaryType: string): { emoji: string; color: string } {
  if (dietaryType === "Veg") return { emoji: "🍚", color: "#d4edda" };
  if (dietaryType === "NonVeg") return { emoji: "🍗", color: "#fde8d8" };
  return { emoji: "🍱", color: "#fef9e7" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FoodCardProps {
  doc: DonationDoc;
  userId?: string;
  distanceKm: number | null;
  onClaimPress: (doc: DonationDoc) => void;
}

function FoodCard({ doc, userId, distanceKm, onClaimPress }: FoodCardProps) {
  const { t } = useTranslation();
  const { emoji, color } = thumbForDiet(doc.dietaryType);
  const isVeg = doc.dietaryType === "Veg";
  const isNonVeg = doc.dietaryType === "NonVeg";
  const time = timeAgo(doc.createdAt);
  const imageUri = doc.imageUrl?.[0] ?? null;

  const isClaimedByMe = doc.receiverId !== null && doc.receiverId === userId;
  const isClaimedByOther = doc.receiverId !== null && doc.receiverId !== userId;
  const isUnclaimed = doc.receiverId === null;

  return (
    <View style={s.foodCard}>
      {/* Left: real image or colored emoji placeholder */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={s.foodThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[s.foodThumb, { backgroundColor: color }]}>
          <Text style={s.foodEmoji}>{emoji}</Text>
        </View>
      )}

      {/* Center: meta */}
      <View style={s.foodMeta}>
        <Text style={s.foodName}>
          {doc.foodDescription} – {doc.quantity} {t("donate.servings")}
        </Text>

        {/* Distance (optional) + time */}
        <View style={s.foodInfoRow}>
          {distanceKm !== null && (
            <>
              <Text style={s.foodInfoText}>
                📍 {distanceKm.toFixed(1)} {t("volunteer.away")}
              </Text>
              <Text style={s.foodInfoDot}>·</Text>
            </>
          )}
          <Text style={s.foodInfoText}>🕐 {time}</Text>
        </View>

        {/* Pickup address — always visible */}
        {!!doc.pickupAddress && (
          <Text style={s.foodInfoText} >
            🏠 {doc.pickupAddress}
          </Text>
        )}

        {/* Expiry badge */}
        {(() => {
          const exp = formatExpiresAt(doc.expiresAt);
          return exp.label ? (
            <View style={s.expiryRow}>
              <Text style={[s.expiryText, { color: exp.color }]}>
                ⏳ {exp.label}
              </Text>
            </View>
          ) : null;
        })()}

        {/* Dietary chip */}
        <View
          style={[
            s.dietChip,
            isVeg
              ? s.dietChipVeg
              : isNonVeg
                ? s.dietChipNonVeg
                : { backgroundColor: "#fef3c7" },
          ]}
        >
          <Text
            style={[
              s.dietChipText,
              isVeg
                ? s.dietTextVeg
                : isNonVeg
                  ? s.dietTextNonVeg
                  : { color: "#92400e" },
            ]}
          >
            {isVeg
              ? "🌿 " + t("dietary.veg")
              : isNonVeg
                ? "🍖 " + t("dietary.nonVeg")
                : "🍱 " + t("dietary.both")}
          </Text>
        </View>

        {/* Delivery tracking row — only when a volunteer is assigned */}
        {doc.assignedVolunteerId !== null && (
          <Text style={s.foodInfoText}>{t("receiver.volunteerAssigned")}</Text>
        )}
      </View>

      {/* Right: claim state chip / button */}
      {isUnclaimed && (
        <TouchableOpacity
          style={s.claimBtn}
          activeOpacity={0.8}
          onPress={() => onClaimPress(doc)}
        >
          <Text style={s.claimBtnText}>{t("receiver.claimFood")}</Text>
        </TouchableOpacity>
      )}

      {isClaimedByMe && (
        <View
          style={[
            s.claimBtn,
            { borderColor: "#15803d", backgroundColor: "#dcfce7" },
          ]}
        >
          <Text style={[s.claimBtnText, { color: "#15803d" }]}>
            {t("receiver.claimedByYou")}
          </Text>
        </View>
      )}

      {isClaimedByOther && (
        <View
          style={[
            s.claimBtn,
            { borderColor: "#adb5bd", backgroundColor: "#f3f4f6" },
          ]}
        >
          <Text style={[s.claimBtnText, { color: "#9ca3af" }]}>
            {t("receiver.claimed")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Claim Card (same visual design as Donor Dashboard Active Donations) ─────

function claimStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "#f97316";
    case "accepted":
      return "#3b82f6";
    case "in_progress":
      return "#50b070";
    case "delivered":
      return "#22c55e";
    case "expired":
    case "cancelled":
      return "#9ca3af";
    default:
      return "#9ca3af";
  }
}

function claimStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case "pending":
      return t("status.pending");
    case "accepted":
      return t("status.accepted");
    case "pickup_scheduled":
      return "Pickup Scheduled";
    case "in_progress":
      return t("status.inProgress");
    case "in_transit":
      return "In Transit";
    case "delivered":
      return t("status.delivered");
    case "expired":
      return t("status.expired");
    case "cancelled":
      return t("status.cancelled");
    default:
      return status;
  }
}

function ClaimCard({
  doc,
  onTrack,
  onGoToPickup,
}: {
  doc: DonationDoc;
  onTrack: () => void;
  onGoToPickup?: () => void;
}) {
  const { t } = useTranslation();
  const color = claimStatusColor(doc.status);
  const foodEmoji =
    doc.dietaryType === "Veg"
      ? "🍚"
      : doc.dietaryType === "NonVeg"
        ? "🍗"
        : "🍱";
  const exp = formatExpiresAt(doc.expiresAt);

  return (
    <View style={[cs.card, { backgroundColor: "#ffffff" }]}>
      {/* Colored left accent strip */}
      <View style={[cs.accentStrip, { backgroundColor: color }]} />
      <View style={cs.body}>
        {/* Top row: image/emoji + meta + status chip */}
        <View style={cs.topRow}>
          {doc.imageUrl?.[0] ? (
            <Image
              source={{ uri: doc.imageUrl[0] }}
              style={cs.foodImg}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                cs.foodImg,
                {
                  backgroundColor: "#e8f5ee",
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={{ fontSize: 28 }}>{foodEmoji}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={cs.nameLine}>
              <Text style={cs.foodName} numberOfLines={1}>
                {doc.foodDescription}
              </Text>
              <View style={[cs.statusChip, { backgroundColor: color }]}>
                <Text style={cs.statusChipTxt}>
                  {claimStatusLabel(doc.status, t)}
                </Text>
              </View>
            </View>
            <Text style={cs.foodQty}>{doc.quantity} servings</Text>
            <Text style={cs.foodLoc}>
              📍 {doc.pickupAddress} · {timeAgo(doc.createdAt)}
            </Text>
            {exp.label ? (
              <Text style={[cs.expiryBadge, { color: exp.color }]}>
                ⏳ {exp.label}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={cs.divider} />

        {/* Bottom section: adapts to deliveryMode */}
        {doc.deliveryMode === "self" ? (
          // Self-pickup flow
          doc.status === "pickup_scheduled" ? (
            <TouchableOpacity
              style={cs.trackBtn}
              onPress={onGoToPickup}
              activeOpacity={0.82}
            >
              <Text style={cs.trackBtnTxt}>{t("receiver.goToPickup")}</Text>
            </TouchableOpacity>
          ) : doc.status === "in_transit" ? (
              <View>
              <View style={cs.pendingContainer}>
              <Text style={{ fontSize: 16, marginRight: 6 }}>🚶</Text>
              <Text style={[cs.pendingText, { flex: 1 }]}>
                Self Pickup — Confirm receipt when home
                </Text>
                </View>
                <TouchableOpacity
                  style={cs.trackBtn}
                  onPress={onGoToPickup}
                  activeOpacity={0.82}
                >
                  <Text style={cs.trackBtnTxt}>{t("volunteerDelivery.confirmDelivery")}</Text>
                </TouchableOpacity>
              </View>
          ) : (
            <View style={cs.pendingContainer}>
              <Text style={{ fontSize: 16, marginRight: 6 }}>🚶</Text>
              <Text style={cs.pendingText}>Self Pickup</Text>
            </View>
          )
        ) : doc.deliveryMode === "volunteer" ? (
          // Volunteer delivery flow
          doc.assignedVolunteerId === null ? (
            <View style={cs.pendingContainer}>
              <MaterialIcons
                name="person-search"
                size={20}
                color={Brand.main}
                style={{ marginRight: 6 }}
              />
              <Text style={[cs.pendingText, { flex: 1 }]}>
                {t("receiver.awaitingVolunteer")}
              </Text>
            </View>
          ) : (
            <>
              <Text style={cs.pendingText}>
                {t("receiver.volunteerAssigned")}
              </Text>
              <TouchableOpacity
                style={cs.trackBtn}
                onPress={onTrack}
                activeOpacity={0.82}
              >
                <Text style={cs.trackBtnTxt}>{t("receiver.trackLive")}</Text>
              </TouchableOpacity>
            </>
          )
        ) : // Legacy: no deliveryMode set (backwards compat)
        doc.assignedVolunteerId === null ? (
          <View style={cs.pendingContainer}>
            <MaterialIcons
              name="person-search"
              size={20}
              color={Brand.main}
              style={{ marginRight: 6 }}
            />
            <Text style={[cs.pendingText, { flex: 1 }]}>
              {t("receiver.awaitingVolunteer")}
            </Text>
          </View>
        ) : (
          <>
            <Text style={cs.pendingText}>
              {t("receiver.volunteerAssigned")}
            </Text>
            <TouchableOpacity
              style={cs.trackBtn}
              onPress={onTrack}
              activeOpacity={0.82}
            >
              <Text style={cs.trackBtnTxt}>{t("receiver.trackLive")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  accentStrip: { width: 4 },
  body: { flex: 1, padding: 12 },
  topRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  foodImg: { width: 64, height: 64, borderRadius: 8, flexShrink: 0 },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  foodName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
    lineHeight: 18,
  },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusChipTxt: { color: "#ffffff", fontSize: 11, fontWeight: "600" },
  foodQty: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
    marginBottom: 2,
  },
  foodLoc: { fontSize: 12, color: "#6b7280" },
  expiryBadge: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  divider: { height: 1, backgroundColor: "#f0f0f0", marginVertical: 8 },
  pendingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },

  pendingText: {
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
    marginLeft: 6,
  },
  trackBtn: {
    backgroundColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  trackBtnTxt: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ReceiverHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // Pending donations (real-time)
  const [donations, setDonations] = useState<DonationDoc[]>([]);
  const [donationsLoading, setDonationsLoading] = useState(true);

  // User profile / saved addresses (real-time)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressLocal[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileName, setProfileName] = useState("");
  // Receiver's own active claims (real-time)
  const [activeClaims, setActiveClaims] = useState<DonationDoc[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);

  // Delivery mode selection modal
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [pendingClaimDoc, setPendingClaimDoc] = useState<DonationDoc | null>(
    null,
  );
  const [selectedMode, setSelectedMode] = useState<"volunteer" | "self">(
    "volunteer",
  );
  const [modalClaiming, setModalClaiming] = useState(false);

  // Subscribe to live Firestore pending donations
  useEffect(() => {
    const unsubscribe = listenToPendingDonations((docs) => {
      setDonations(docs);
      setDonationsLoading(false);
    });
    return unsubscribe;
  }, []);

  // Subscribe to this receiver's claimed donations
  useEffect(() => {
    if (!user?.uid) return;
    return listenToReceiverClaims(user.uid, (docs) => {
      setActiveClaims(
        docs.filter((d) =>
          [
            "pending",
            "accepted",
            "pickup_scheduled",
            "picked_up",
            "in_transit",
          ].includes(d.status),
        ),
      );
      setClaimsLoading(false);
    });
  }, [user?.uid]);

  // Real-time listener on user profile → saved addresses
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setSavedAddresses(
        snap.exists()
          ? ((snap.data()?.savedAddresses as SavedAddressLocal[]) ?? [])
          : [],
      );
      setProfileName(snap.exists() ? (snap.data()?.name as string) : "");
      setProfileLoaded(true);
    });
    return unsubscribe;
  }, [user?.uid]);

  // Derive primary address; use its coordinates as the discovery centre
  const primaryAddress = savedAddresses.find((a) => a.isPrimary) ?? null;
  const primaryCoords = primaryAddress
    ? { latitude: primaryAddress.lat, longitude: primaryAddress.lng }
    : null;

  // Filter donations to within 5 km of the primary address
  const visibleDonations =
    primaryCoords !== null
      ? donations.filter(
          (d) =>
            haversineKm(
              primaryCoords.latitude,
              primaryCoords.longitude,
              d.pickupLocation.latitude,
              d.pickupLocation.longitude,
            ) <= SCAN_RADIUS_KM,
        )
      : [];

  // Map centre: primary address → first visible donation → fallback
  const mapCenterLat =
    primaryAddress?.lat ??
    visibleDonations[0]?.pickupLocation.latitude ??
    FALLBACK_LAT;
  const mapCenterLng =
    primaryAddress?.lng ??
    visibleDonations[0]?.pickupLocation.longitude ??
    FALLBACK_LNG;

  // Map pins from live donation data (up to 8)
  const mapMarkers = visibleDonations.slice(0, 8).map((d) => ({
    id: d.id,
    lat: d.pickupLocation.latitude,
    lng: d.pickupLocation.longitude,
  }));

  // Show "Delivery in Progress" only when user has a volunteer-assigned donation
  const hasActiveDelivery = donations.some(
    (d) => d.receiverId === user?.uid && d.assignedVolunteerId !== null,
  );

  // ── Delivery mode modal handler ──────────────────────────────────────────────

  const closeModal = () => {
    if (modalClaiming) return;
    setShowClaimModal(false);
    setPendingClaimDoc(null);
  };

  const handleModalContinue = async () => {
    if (!pendingClaimDoc || !user?.uid || modalClaiming) return;
    const d = pendingClaimDoc;
    const mode = selectedMode;
    const dropOff = primaryAddress?.fullAddress;
    setModalClaiming(true);
    try {
      // Prefer the coordinates already saved with this address (the same
      // lat/lng already trusted above for the nearby-donations distance
      // filter) — only geocode as a fallback if they're missing/invalid,
      // e.g. an address saved before geocoding existed on the save flow.
      let dropOffCoords: { latitude: number; longitude: number } | null =
        primaryAddress &&
        typeof primaryAddress.lat === "number" &&
        typeof primaryAddress.lng === "number" &&
        (primaryAddress.lat !== 0 || primaryAddress.lng !== 0)
          ? { latitude: primaryAddress.lat, longitude: primaryAddress.lng }
          : null;

      if (!dropOffCoords && dropOff) {
        dropOffCoords = await geocodeAddress(dropOff);
      }

      const dropOffLocation = dropOffCoords
        ? new GeoPoint(dropOffCoords.latitude, dropOffCoords.longitude)
        : undefined;

      await claimDonation(d.id, user.uid, mode, dropOff, dropOffLocation);
      if (mode === "volunteer") {
        void triggerVolunteerSearch(
          d.id,
          d.pickupLocation.latitude,
          d.pickupLocation.longitude,
        );
      }
      void triggerDonationAccepted(
        d.donorId,
        "Donation Claimed! 🎉",
        `Your donation of ${d.foodDescription} has been accepted by a receiver.`,
      );
      setShowClaimModal(false);
      setPendingClaimDoc(null);
      Alert.alert(t("receiver.claimedSuccess"), t("receiver.claimedMsg"));
    } catch (e) {
      Alert.alert(
        t("common.error"),
        e instanceof Error ? e.message : t("receiver.claimError"),
      );
    } finally {
      setModalClaiming(false);
    }
  };

  const greeting = !profileLoaded
    ? t("donor.greeting")
    : (() => {
        const name = profileName?.trim() || user?.displayName?.trim();
        return name
          ? t("donor.greetingNamed", { name: name.split(" ")[0] })
          : t("donor.greeting");
      })();

  return (
    <SafeAreaView
      style={[s.safe, { backgroundColor: Brand.main }]}
      edges={["top"]}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.greeting}>{greeting}</Text>
            <Text style={s.subLine}>
              {t("editProfile.roles.receiver.label")} {t("profile.account")}
            </Text>
          </View>
          <Pressable
            style={s.bellWrap}
            accessibilityLabel="Notifications"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/notifications" as any)}
          >
            <Text style={s.bellEmoji}>🔔</Text>
            {/*<View style={s.bellBadge}>
            <Text style={s.bellBadgeTxt}>2</Text>
          </View>*/}
          </Pressable>
        </View>
        {/* ── Action Buttons Row ────────────────────────────────────────────── */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.actionCard}
            activeOpacity={0.85}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/emergency-request" as any)}
          >
            <MaterialCommunityIcons
              name="bell-alert"
              size={30}
              color={Brand.main}
            />
            <Text style={s.actionCardTitle}>
              {t("receiver.broadcastUrgent")}
            </Text>
            <Text style={s.actionCardSub}>{t("receiver.broadcastSub")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionCard, s.actionCardGreen]}
            activeOpacity={0.85}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/(tabs)/receiver-request" as any)}
          >
            <MaterialCommunityIcons
              name="hand-heart-outline"
              size={30}
              color={Brand.main}
            />
            <Text style={s.actionCardTitle}>
              {t("receiver.requestDonation")}
            </Text>
            <Text style={s.actionCardSub}>{t("receiver.requestSub")}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Active Claims Section ────────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>{t("receiver.activeClaims")}</Text>
            <Text style={s.sectionSubtitle}>
              {t("receiver.activeClaimsSub")}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/(tabs)/receiver-claims" as any)}
          >
            <Text style={s.mapLink}>{t("receiver.viewAll")}</Text>
          </TouchableOpacity>
        </View>

        {claimsLoading ? (
          <ActivityIndicator
            size="small"
            color={Brand.main}
            style={{ marginVertical: 12 }}
          />
        ) : activeClaims.length === 0 ? (
          <View style={s.claimsEmpty}>
            <Text style={s.claimsEmptyText}>
              {t("receiver.noActiveClaims")}
            </Text>
          </View>
        ) : (
          activeClaims.map((claim) => (
            <ClaimCard
              key={claim.id}
              doc={claim}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onTrack={() =>
                router.push(`/track-delivery?id=${claim.id}` as any)
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onGoToPickup={() =>
                router.push(`/self-pickup?donationId=${claim.id}` as any)
              }
            />
          ))
        )}

        {/* ── Available Donations Section Header ─────────────────────────── */}
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>
              {t("receiver.availableDonations")}
            </Text>
            <Text style={s.sectionSubtitle}>
              {primaryAddress
                ? `📍 ${primaryAddress.fullAddress.split(",")[0]} · ${t("receiver.mapRadius")}`
                : t("receiver.setAddress")}
            </Text>
          </View>
        </View>

        {/* ── Map ──────────────────────────────────────────────────────────────── */}
        <View style={s.mapWrapper}>
          <MapView
            key={`${mapCenterLat.toFixed(4)}-${mapCenterLng.toFixed(4)}`}
            style={s.map}
            initialRegion={{
              latitude: mapCenterLat,
              longitude: mapCenterLng,
              latitudeDelta: 0.045,
              longitudeDelta: 0.045,
            }}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
            pointerEvents="none"
          >
            {/* Faint green 5 km radius circle */}
            <Circle
              center={{ latitude: mapCenterLat, longitude: mapCenterLng }}
              radius={5000}
              strokeColor="rgba(45,143,84,0.45)"
              fillColor="rgba(45,143,84,0.08)"
              strokeWidth={1.5}
            />

            {/* Live donation pins */}
            {mapMarkers.map((m) => (
              <Marker
                key={m.id}
                coordinate={{ latitude: m.lat, longitude: m.lng }}
                pinColor={Brand.main}
              />
            ))}
          </MapView>

          {/* "5 km radius" pill overlaid on the map */}
          <View style={s.mapRadiusPill} pointerEvents="none">
            <Text style={s.mapRadiusText}>{t("receiver.mapRadius")}</Text>
          </View>
        </View>

        {/* ── Food Cards / Loading / Edge Cases ───────────────────────────── */}
        {!profileLoaded ? (
          <ActivityIndicator
            size="large"
            color={Brand.main}
            style={{ marginVertical: 32 }}
          />
        ) : savedAddresses.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>📍</Text>
            <Text style={s.emptyTitle}>{t("receiver.noAddress")}</Text>
            <Text style={s.emptySub}>{t("receiver.noAddressSub")}</Text>
            <TouchableOpacity
              style={s.ctaBtn}
              activeOpacity={0.82}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push("/add-location" as any)}
            >
              <Text style={s.ctaBtnText}>{t("receiver.addAddress")}</Text>
            </TouchableOpacity>
          </View>
        ) : !primaryAddress ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>🏠</Text>
            <Text style={s.emptyTitle}>{t("receiver.noPrimary")}</Text>
            <Text style={s.emptySub}>{t("receiver.noPrimarySub")}</Text>
            <TouchableOpacity
              style={s.ctaBtn}
              activeOpacity={0.82}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push("/saved-locations" as any)}
            >
              <Text style={s.ctaBtnText}>{t("receiver.setPrimary")}</Text>
            </TouchableOpacity>
          </View>
        ) : donationsLoading ? (
          <ActivityIndicator
            size="large"
            color={Brand.main}
            style={{ marginVertical: 32 }}
          />
        ) : visibleDonations.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>🌿</Text>
            <Text style={s.emptyTitle}>{t("receiver.noFood")}</Text>
            <Text style={s.emptySub}>{t("receiver.noFoodSub")}</Text>
          </View>
        ) : (
          visibleDonations.map((donation) => {
            const distanceKm = haversineKm(
              primaryCoords!.latitude,
              primaryCoords!.longitude,
              donation.pickupLocation.latitude,
              donation.pickupLocation.longitude,
            );
            return (
              <FoodCard
                key={donation.id}
                doc={donation}
                userId={user?.uid}
                distanceKm={distanceKm}
                onClaimPress={(d) => {
                  setPendingClaimDoc(d);
                  setSelectedMode("volunteer");
                  setShowClaimModal(true);
                }}
              />
            );
          })
        )}

        {/* ── Delivery in Progress (only when user has a volunteer-assigned donation) */}
        {hasActiveDelivery && (
          <View style={s.deliveryCard}>
            {/* Left: scooter in circle */}
            <View style={s.scooterCircle}>
              <Text style={s.scooterEmoji}>🛵</Text>
            </View>

            {/* Center: info */}
            <View style={s.deliveryInfo}>
              <Text style={s.deliveryTitle}>
                {t("receiver.deliveryInProgress")}
              </Text>
              <Text style={s.deliveryPartner}>
                {t("receiver.volunteerOnWay")}
              </Text>
              <View style={s.deliveryMetaRow}>
                <Text style={s.deliveryMeta}>{t("receiver.enRoute")}</Text>
                <Text style={s.deliveryMetaDot}>·</Text>
                <Text style={s.deliveryMeta}>
                  {t("receiver.deliveryActive")}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.75}>
                <Text style={s.viewDetailsLink}>
                  {t("receiver.viewDetails")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Right: Track Live CTA */}
            <TouchableOpacity style={s.trackBtn} activeOpacity={0.82}>
              <Text style={s.trackBtnText}>{t("receiver.trackLive")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Delivery Mode Selection Modal ────────────────────────────────────── */}
      <Modal
        visible={showClaimModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={s.modalBackdrop}>
          {/* Tap-to-dismiss area above the sheet */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeModal}
          />

          {/* Sheet — stops touch propagation to backdrop */}
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            {/* Handle bar */}
            <View style={s.modalHandle} />

            <Text style={s.modalTitle}>{t("receiver.howReceive")}</Text>

            {/* Option: Volunteer Delivery */}
            <TouchableOpacity
              style={[
                s.modalOption,
                selectedMode === "volunteer" && s.modalOptionSelected,
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedMode("volunteer")}
            >
              <View style={s.radioCircle}>
                {selectedMode === "volunteer" && <View style={s.radioFill} />}
              </View>
              <View style={s.modalOptionBody}>
                <Text style={s.modalOptionTitle}>
                  {t("receiver.volunteerDelivery")}
                </Text>
                <Text style={s.modalOptionSub}>
                  {t("receiver.volunteerDeliverySub")}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option: Self Pickup */}
            <TouchableOpacity
              style={[
                s.modalOption,
                selectedMode === "self" && s.modalOptionSelected,
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedMode("self")}
            >
              <View style={s.radioCircle}>
                {selectedMode === "self" && <View style={s.radioFill} />}
              </View>
              <View style={s.modalOptionBody}>
                <Text style={s.modalOptionTitle}>
                  {t("receiver.selfPickup")}
                </Text>
                <Text style={s.modalOptionSub}>
                  {t("receiver.selfPickupSub")}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Continue button */}
            <TouchableOpacity
              style={[s.modalContinueBtn, modalClaiming && { opacity: 0.7 }]}
              activeOpacity={0.85}
              onPress={handleModalContinue}
              disabled={modalClaiming}
            >
              {modalClaiming ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={s.modalContinueTxt}>{t("common.continue")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SHADOW = {
  elevation: 3,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
} as const;

const s = StyleSheet.create({
  // ── Root ────────────────────────────────────────────────────────────────────
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Brand.main,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four + Spacing.two,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerLeft: { flex: 1 },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  subLine: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  bellWrap: { position: "relative", padding: 4 },
  bellEmoji: { fontSize: 24 },
  bellBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#e53935",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Brand.main,
  },
  bellBadgeTxt: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },

  // ── ScrollView ───────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 14,
  },

  // ── Urgent Banner ────────────────────────────────────────────────────────────
  urgentBanner: {
    backgroundColor: "#f97316",
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    ...SHADOW,
    elevation: 4,
  },
  urgentBannerIcon: {
    fontSize: 28,
  },
  urgentBannerBody: {
    flex: 1,
  },
  urgentBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  urgentBannerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 16,
  },
  urgentChevron: {
    fontSize: 26,
    color: "#ffffff",
    fontWeight: "600",
    lineHeight: 28,
  },

  // ── Section Header ───────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  mapLink: {
    fontSize: 13,
    fontWeight: "600",
    color: Brand.main,
    marginBottom: 2,
  },

  // ── Map ──────────────────────────────────────────────────────────────────────
  mapWrapper: {
    marginHorizontal: 14,
    borderRadius: 14,
    overflow: "hidden",
    ...SHADOW,
    elevation: 2,
    position: "relative",
  },
  map: {
    width: "100%",
    height: 300,
  },
  mapRadiusPill: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.84)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mapRadiusText: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
  },

  // ── Food Card ────────────────────────────────────────────────────────────────
  foodCard: {
    marginHorizontal: 14,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    ...SHADOW,
  },
  foodThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  foodEmoji: {
    fontSize: 34,
  },
  foodMeta: {
    flex: 1,
    gap: 5,
  },
  foodName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
    lineHeight: 19,
  },
  foodInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  foodInfoText: {
    fontSize: 12,
    color: "#6b7280",
  },
  foodInfoDot: {
    fontSize: 12,
    color: "#adb5bd",
  },
  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  expiryText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Dietary chip
  dietChip: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dietChipVeg: {
    backgroundColor: "#dcfce7",
  },
  dietChipNonVeg: {
    backgroundColor: "#fee2e2",
  },
  dietChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dietTextVeg: {
    color: "#15803d",
  },
  dietTextNonVeg: {
    color: "#dc2626",
  },

  // Claim button
  claimBtn: {
    borderWidth: 1.5,
    borderColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  claimBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Brand.main,
  },

  // ── Delivery in Progress ─────────────────────────────────────────────────────
  deliveryCard: {
    marginHorizontal: 14,
    backgroundColor: "#e8f9ee",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#b6e4c8",
    ...SHADOW,
    elevation: 2,
  },
  scooterCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#c3edd4",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scooterEmoji: {
    fontSize: 26,
  },
  deliveryInfo: {
    flex: 1,
    gap: 3,
  },
  deliveryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
  },
  deliveryPartner: {
    fontSize: 12,
    color: "#374151",
  },
  deliveryMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deliveryMeta: {
    fontSize: 12,
    color: "#4b5563",
  },
  deliveryMetaDot: {
    fontSize: 12,
    color: "#adb5bd",
  },
  viewDetailsLink: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
    marginTop: 2,
  },
  trackBtn: {
    backgroundColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trackBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f2419",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // ── Action buttons row ─────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  actionCard: {
    flex: 1,
    backgroundColor: "#fff8e1",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  actionCardGreen: {
    backgroundColor: "#e8f5ee",
  },
  actionCardIcon: {
    fontSize: 26,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f2419",
    textAlign: "center",
  },
  actionCardSub: {
    fontSize: 11,
    color: "#5a7a62",
    textAlign: "center",
    lineHeight: 15,
  },

  // ── Active claims empty inline state ─────────────────────────────────
  claimsEmpty: {
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  claimsEmptyText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
  },

  // ── CTA button (used in edge-case empty states) ─────────────────────────
  ctaBtn: {
    marginTop: 8,
    backgroundColor: Brand.main,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 11,
    alignSelf: "center" as const,
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  ctaBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },

  // ── Delivery Mode Modal ──────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
  },
  modalOptionSelected: {
    borderColor: Brand.main,
    backgroundColor: "#f0faf4",
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Brand.main,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Brand.main,
  },
  modalOptionBody: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  modalOptionSub: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 17,
  },
  modalContinueBtn: {
    backgroundColor: Brand.main,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 2,
  },
  modalContinueTxt: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
