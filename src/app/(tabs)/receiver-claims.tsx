import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import {
  getFirestore,
  doc as firestoreDoc,
  deleteDoc,
} from "@react-native-firebase/firestore";
import { Brand } from "@/constants/theme";
import ScreenHeader from "@/components/screen-header";
import { useAuth } from "@/context/auth";
import {
  listenToReceiverClaims,
  timeAgo,
  formatExpiresAt,
  type DonationDoc,
} from "@/lib/donation-service";
import {
  listenToReceiverRequests,
  type FoodRequestDoc,
} from "@/lib/request-service";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "react-i18next";

const db = getFirestore();

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "claims" | "requests";

// Firestore requests are assumed to live in a "requests" collection, mirroring
// "donations". Adjust the collection name below if yours differs.
const REQUESTS_COLLECTION = "requests";

// `deliveryMode` may not yet be declared on `DonationDoc` in donation-service.ts —
// extending it locally lets the claim card branch on it without requiring that
// file to change first. Safe to remove once/if it's added there directly.
type DonationDocWithDelivery = DonationDoc & {
  deliveryMode?: "self" | "volunteer" | null;
};

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusColor(status: string): string {
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

function requestStatusColor(status: string): string {
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

function requestStatusLabel(status: string, t: (k: string) => string): string {
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

function urgencyLabel(urgency: string | undefined): string {
  switch (urgency) {
    case "1h":
      return "Needed within 1 hour";
    case "3h":
      return "Needed within 3 hours";
    case "today":
      return "Needed today";
    default:
      return urgency ?? "";
  }
}

// Opens directions to the pickup address, letting the maps app use the
// traveller's current location as the origin (the receiver or volunteer isn't
// necessarily standing at any fixed coordinate we know of in this screen).
function openPickupInMaps(doc: DonationDoc): void {
  const destination = encodeURIComponent(doc.pickupAddress ?? "");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Could not open Google Maps."),
  );
}

// ── Claim Card ─────────────────────────────────────────────────────────────────

function ClaimCard({
  doc,
  onTrack,
}: {
  doc: DonationDocWithDelivery;
  onTrack: () => void;
}) {
  const { t } = useTranslation();
  const color = statusColor(doc.status);
  const foodEmoji =
    doc.dietaryType === "Veg"
      ? "🍚"
      : doc.dietaryType === "NonVeg"
        ? "🍗"
        : "🍱";
  const exp = formatExpiresAt(doc.expiresAt);
  const mode = doc.deliveryMode ?? null; // "volunteer" | "self" | null
  const isVolunteerMode = mode === "volunteer";
  const isSelfMode = mode === "self";

  return (
    <View style={[c.card, { backgroundColor: "#ffffff" }]}>
      <View style={[c.accentStrip, { backgroundColor: color }]} />
      <View style={c.body}>
        <View style={c.topRow}>
          {doc.imageUrl?.[0] ? (
            <Image
              source={{ uri: doc.imageUrl[0] }}
              style={c.foodImg}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                c.foodImg,
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
            <View style={c.nameLine}>
              <Text style={c.foodName} numberOfLines={1}>
                {doc.foodDescription}
              </Text>
              <View style={[c.statusChip, { backgroundColor: color }]}>
                <Text style={c.statusChipTxt}>
                  {statusLabel(doc.status, t)}
                </Text>
              </View>
            </View>
            <Text style={c.foodQty}>{doc.quantity} servings</Text>
            <Text style={c.foodLoc}>
              {doc.dietaryType} · {timeAgo(doc.createdAt)}
            </Text>
            {exp.label ? (
              <Text style={[c.expiryBadge, { color: exp.color }]}>
                ⏳ {exp.label}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={c.divider} />

        {/* ── Pick-up address ───────────────────────────────────────────── */}
        <View style={c.dropoffRow}>
          <Text style={c.dropoffPin}>📍</Text>
          <View style={c.dropoffInfo}>
            <Text style={c.dropoffLabel}>Pick-up Address</Text>
            <Text style={c.dropoffAddress} numberOfLines={2}>
              {doc.pickupAddress}
            </Text>
          </View>
          {doc.pickupAddress ? (
            <TouchableOpacity
              style={c.mapsBtn}
              activeOpacity={0.82}
              onPress={() => openPickupInMaps(doc)}
            >
              <Text style={c.mapsBtnText}>{t("track.dropOffIn")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={c.divider} />

        {/* ── Delivery section — branches on deliveryMode, same convention
            used by DonationCard in the donor's track screen:
              "volunteer" → assigned-volunteer status + track button
              "self"      → self-pickup notice
              null/other  → still awaiting assignment ──────────────────── */}
        {isSelfMode ? (
          <View style={c.selfPickupRow}>
            <View style={c.selfPickupIconWrap}>
              <Text style={{ fontSize: 18 }}>🚶</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={c.infoLabel}>{t("emergency.deliveryMode")}</Text>
              <Text style={c.selfPickupTitle}>{t("receiver.selfPickup")}</Text>
              <Text style={c.selfPickupSub}>
                You'll collect this yourself.
              </Text>
            </View>
          </View>
        ) : isVolunteerMode ? (
          <View style={c.infoCard}>
            <View style={c.infoSide}>
              <Text style={c.infoIcon}>🛵</Text>
              <View>
                <Text style={c.infoLabel}>{t("emergency.deliveryMode")}</Text>
                <Text style={c.infoValue}>{t("receiver.volunteerDelivery")}</Text>
              </View>
            </View>
            <View style={c.infoVDivider} />
            <View style={c.infoSide}>
              <View>
                <Text style={c.infoLabel}>
                  {doc.assignedVolunteerId !== null
                    ? t("receiver.volunteerAssigned")
                    : t("receiver.awaitingVolunteer")}
                </Text>
                {doc.assignedVolunteerId !== null && (
                  <TouchableOpacity
                    style={c.trackBtn}
                    onPress={onTrack}
                    activeOpacity={0.82}
                  >
                    <Text style={c.trackBtnTxt}>
                      {t("track.trackDeliveryBtn")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={c.pendingContainer}>
            <MaterialIcons
              name="hourglass-empty"
              size={18}
              color={Brand.main}
              style={{ marginRight: 6 }}
            />
            <Text style={[c.pendingText, { flex: 1 }]}>
              Awaiting delivery assignment
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Emergency Request Card ────────────────────────────────────────────────────

function EmergencyRequestCard({
  doc,
  onDelete,
}: {
  doc: FoodRequestDoc;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const statusColor = requestStatusColor(doc.status);

  return (
    <View style={[c.card, { backgroundColor: "#fff5f5" }]}>
      <View style={[c.accentStrip, { backgroundColor: "#ef4444" }]} />
      <View style={c.body}>
        {/* Emergency badge */}
        <View style={c.emergencyBadge}>
          <Text style={c.emergencyBadgeText}>🚨 {t("emergency.screenTitle")}</Text>
        </View>

        <View style={c.topRow}>
          <View
            style={[
              c.foodImg,
              {
                backgroundColor: "#fee2e2",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 28 }}>🚨</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={c.nameLine}>
              <Text
                style={[c.foodName, { color: "#991b1b" }]}
                numberOfLines={2}
              >
                {doc.description}
              </Text>
              <View style={[c.statusChip, { backgroundColor: statusColor }]}>
                <Text style={c.statusChipTxt}>
                  {requestStatusLabel(doc.status, t)}
                </Text>
              </View>
            </View>
            <Text style={c.foodQty}>{doc.servings} servings needed</Text>
            <Text style={c.foodLoc}>
              {doc.dietaryType} ·{" "}
              {doc.deliveryMode === "volunteer"
                ? t("receiver.volunteerDelivery")
                : t("receiver.selfPickup")}
            </Text>
            <Text style={c.foodLoc}>📅 {timeAgo(doc.createdAt)}</Text>
            {doc.urgency && (
              <Text style={c.urgencyText}>⏱️ {urgencyLabel(doc.urgency)}</Text>
            )}
          </View>
        </View>

        <View style={c.divider} />

        {/* Fulfillment status */}
        <View style={c.fulfillmentRow}>
          <View
            style={[
              c.fulfillmentBadge,
              {
                backgroundColor: doc.assignedDonationId ? "#d1fae5" : "#fee2e2",
              },
            ]}
          >
            <Text
              style={[
                c.fulfillmentText,
                {
                  color: doc.assignedDonationId ? "#065f46" : "#991b1b",
                },
              ]}
            >
              {doc.assignedDonationId
                ? "✅ Donor Assigned"
                : "⏳ Awaiting Donor"}
            </Text>
          </View>
        </View>

        {/* Delete request */}
        <View style={c.requestFooter}>
          <TouchableOpacity
            style={c.deleteBtn}
            activeOpacity={0.8}
            onPress={() => onDelete(doc.id)}
          >
            <MaterialIcons name="delete-outline" size={15} color="#ef4444" />
            <Text style={c.deleteBtnTxt}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Request Card ──────────────────────────────────────────────────────────────

function RequestCard({
  doc,
  onDelete,
}: {
  doc: FoodRequestDoc;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const color = requestStatusColor(doc.status);
  const dietEmoji =
    doc.dietaryType === "Veg"
      ? "🥗"
      : doc.dietaryType === "NonVeg"
        ? "🍗"
        : "🍱";

  const isFulfilled =
    doc.assignedDonationId !== null && doc.assignedVolunteerId !== null;

  return (
    <View style={[c.card, { backgroundColor: "#ffffff" }]}>
      <View style={[c.accentStrip, { backgroundColor: color }]} />
      <View style={c.body}>
        {/* Top row */}
        <View style={c.topRow}>
          <View
            style={[
              c.foodImg,
              {
                backgroundColor: "#fff3e0",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 28 }}>{dietEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={c.nameLine}>
              <Text style={c.foodName} numberOfLines={1}>
                {doc.description}
              </Text>
              <View style={[c.statusChip, { backgroundColor: color }]}>
                <Text style={c.statusChipTxt}>
                  {requestStatusLabel(doc.status, t)}
                </Text>
              </View>
            </View>
            <Text style={c.foodQty}>{doc.servings} servings</Text>
            <Text style={c.foodLoc}>
              {doc.dietaryType} ·{" "}
              {doc.deliveryMode === "volunteer"
                ? t("receiver.volunteerDelivery")
                : t("receiver.selfPickup")}
            </Text>
            <Text style={c.foodLoc}>📅 {timeAgo(doc.createdAt)}</Text>
          </View>
        </View>

        <View style={c.divider} />

        {/* Fulfillment row */}
        <View style={c.fulfillmentRow}>
          <View
            style={[
              c.fulfillmentBadge,
              { backgroundColor: isFulfilled ? "#d1fae5" : "#f3f4f6" },
            ]}
          >
            <Text
              style={[
                c.fulfillmentText,
                { color: isFulfilled ? "#065f46" : "#6b7280" },
              ]}
            >
              {isFulfilled ? "✅ Assigned" : "⏳ Not Assigned"}
            </Text>
          </View>
        </View>

        {/* Delete request */}
        <View style={c.requestFooter}>
          <TouchableOpacity
            style={c.deleteBtn}
            activeOpacity={0.8}
            onPress={() => onDelete(doc.id)}
          >
            <MaterialIcons name="delete-outline" size={15} color="#ef4444" />
            <Text style={c.deleteBtnTxt}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ReceiverClaimsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>("claims");
  const [claims, setClaims] = useState<DonationDoc[]>([]);
  const [requests, setRequests] = useState<FoodRequestDoc[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    return listenToReceiverClaims(user.uid, (docs) => {
      setClaims(docs);
      setClaimsLoading(false);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenToReceiverRequests(user.uid, (docs) => {
      setRequests(docs);
      setRequestsLoading(false);
    });
  }, [user?.uid]);

  function handleDeleteRequest(requestId: string) {
    Alert.alert(
      "Delete Request?",
      "This will permanently delete this food request. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(firestoreDoc(db, REQUESTS_COLLECTION, requestId));
            } catch {
              Alert.alert(
                "Error",
                "Could not delete this request. Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={sc.safe} edges={["top"]}>
      <ScreenHeader title={t("receiver.claims.screenTitle")} />

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <View style={sc.tabBar}>
        <TouchableOpacity
          style={sc.tab}
          onPress={() => setActiveTab("claims")}
          activeOpacity={0.75}
        >
          <Text
            style={[sc.tabText, activeTab === "claims" && sc.tabTextActive]}
          >
            {t("nav.claims")}
          </Text>
          {activeTab === "claims" && <View style={sc.tabIndicator} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={sc.tab}
          onPress={() => setActiveTab("requests")}
          activeOpacity={0.75}
        >
          <Text
            style={[sc.tabText, activeTab === "requests" && sc.tabTextActive]}
          >
            {t("track.requests")}
          </Text>
          {activeTab === "requests" && <View style={sc.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      {activeTab === "claims" ? (
        <ScrollView
          style={sc.scroll}
          contentContainerStyle={sc.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {claimsLoading ? (
            <ActivityIndicator
              size="large"
              color={Brand.main}
              style={{ marginVertical: 48 }}
            />
          ) : claims.length === 0 ? (
            <View style={sc.emptyState}>
              <Text style={sc.emptyEmoji}>🌿</Text>
              <Text style={sc.emptyTitle}>{t("receiver.claims.noActive")}</Text>
              <Text style={sc.emptySub}>
                {t("receiver.claims.noActiveSub")}
              </Text>
            </View>
          ) : (
            claims.map((doc) => (
              <ClaimCard
                key={doc.id}
                doc={doc}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onTrack={() =>
                  router.push(`/track-delivery?id=${doc.id}` as any)
                }
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={sc.scroll}
          contentContainerStyle={sc.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/*<View style={sc.sectionHeader}>
            <Text style={sc.sectionTitle}>Donation Requests</Text>
          </View>*/}

          {requestsLoading ? (
            <ActivityIndicator
              size="large"
              color={Brand.main}
              style={{ marginVertical: 48 }}
            />
          ) : requests.length === 0 ? (
            <View style={sc.emptyState}>
              <Text style={sc.emptyEmoji}>📋</Text>
              <Text style={sc.emptyTitle}>
                {t("receiver.claims.noHistory")}
              </Text>
              <Text style={sc.emptySub}>
                {t("receiver.claims.noHistorySub")}
              </Text>
            </View>
          ) : (
            <>
              {/* Emergency requests appear above normal ones */}
              {requests
                .filter((r) => r.isEmergency === true)
                .map((req) => (
                  <EmergencyRequestCard
                    key={req.id}
                    doc={req}
                    onDelete={handleDeleteRequest}
                  />
                ))}
              {requests
                .filter((r) => !r.isEmergency)
                .map((req) => (
                  <RequestCard
                    key={req.id}
                    doc={req}
                    onDelete={handleDeleteRequest}
                  />
                ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Card styles ───────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  accentStrip: {
    width: 4,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 14,
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
  infoValue: { fontSize: 12, fontWeight: "700", color: "#0f2419" },
  body: {
    flex: 1,
    padding: 12,
  },
  topRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  foodImg: {
    width: 64,
    height: 64,
    borderRadius: 8,
    flexShrink: 0,
  },
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
  statusChipTxt: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  foodQty: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
    marginBottom: 2,
  },
  foodLoc: {
    fontSize: 12,
    color: "#6b7280",
  },
  expiryBadge: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginVertical: 8,
  },
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
  trackBtnTxt: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  fulfillmentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  fulfillmentBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fulfillmentText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emergencyBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  emergencyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ef4444",
  },
  urgencyText: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "600",
    marginTop: 2,
  },

  // Pick-up row (claims tab)
  dropoffRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
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
  dropoffAddress: {
    fontSize: 12,
    color: "#374151",
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

  // Self-pickup notice (claims tab, deliveryMode === "self")
  selfPickupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  selfPickupIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selfPickupTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 1,
  },
  selfPickupSub: {
    fontSize: 12,
    color: "#888",
  },

  // Delete request (requests tab)
  requestFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fef2f2",
  },
  deleteBtnTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
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
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 40,
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
    lineHeight: 18,
  },
});
