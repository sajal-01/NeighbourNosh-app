import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  getFirestore,
  doc as firestoreDoc,
  getDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import {
  listenToDonorDonations,
  formatExpiresAt,
  timeAgo,
  createDonationFromRequest,
  type DonationDoc,
} from "@/lib/donation-service";
import {
  listenToDonorRequests,
  updateRequestAssignedDonation,
  type FoodRequestDoc,
} from "@/lib/request-service";
import ScreenHeader from "@/components/screen-header";
import DonationDrawer from "@/components/donation-drawer";
import { callService } from "@/lib/call-service";

const db = getFirestore();

// ── Types ────────────────────────────────────────────────────────────────────

type TrackTab = "donations" | "requests";

interface ReceiverProfile {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function openDropOffInMaps(doc: DonationDoc, t: (k: string) => string): void {
  const { latitude, longitude } = doc.pickupLocation;
  const origin = `${latitude},${longitude}`;
  const destination = encodeURIComponent(doc.dropOffAddress ?? "");
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  Linking.openURL(url).catch(() =>
    Alert.alert(t("common.error"), t("track.openMapsError")),
  );
}

function statusLabel(status: string, t: (k: string) => string): string {
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

function reqStatusColor(status: string): string {
  switch (status) {
    case "open":
      return "#f97316";
    case "matched":
      return "#3b82f6";
    case "fulfilled":
      return "#22c55e";
    case "cancelled":
      return "#9ca3af";
    default:
      return "#9ca3af";
  }
}

function reqStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case "open":
      return t("status.open");
    case "matched":
      return t("status.matched");
    case "fulfilled":
      return t("status.fulfilled");
    case "cancelled":
      return t("status.cancelled");
    default:
      return status;
  }
}

function dietaryLabel(type: string, t: (k: string) => string): string {
  switch (type) {
    case "Veg":
      return t("dietary.veg");
    case "NonVeg":
      return t("dietary.nonVeg");
    case "Both":
      return t("dietary.both");
    default:
      return type;
  }
}

// ── Extended donation type ────────────────────────────────────────────────────
// These fields exist in the Firestore "donations" schema but may not yet be
// declared on DonationDoc in donation-service.ts. Extending locally means the
// card can render every schema field without needing that file changed first —
// if/when it's added there, this local extension can simply be removed.

type DonationDocWithDelivery = DonationDoc & {
  deliveryMode?: "self" | "volunteer" | null;
  deliveryAgentId?: string | null;
  deliveryAgentType?: "receiver" | "volunteer" | null;
  donorId?: string;
  pickupGeohash?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claimedAt?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deliveredAt?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedAt?: any;
};

// Firestore GeoPoint → "lat°, lng°" for display.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGeoPoint(gp: any): string | null {
  if (!gp) return null;
  const lat = typeof gp.latitude === "number" ? gp.latitude : gp?._latitude;
  const lng = typeof gp.longitude === "number" ? gp.longitude : gp?._longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
}

// Small label/value row used inside the expandable "full schema" details panel.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={c.detailRow}>
      <Text style={c.detailLabel}>{label}</Text>
      <Text style={c.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ── Donation Card ─────────────────────────────────────────────────────────────

function DonationCard({
  doc,
  onTrack,
  onEdit,
}: {
  doc: DonationDocWithDelivery;
  onTrack: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [volunteerName, setVolunteerName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const hasReceiver = doc.receiverId !== null;
  const mode = doc.deliveryMode ?? null; // "volunteer" | "self" | null
  const isVolunteerMode = mode === "volunteer";
  const isSelfMode = mode === "self";
  const coords = formatGeoPoint(doc.pickupLocation);

  // Look up the assigned volunteer's real name whenever this donation is in
  // "volunteer" delivery mode and has someone assigned.
  useEffect(() => {
    if (!isVolunteerMode || !doc.assignedVolunteerId) {
      setVolunteerName(null);
      return;
    }
    const unsub = onSnapshot(
      firestoreDoc(db, "users", doc.assignedVolunteerId),
      (snap) => {
        if (snap.exists()) {
          setVolunteerName((snap.data()?.name as string) ?? null);
        }
      },
    );
    return unsub;
  }, [isVolunteerMode, doc.assignedVolunteerId]);

  return (
    <View style={c.card}>
      {/* ── Food Info Row ─────────────────────────────────────────────── */}
      <View style={c.foodRow}>
        {doc.imageUrl?.[0] ? (
          <Image
            source={{ uri: doc.imageUrl[0] }}
            style={c.foodImage}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              c.foodImage,
              {
                backgroundColor: "#e8f5ee",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 28 }}>
              {doc.dietaryType === "NonVeg" ? "🍗" : "🍚"}
            </Text>
          </View>
        )}
        <View style={c.foodMeta}>
          <Text style={c.foodName}>{doc.foodDescription}</Text>
          <Text style={c.foodQty}>
            {doc.quantity + " " + t("donate.servings")}
          </Text>
        </View>
        <View style={c.vegBadge}>
          <Text style={c.vegBadgeText}>{dietaryLabel(doc.dietaryType, t)}</Text>
        </View>
      </View>

      {/* ── Expiry ────────────────────────────────────────────────────── */}
      {(() => {
        const exp = formatExpiresAt(doc.expiresAt);
        return exp.label ? (
          <View style={c.expiryRow}>
            <Text style={[c.expiryText, { color: exp.color }]}>
              ⏳ {exp.label}
            </Text>
          </View>
        ) : null;
      })()}

      <View style={c.divider} />

      {/* ── Drop-off ──────────────────────────────────────────────────── */}
      {doc.receiverId === null ? (
        <View style={c.dropoffRow}>
          <Text style={c.dropoffPin}>⏳</Text>
          <View style={c.dropoffInfo}>
            <Text style={c.dropoffLabel}>{t("track.awaitingClaim")}</Text>
            <Text style={c.dropoffName}>{t("track.noReceiverClaimYet")}</Text>
          </View>
        </View>
      ) : (
          <View style={c.dropoffRow}>
          <Text style={c.dropoffPin}>📍</Text>
          <View style={c.dropoffInfo}>
            <Text style={c.dropoffLabel}>{t("track.dropOffAddress")}</Text>
            <Text style={c.dropoffAddress}>
              {doc.dropOffAddress ??
                t("track.receiverIdPrefix", {
                  id: doc.receiverId.slice(0, 8),
                })}
              </Text>
              {/*<Text style={c.dropoffName}>{t("track.claimed")}</Text>*/}
          </View>
          {doc.dropOffAddress ? (
            <TouchableOpacity
              style={c.mapsBtn}
              activeOpacity={0.82}
              onPress={() => openDropOffInMaps(doc, t)}
            >
              <Text style={c.mapsBtnText}>{t("track.dropOffIn")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ── Delivery section — branches on deliveryMode:
          "volunteer" → status/ETA + volunteer partner card + "on the way"
          "self"      → receiver self-pickup notice, no volunteer UI
          null/other  → legacy fallback keyed off assignedVolunteerId ─────── */}
      {!hasReceiver ? null : isSelfMode ? (
        <View style={c.selfPickupRow}>
          <View style={c.selfPickupIconWrap}>
            <Text style={{ fontSize: 18 }}>🚶</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={c.partnerRoleLabel}>
              {t("track.deliveryMode", "Delivery Method")}
            </Text>
            <Text style={c.selfPickupTitle}>
              {t("track.selfPickup", "Self Pickup by Receiver")}
            </Text>
            <Text style={c.selfPickupSub}>
              {t(
                "track.selfPickupSub",
                "No volunteer needed — the receiver collects it directly.",
              )}
            </Text>
          </View>
        </View>
      ) : (
        <>
          {/* Status + ETA */}
          {doc.assignedVolunteerId === null ? (
            <View style={c.statusRow}>
              <View style={[c.statusChip, { backgroundColor: "#fff3e0" }]}>
                <View style={[c.statusDot, { backgroundColor: "#f97316" }]} />
                <Text style={[c.statusText, { color: "#f97316" }]}>
                  {t("track.awaitingVolunteer")}
                </Text>
              </View>
            </View>
          ) : (
            <View style={c.statusRow}>
              <View style={c.statusChip}>
                <View style={c.statusDot} />
                <Text style={c.statusText}>{statusLabel(doc.status, t)}</Text>
              </View>
            </View>
          )}

          {/* Volunteer partner card, only once someone is actually assigned */}
          {doc.assignedVolunteerId !== null && (
            <>
              <View style={c.divider} />
              <View style={c.partnerRow}>
                <View style={[c.partnerAvatar, c.partnerAvatarFallback]}>
                  <Text style={c.partnerInitials}>
                    {(volunteerName?.trim()?.[0] ?? "V").toUpperCase()}
                  </Text>
                </View>
                <View style={c.partnerInfo}>
                  <Text style={c.partnerRoleLabel}>
                    {t("donor.deliveryPartner")}
                  </Text>
                  <Text style={c.partnerName} numberOfLines={1}>
                    {volunteerName || t("track.volunteerAssigned")}
                  </Text>

                </View>
                <View style={c.actionBtns}>
                  <TouchableOpacity
                    style={c.trackBtn}
                    activeOpacity={0.85}
                    onPress={onTrack}
                  >
                    <Text style={c.trackBtnText}>
                      {t("track.trackDeliveryBtn")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </>
      )}



      {/* ── View / Edit ──────────────────────────────────────────────── */}
      <View style={c.cardFooter}>
        <TouchableOpacity
          style={c.viewEditBtn}
          onPress={onEdit}
          activeOpacity={0.75}
        >
          <Ionicons name="create-outline" size={14} color={Brand.main} />
          <Text style={c.viewEditBtnTxt}>{t("track.viewDetails")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Request List Card (Requests tab) ──────────────────────────────────────────

function RequestListCard({
  req,
  onPress,
}: {
  req: FoodRequestDoc;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const color = reqStatusColor(req.status);
  const dietEmoji =
    req.dietaryType === "Veg"
      ? "🍚"
      : req.dietaryType === "NonVeg"
        ? "🍗"
        : "🍱";

  return (
    <TouchableOpacity style={c.card} onPress={onPress} activeOpacity={0.85}>
      <View style={c.foodRow}>
        <View
          style={[
            c.foodImage,
            {
              backgroundColor: "#e8f5ee",
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text style={{ fontSize: 28 }}>{dietEmoji}</Text>
        </View>
        <View style={c.foodMeta}>
          <Text style={c.foodName} numberOfLines={2}>
            {req.description}
          </Text>
          <Text style={c.foodQty}>
            {req.servings} {t("donate.servings")} ·{" "}
            {dietaryLabel(req.dietaryType, t)}
          </Text>
          <Text style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
            {timeAgo(req.createdAt)}
          </Text>
        </View>
        <View
          style={[
            c.vegBadge,
            {
              borderColor: color,
              backgroundColor: color + "22",
            },
          ]}
        >
          <Text style={[c.vegBadgeText, { color }]}>
            {reqStatusLabel(req.status, t)}
          </Text>
        </View>
      </View>

      <View style={c.cardFooter}>
        <View style={c.viewEditBtn}>
          <Ionicons name="eye-outline" size={14} color={Brand.main} />
          <Text style={c.viewEditBtnTxt}>{t("track.viewDetails")}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function TrackScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  // ── Tab state
  const [activeTab, setActiveTab] = useState<TrackTab>("donations");

  // ── Donations tab state
  const [donations, setDonations] = useState<DonationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerDoc, setDrawerDoc] = useState<DonationDoc | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // ── Requests tab state
  const [requests, setRequests] = useState<FoodRequestDoc[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestDrawerVisible, setRequestDrawerVisible] = useState(false);
  const [drawerRequest, setDrawerRequest] = useState<FoodRequestDoc | null>(
    null,
  );
  const [receiverProfile, setReceiverProfile] =
    useState<ReceiverProfile | null>(null);
  const [receiverLoading, setReceiverLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // ── Subscriptions
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenToDonorDonations(user.uid, (docs) => {
      setDonations(docs);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenToDonorRequests(user.uid, (docs) => {
      setRequests(docs);
      setRequestsLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // ── Open request drawer + fetch receiver profile
  function openRequestDrawer(req: FoodRequestDoc) {
    setDrawerRequest(req);
    setRequestDrawerVisible(true);
    setReceiverProfile(null);
    setReceiverLoading(true);

    getDoc(firestoreDoc(db, "users", req.receiverId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data()!;
          const addresses = (data.savedAddresses as any[]) ?? [];
          const primary =
            addresses.find((a: any) => a.isPrimary) ?? addresses[0];
          setReceiverProfile({
            name: (data.name as string) ?? t("track.receiver"),
            address:
              (primary?.fullAddress as string) ?? t("track.noAddressOnFile"),
            lat: primary?.lat ?? 0,
            lng: primary?.lng ?? 0,
          });
        } else {
          setReceiverProfile({
            name: t("track.receiver"),
            address: t("track.noAddressOnFile"),
            lat: 0,
            lng: 0,
          });
        }
        setReceiverLoading(false);
      })
      .catch(() => {
        setReceiverProfile({
          name: t("track.receiver"),
          address: t("track.noAddressOnFile"),
          lat: 0,
          lng: 0,
        });
        setReceiverLoading(false);
      });
  }

  // ── Accept request → create donation → update request
  async function handleAcceptRequest() {
    if (!user?.uid || !drawerRequest) return;
    setAccepting(true);

    try {
      // Fetch donor's primary location
      let pickupCoords = { latitude: 12.9716, longitude: 77.5946 };
      let pickupAddress = t("track.addressNotSet");

      const donorSnap = await getDoc(firestoreDoc(db, "users", user.uid));
      if (donorSnap.exists()) {
        const data = donorSnap.data()!;
        const addresses = (data.savedAddresses as any[]) ?? [];
        const primary = addresses.find((a: any) => a.isPrimary) ?? addresses[0];

        if (primary?.lat && primary?.lng) {
          pickupCoords = { latitude: primary.lat, longitude: primary.lng };
          pickupAddress =
            (primary.fullAddress as string) ?? t("track.donorAddressFallback");
        } else if (data.gpsLocation) {
          const gps = data.gpsLocation as {
            latitude: number;
            longitude: number;
          };
          pickupCoords = { latitude: gps.latitude, longitude: gps.longitude };
          pickupAddress = t("track.donorLocationFallback");
        }
      }

      const donationId = await createDonationFromRequest({
        donorId: user.uid,
        receiverId: drawerRequest.receiverId,
        foodDescription: drawerRequest.description,
        quantity: drawerRequest.servings,
        dietaryType: drawerRequest.dietaryType,
        deliveryMode: drawerRequest.deliveryMode,
        pickupCoords,
        pickupAddress,
      });

      await updateRequestAssignedDonation(drawerRequest.id, donationId);

      setRequestDrawerVisible(false);
      Alert.alert(
        t("track.requestAcceptedTitle"),
        t("track.requestAcceptedMsg"),
      );
    } catch {
      Alert.alert(t("common.error"), t("track.acceptRequestError"));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={t("track.screenTitle")} badgeCount={0} />

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={s.tab}
          onPress={() => setActiveTab("donations")}
          activeOpacity={0.75}
        >
          <Text
            style={[s.tabText, activeTab === "donations" && s.tabTextActive]}
          >
            {t("track.tabDonations")}
          </Text>
          {activeTab === "donations" && <View style={s.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.tab}
          onPress={() => setActiveTab("requests")}
          activeOpacity={0.75}
        >
          <Text
            style={[s.tabText, activeTab === "requests" && s.tabTextActive]}
          >
            {t("track.tabRequests")}
          </Text>
          {activeTab === "requests" && <View style={s.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* ── Donations Tab ─────────────────────────────────────────────────── */}
      {activeTab === "donations" ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.pageHeader}>
            <Text style={s.pageTitle}>{t("track.pageTitleDonations")}</Text>
            <Text style={s.pageSubtitle}>
              {t("track.pageSubtitleDonations")}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={Brand.main}
              style={{ marginTop: 40 }}
            />
          ) : donations.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 16, color: "#999", marginBottom: 8 }}>
                {t("track.noDonations")}
              </Text>
              <Text style={{ fontSize: 13, color: "#bbb" }}>
                {t("track.noDonationsSub")}
              </Text>
            </View>
          ) : (
            donations.map((doc) => (
              <DonationCard
                key={doc.id}
                doc={doc}
                onTrack={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.push(`/track-delivery?id=${doc.id}` as any)
                }
                onEdit={() => {
                  setDrawerDoc(doc);
                  setDrawerVisible(true);
                }}
              />
            ))
          )}
        </ScrollView>
      ) : (
        /* ── Requests Tab ───────────────────────────────────────────────── */
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.pageHeader}>
            <Text style={s.pageTitle}>{t("track.pageTitleRequests")}</Text>
            <Text style={s.pageSubtitle}>
              {t("track.pageSubtitleRequests")}
            </Text>
          </View>

          {requestsLoading ? (
            <ActivityIndicator
              size="large"
              color={Brand.main}
              style={{ marginTop: 40 }}
            />
          ) : requests.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 16, color: "#999", marginBottom: 8 }}>
                {t("track.noRequests")}
              </Text>
              <Text style={{ fontSize: 13, color: "#bbb" }}>
                {t("track.noRequestsSub")}
              </Text>
            </View>
          ) : (
            requests.map((req) => (
              <RequestListCard
                key={req.id}
                req={req}
                onPress={() => openRequestDrawer(req)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ── Donation Drawer (existing) ────────────────────────────────────── */}
      <DonationDrawer
        doc={drawerDoc}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />

      {/* ── Request Drawer (new) ──────────────────────────────────────────── */}
      <Modal
        visible={requestDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestDrawerVisible(false)}
      >
        <View style={rd.root}>
          <Pressable
            style={rd.backdrop}
            onPress={() => setRequestDrawerVisible(false)}
          />
          <View style={rd.sheet}>
            {/* Handle */}
            <View style={rd.handleWrap}>
              <View style={rd.handle} />
            </View>

            {/* Header */}
            <View style={rd.header}>
              <Text style={rd.headerTitle}>
                {t("track.requestDrawerTitle")}
              </Text>
              <TouchableOpacity
                style={rd.closeBtn}
                onPress={() => setRequestDrawerVisible(false)}
              >
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={rd.scroll}
              contentContainerStyle={rd.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {drawerRequest && (
                <>
                  {/* ── Status + Basic Info ──────────────────────────── */}
                  <View style={rd.section}>
                    <View style={rd.row}>
                      <View
                        style={[
                          rd.statusChip,
                          {
                            backgroundColor: reqStatusColor(
                              drawerRequest.status,
                            ),
                          },
                        ]}
                      >
                        <Text style={rd.statusChipTxt}>
                          {reqStatusLabel(drawerRequest.status, t)}
                        </Text>
                      </View>
                    </View>

                    <Text style={rd.descTitle}>
                      {drawerRequest.description}
                    </Text>

                    <View style={rd.metaRow}>
                      <Text style={rd.metaItem}>
                        🍽️ {drawerRequest.servings} {t("donate.servings")}
                      </Text>
                      <Text style={rd.metaItem}>
                        {drawerRequest.dietaryType === "Veg"
                          ? "🌿 "
                          : drawerRequest.dietaryType === "NonVeg"
                            ? "🍗 "
                            : "🍱 "}
                        {dietaryLabel(drawerRequest.dietaryType, t)}
                      </Text>
                    </View>
                    <Text style={rd.metaSingle}>
                      🚚{" "}
                      {drawerRequest.deliveryMode === "volunteer"
                        ? t("donate.volunteerDelivery")
                        : t("donate.selfPickup")}
                    </Text>
                    <Text style={rd.metaSingle}>
                      📅 {timeAgo(drawerRequest.createdAt)}
                    </Text>
                  </View>

                  <View style={rd.divider} />

                  {/* ── Receiver Info ────────────────────────────────── */}
                  <View style={rd.section}>
                    <Text style={rd.sectionLabel}>{t("track.receiver")}</Text>
                    {receiverLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={Brand.main}
                        style={{ marginTop: 8 }}
                      />
                    ) : receiverProfile ? (
                      <>
                        <Text style={rd.receiverName}>
                          {receiverProfile.name}
                        </Text>
                        <Text style={rd.metaSingle}>
                          📍 {receiverProfile.address}
                        </Text>
                      </>
                    ) : null}
                  </View>

                  <View style={rd.divider} />

                  {/* ── Accept Button ────────────────────────────────── */}
                  {drawerRequest.status === "open" ? (
                    <TouchableOpacity
                      style={[rd.acceptBtn, accepting && rd.acceptBtnDisabled]}
                      onPress={handleAcceptRequest}
                      disabled={accepting}
                      activeOpacity={0.85}
                    >
                      {accepting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={rd.acceptBtnTxt}>
                          {t("track.acceptRequestBtn")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={rd.alreadyMatchedBanner}>
                      <Text style={rd.alreadyMatchedTxt}>
                        {drawerRequest.status === "matched"
                          ? t("track.alreadyMatchedMsg")
                          : t("track.requestUnavailableMsg")}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Screen styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    position: "relative",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9ca3af",
  },
  tabTextActive: {
    color: Brand.main,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Brand.main,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  // Scroll
  scroll: {
    flex: 1,
    backgroundColor: "#f2f3f5",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  // Page header
  pageHeader: {
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 3,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#666",
  },
});

// ── Card styles ───────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  // Food row
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  foodImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    flexShrink: 0,
  },
  foodMeta: {
    flex: 1,
  },
  foodName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 4,
  },
  foodQty: {
    fontSize: 13,
    color: "#666",
  },
  vegBadge: {
    borderWidth: 1,
    borderColor: "#b8d4c0",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#f0faf3",
    alignSelf: "flex-start",
  },
  vegBadgeText: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "500",
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "#f0f2f1",
    marginHorizontal: 14,
  },

  // Drop-off
  dropoffRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  dropoffPin: {
    fontSize: 18,
    marginTop: 2,
  },
  dropoffInfo: {
    flex: 1,
  },
  dropoffLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563eb",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dropoffName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 2,
  },
  dropoffAddress: {
    fontSize: 12,
    color: "#777",
  },
  mapsBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#b8d4c0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f0faf3",
    flexShrink: 0,
  },
  mapsBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: Brand.main,
  },

  // Status row
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
    gap: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e8f5ee",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.main,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: Brand.main,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  etaClock: {
    fontSize: 13,
  },
  etaText: {
    fontSize: 13,
    color: "#666",
  },
  etaBold: {
    fontWeight: "700",
    color: "#333",
  },

  // Partner row
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  partnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    flexShrink: 0,
  },
  partnerAvatarFallback: {
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b8d4c0",
  },
  partnerInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: Brand.main,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerRoleLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 1,
  },
  onTheWayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  onTheWayDot: {
    fontSize: 8,
    color: "#22c55e",
  },
  onTheWayTxt: {
    fontSize: 11,
    color: "#22c55e",
    fontWeight: "600",
  },
  partnerMeta: {
    fontSize: 12,
    color: "#888",
  },
  actionBtns: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
  },
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
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  trackBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  trackBtnArrow: {
    fontSize: 16,
    color: "#fff",
    lineHeight: 18,
  },

  // Expiry
  expiryRow: {
    paddingHorizontal: 14,
    paddingBottom: 2,
  },
  expiryText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Self-pickup (receiver delivers, no volunteer)
  selfPickupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  selfPickupIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selfPickupTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 1,
  },
  selfPickupSub: {
    fontSize: 12,
    color: "#888",
  },

  // Expandable full-schema details panel
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailsToggleTxt: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
  },
  detailsBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  detailLabel: {
    fontSize: 11,
    color: "#999",
    flexShrink: 0,
  },
  detailValue: {
    fontSize: 11,
    color: "#444",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },

  // Card footer
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 8,
  },
  viewEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b8d4c0",
    backgroundColor: "#f0faf3",
  },
  viewEditBtnTxt: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
  },
});

// ── Request Drawer styles ─────────────────────────────────────────────────────

const rd = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 12,
  },
  handleWrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  row: {
    flexDirection: "row",
    marginBottom: 10,
  },
  statusChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusChipTxt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  descTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 10,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 6,
  },
  metaItem: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  metaSingle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  receiverName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 4,
  },
  acceptBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Brand.main,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnDisabled: {
    opacity: 0.6,
  },
  acceptBtnTxt: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  alreadyMatchedBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  alreadyMatchedTxt: {
    fontSize: 14,
    color: "#065f46",
    fontWeight: "500",
    textAlign: "center",
  },
});
