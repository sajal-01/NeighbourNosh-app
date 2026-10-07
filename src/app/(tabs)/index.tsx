import {
  ScrollView,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Brand, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/context/auth";
import {
  listenToDonorDonations,
  timeAgo,
  formatExpiresAt,
  type DonationDoc,
} from "@/lib/donation-service";
import DonationDrawer from "@/components/donation-drawer";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";

const db = getFirestore();

// ── Status helpers ────────────────────────────────────────────────────────────

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

// ── Stat card shape ───────────────────────────────────────────────────────────

type StatCard = {
  icon: string;
  iconBg: string;
  value: string;
  label: string;
  dot: boolean;
  dotColor: string;
};

// ── Extended donation type ────────────────────────────────────────────────────
// These fields exist in the Firestore "donations" schema but may not yet be
// declared on DonationDoc in donation-service.ts. Extending locally means the
// card can render every schema field without needing that file changed first —
// if/when it's added there, this local extension can simply be removed.

type DonationDocWithDelivery = DonationDoc & {
  deliveryMode?: "self" | "volunteer" | null;
  deliveryAgentId?: string | null;
  deliveryAgentType?: "receiver" | "volunteer" | null;
  dietaryType?: string | null;
  donorId?: string;
  pickupGeohash?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pickupLocation?: any;
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

function dietaryLabel(
  dietaryType: string | null | undefined,
  t: (k: string, d?: string) => string,
): string | null {
  if (dietaryType === "Veg") return t("donate.veg", "Veg");
  if (dietaryType === "NonVeg") return t("donate.nonVeg", "Non-Veg");
  return dietaryType ?? null;
}


// ── Main component ────────────────────────────────────────────────────────────

export default function DonorDashboard() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const cardBg = "#ffffff";
  const textPrimary = theme.text;

  // ── Firestore state ──────────────────────────────────────────────────────
  const [allDonations, setAllDonations] = useState<DonationDoc[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [drawerDoc, setDrawerDoc] = useState<DonationDoc | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [volunteerNames, setVolunteerNames] = useState<Record<string, string>>(
    {},
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function openDrawer(doc: DonationDoc) {
    setDrawerDoc(doc);
    setDrawerVisible(true);
  }
  function toggleDetails(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenToDonorDonations(user.uid, (docs) => {
      setAllDonations(docs);
      setLoadingDonations(false);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setProfileLoaded(true);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfileName(snap.data()?.name ?? "");
          setRewardPoints((snap.data()?.rewardPoints as number) ?? 0);
        }
        setProfileLoaded(true);
      },
      () => {
        setProfileLoaded(false);
      },
    );
    return unsub;
  }, [user?.uid]);

  // ── Volunteer name lookups ───────────────────────────────────────────────
  // For any donation currently in "volunteer" delivery mode, subscribe to that
  // volunteer's user doc so the card can show their name instead of just an ID.
  useEffect(() => {
    const volunteerIds = Array.from(
      new Set(
        allDonations
          .map((d) => d as DonationDocWithDelivery)
          .filter((d) => d.deliveryMode === "volunteer" && d.assignedVolunteerId)
          .map((d) => d.assignedVolunteerId as string),
      ),
    );

    if (volunteerIds.length === 0) return;

    const unsubs = volunteerIds.map((id) =>
      onSnapshot(doc(db, "users", id), (snap) => {
        if (snap.exists()) {
          const name = (snap.data()?.name as string) ?? "";
          setVolunteerNames((prev) =>
            prev[id] === name ? prev : { ...prev, [id]: name },
          );
        }
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [allDonations]);

  // ── Computed stats ───────────────────────────────────────────────────────
  const totalDonations = allDonations.length;
  const activeDonations = allDonations.filter((d) =>
    ["pending", "accepted", "in_progress"].includes(d.status),
  ).length;
  const completedDonations = allDonations.filter(
    (d) => d.status === "delivered",
  ).length;

  const STAT_CARDS: StatCard[] = [
    {
      icon: "📦",
      iconBg: "#e6f4eb",
      value: String(totalDonations),
      label: t("donor.totalDonations"),
      dot: false,
      dotColor: "",
    },
    {
      icon: "⏳",
      iconBg: "#fff3e0",
      value: String(activeDonations),
      label: t("donor.activeDonations"),
      dot: true,
      dotColor: "#f97316",
    },
    {
      icon: "✅",
      iconBg: "#e3eeff",
      value: String(completedDonations),
      label: t("donor.completedDonations"),
      dot: false,
      dotColor: "",
    },
    {
      icon: "⭐",
      iconBg: "#fff8e1",
      value: String(rewardPoints),
      label: t("donor.rewardPoints"),
      dot: false,
      dotColor: "",
    },
  ];

  // ── Active donation docs (not delivered/expired) ──────────────────────────
  const activeDonationDocs = allDonations.filter(
    (d) => !["delivered", "expired"].includes(d.status),
  );

  // ── Greeting ─────────────────────────────────────────────────────────────

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
        style={[s.scroll, { backgroundColor: "#f2f3f5" }]}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.greeting}>{greeting}</Text>
            <Text style={s.subLine}>
              {t("editProfile.roles.donor.label")} {t("profile.account")}
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

        {/* ── 2. Stats Grid ──────────────────────────────────────────────── */}
        <View style={s.statsGrid}>
          {STAT_CARDS.map((sc) => (
            <View
              key={sc.label}
              style={[s.statCard, { backgroundColor: cardBg }]}
            >
              <View style={[s.statIconBox, { backgroundColor: sc.iconBg }]}>
                <Text style={s.statIconEmoji}>{sc.icon}</Text>
              </View>
              <View style={s.statInfo}>
                <View style={s.statValRow}>
                  <Text style={[s.statNum, { color: textPrimary }]}>
                    {sc.value}
                  </Text>
                  {sc.dot && (
                    <View
                      style={[s.activeDot, { backgroundColor: sc.dotColor }]}
                    />
                  )}
                </View>
                <Text style={s.statLbl}>{sc.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── 3. Post New Donation ────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [s.postBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/donate")}
        >
          <View style={s.plusCircle}>
            <Text style={s.plusSign}>+</Text>
          </View>
          <Text style={s.postBtnTxt}>{t("donor.postNewDonation")}</Text>
        </Pressable>

        {/* ── 4. Active Donations ─────────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: textPrimary }]}>
            {t("donor.activeDonationsSection")}
          </Text>
          <Pressable onPress={() => router.push("/track")} style={s.viewAllBtn}>
            <Text style={s.viewAll}>{t("donor.viewAll")}</Text>
            <Ionicons name="arrow-forward" size={14} color={Brand.main} />
          </Pressable>
        </View>

        {loadingDonations ? (
          <ActivityIndicator
            size="small"
            color={Brand.main}
            style={{ marginTop: 20 }}
          />
        ) : activeDonationDocs.length === 0 ? (
          <Text style={s.emptyDonations}>{t("donor.emptyDonations")}</Text>
        ) : (
          activeDonationDocs.map((docItem) => {
            const doc = docItem as DonationDocWithDelivery;
            const color = statusColor(doc.status);
            const foodEmoji =
              doc.dietaryType === "Veg"
                ? "🍚"
                : doc.dietaryType === "NonVeg"
                  ? "🍗"
                  : "🍱";
            const dietLabel = dietaryLabel(doc.dietaryType, t as (k: string, d?: string) => string);

            const hasReceiver = doc.receiverId !== null;
            const mode = doc.deliveryMode ?? null; // "volunteer" | "self" | null
            const isVolunteerMode = mode === "volunteer";
            const isSelfMode = mode === "self";
            const volunteerName = doc.assignedVolunteerId
              ? volunteerNames[doc.assignedVolunteerId]
              : undefined;
            const isExpanded = expandedIds.has(doc.id);
            const coords = formatGeoPoint(doc.pickupLocation);

            return (
              <View
                key={doc.id}
                style={[s.donationCard, { backgroundColor: cardBg }]}
              >
                {/* Coloured left accent */}
                <View style={[s.accentStrip, { backgroundColor: color }]} />

                <View style={s.donationBody}>
                  {/* Top row: image + name/qty/loc + status chip */}
                  <View style={s.topRow}>
                    {doc.imageUrl?.[0] ? (
                      <Image
                        source={{ uri: doc.imageUrl[0] }}
                        style={s.foodImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={[
                          s.foodImg,
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
                    <View style={s.foodMeta}>
                      <View style={s.nameLine}>
                        <Text
                          style={[s.foodName, { color: textPrimary }]}
                          numberOfLines={1}
                        >
                          {doc.foodDescription}
                        </Text>
                        <View
                          style={[s.statusChip, { backgroundColor: color }]}
                        >
                          <Text style={s.statusChipTxt}>
                            {statusLabel(doc.status, t)}
                          </Text>
                        </View>
                      </View>
                      <View style={s.qtyDietRow}>
                        <Text style={s.foodQty}>
                          {doc.quantity} {t("donate.servings")}
                        </Text>
                        {dietLabel ? (
                          <View style={s.dietBadge}>
                            <Text style={s.dietBadgeTxt}>{dietLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={s.foodLoc}>
                        📍 {doc.pickupAddress} • {timeAgo(doc.createdAt)}
                      </Text>
                      {/* Expiry badge */}
                      {(() => {
                        const exp = formatExpiresAt(doc.expiresAt);
                        return exp.label ? (
                          <Text style={[s.expiryBadge, { color: exp.color }]}>
                            ⏳ {exp.label}
                          </Text>
                        ) : null;
                      })()}
                    </View>
                  </View>

                  <View style={s.divider} />

                  {/* Drop-off info */}
                  {!hasReceiver ? (
                    <Text style={s.dropoffPending}>
                      {t("donor.awaitingClaim")}
                    </Text>
                  ) : (
                      <View style={s.dropoffCol}>
                        <Text
                          style={[s.dropoffName, { color: textPrimary }]}
                          numberOfLines={1}
                        >
                          {t("donor.receiverHasClaimed")}
                        </Text>
                      <View style={s.dropoffHeaderRow}>
                        <Text style={s.dropoffPin}>📍</Text>
                        <Text style={s.dropoffTag}>{t("donor.dropOff")}</Text>
                      </View>

                      <Text style={s.dropoffAddr} numberOfLines={1}>
                        {doc.dropOffAddress}
                      </Text>
                    </View>
                  )}

                  {/* Delivery section — branches on deliveryMode:
                      "volunteer" → volunteer card + "Volunteer is on the way"
                      "self"      → receiver self-pickup notice, no volunteer UI
                      null/other  → legacy fallback (awaiting volunteer claim) */}
                  {!hasReceiver ? null : isVolunteerMode ? (
                    doc.assignedVolunteerId ? (
                      <>
                        {/* Expected time */}
                        {/*<Text style={s.expectedRow}>
                          {t("donor.expectedIn") + " "}
                          <Text style={s.expectedBold}>{t("donor.mins")}</Text>
                        </Text>*/}

                        <View style={s.divider} />

                        {/* Partner row */}
                        <View style={s.partnerRow}>
                          <View style={s.partnerAvatar}>
                            <Text style={s.partnerInitial}>
                              {(volunteerName?.trim()?.[0] ?? "V").toUpperCase()}
                            </Text>
                          </View>
                          <View style={s.partnerInfo}>
                            <Text style={s.partnerRoleLabel}>
                              {t("donor.deliveryPartner")}
                            </Text>
                            <Text
                              style={[s.partnerName, { color: textPrimary }]}
                              numberOfLines={1}
                            >
                              {volunteerName || t("donor.volunteerAssigned")}
                            </Text>
                            <View style={s.onTheWayRow}>
                              <Text style={s.onTheWayDot}>●</Text>
                              <Text style={s.onTheWayTxt}>
                                {t(
                                  "donor.volunteerOnTheWay",
                                  "Volunteer is on the way",
                                )}
                              </Text>
                            </View>
                          </View>
                          <View style={s.actionBtns}>
                            {/*<Pressable style={s.callBtn}>
                              <Text style={s.callBtnTxt}>
                                {t("donor.callBtn")}
                              </Text>
                            </Pressable>*/}
                            <Pressable
                              style={s.trackBtn}
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onPress={() =>
                                router.push(
                                  `/track-delivery?id=${doc.id}` as any,
                                )
                              }
                            >
                              <Text style={s.trackBtnTxt}>
                                {t("donor.trackDelivery")}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </>
                    ) : (
                      <View style={s.pendingContainer}>
                        <MaterialIcons
                          name="person-search"
                          size={20}
                          color={Brand.main}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[s.pendingText, { flex: 1 }]}>
                          {t("donor.volunteerNotAssigned")}
                        </Text>
                      </View>
                    )
                  ) : isSelfMode ? (
                    <View style={s.selfPickupRow}>
                      <View style={s.selfPickupIconWrap}>
                        <MaterialIcons
                          name="directions-walk"
                          size={20}
                          color={Brand.main}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.partnerRoleLabel}>
                          {t("donor.deliveryMethod", "Delivery Method")}
                        </Text>
                        <Text style={[s.selfPickupTitle, { color: textPrimary }]}>
                          {t("donor.selfPickup", "Self Pickup by Receiver")}
                        </Text>
                        <Text style={s.selfPickupSub}>
                          {t(
                            "donor.selfPickupSub",
                            "No volunteer needed — the receiver collects it directly.",
                          )}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={s.pendingContainer}>
                      <MaterialIcons
                        name="person-search"
                        size={20}
                        color={Brand.main}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[s.pendingText, { flex: 1 }]}>
                        {t("donor.volunteerNotAssigned")}
                      </Text>
                    </View>
                  )}

                  {/* View/Edit button */}
                  <TouchableOpacity
                    style={s.viewEditBtn}
                    onPress={() => openDrawer(doc)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name="create-outline"
                      size={14}
                      color={Brand.main}
                    />
                    <Text style={s.viewEditBtnTxt}>{t("donor.viewEdit")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <DonationDrawer
        doc={drawerDoc}
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 110 },

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

  // ── Stats Grid ──────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  statIconBox: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statIconEmoji: { fontSize: 24 },
  statInfo: { flex: 1 },
  statValRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statNum: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 2,
  },
  statLbl: {
    fontSize: 12,
    color: "#777",
    marginTop: 1,
    lineHeight: 16,
  },

  // ── Post Button ─────────────────────────────────────────────────────────────
  postBtn: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    backgroundColor: Brand.main,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  plusCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  plusSign: {
    color: Brand.main,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: -1,
  },
  postBtnTxt: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Section header ──────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.three,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  viewAll: {
    fontSize: 14,
    color: Brand.main,
    fontWeight: "600",
  },

  // ── Donation card ───────────────────────────────────────────────────────────
  donationCard: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: 14,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  accentStrip: { width: 4 },
  donationBody: {
    flex: 1,
    padding: Spacing.three,
  },

  // Top row
  topRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  foodImg: {
    width: 80,
    height: 80,
    borderRadius: 10,
    flexShrink: 0,
  },
  foodMeta: { flex: 1 },
  nameLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  foodName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  statusChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  statusChipTxt: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  qtyDietRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  foodQty: {
    fontSize: 13,
    color: Brand.main,
    fontWeight: "600",
  },
  dietBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#f0f0f0",
  },
  dietBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
  },
  foodLoc: {
    fontSize: 12,
    color: "#888",
  },

  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginVertical: 10,
  },

  dropoffCol: {
    flexShrink: 0,
  },
  dropoffHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 3,
  },
  dropoffPin: { fontSize: 12 },
  dropoffTag: {
    fontSize: 11,
    color: "#5b8dee",
    fontWeight: "700",
  },
  dropoffName: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  dropoffAddr: {
    fontSize: 11,
    color: "#888",
    lineHeight: 15,
    marginTop: 2,
  },

  // Expected time
  expectedRow: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  expectedBold: {
    fontWeight: "700",
    color: "#333",
  },

  // Partner row
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Brand.main,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  partnerInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  partnerInfo: { flex: 1 },
  partnerRoleLabel: {
    fontSize: 10,
    color: "#aaa",
    marginBottom: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
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
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
  },
  callBtn: {
    borderWidth: 1.5,
    borderColor: Brand.main,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnTxt: {
    color: Brand.main,
    fontSize: 12,
    fontWeight: "600",
  },
  trackBtn: {
    backgroundColor: Brand.main,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  trackBtnTxt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },

  // Self-pickup (receiver delivers, no volunteer)
  selfPickupRow: {
    flexDirection: "row",
    alignItems: "center",
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
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  selfPickupSub: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },

  // Expandable full-schema details panel
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    marginTop: 10,
    paddingVertical: 4,
  },
  detailsToggleTxt: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
  },
  detailsBox: {
    backgroundColor: "#f7f8f9",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
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

  // ── Rewards card ────────────────────────────────────────────────────────────
  rewardsCard: {
    marginHorizontal: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  rewardsRight: { flex: 1 },
  badgePillRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  badgePill: {
    borderWidth: 1.5,
    borderColor: "#e4e4e4",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fafafa",
  },
  badgePillTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#444",
  },
  ptsText: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#d6ede0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "68%",
    backgroundColor: Brand.main,
    borderRadius: 4,
  },

  // ── Active donations empty / pending placeholders ───────────────────────────
  emptyDonations: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  dropoffPending: {
    fontSize: 13,
    color: "#aaa",
    fontStyle: "italic",
    paddingVertical: 6,
  },
  partnerPending: {
    fontSize: 13,
    color: "#aaa",
    fontStyle: "italic",
    paddingVertical: 6,
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
  expiryBadge: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  viewEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.main,
    backgroundColor: "#f0faf4",
  },
  viewEditBtnTxt: {
    fontSize: 12,
    color: Brand.main,
    fontWeight: "600",
  },
});
