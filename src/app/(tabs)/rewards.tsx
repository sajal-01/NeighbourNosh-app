import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Brand, Spacing, BottomTabInset } from "@/constants/theme";
import ScreenHeader from "@/components/screen-header";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "react-i18next";
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  where,
} from "@react-native-firebase/firestore";

const db = getFirestore();
import { useAuth } from "@/context/auth";
// ── Static data ───────────────────────────────────────────────────────────────

const BADGES = [
  {
    id: "1",
    label: "Zero Waste\nWarrior",
    icon: "🌱",
    bg: "#50b070",
    border: "#1b6636",
    locked: false,
  },
  {
    id: "2",
    label: "Hunger Hero",
    icon: "⭐",
    bg: "#f5a623",
    border: "#d4881e",
    locked: false,
  },
  {
    id: "3",
    label: "Kindness\nChampion",
    icon: "❤️",
    bg: "#a0522d",
    border: "#7a3b1e",
    locked: false,
  },
  {
    id: "4",
    label: "50 Donations\nMilestone",
    icon: "🔒",
    bg: "#c2cdd6",
    border: "#9baab5",
    locked: true,
  },
  {
    id: "5",
    label: "100 Donations\nMilestone",
    icon: "🔒",
    bg: "#c2cdd6",
    border: "#9baab5",
    locked: true,
  },
] as const;

const TOP_DONORS = [
  {
    rank: 1,
    name: "Green Leaf Restaurant",
    meals: 280,
    points: "2,250",
    avatar: "https://i.pravatar.cc/150?img=33",
    crown: true,
  },
  {
    rank: 2,
    name: "Annapoorna Foundation",
    meals: 210,
    points: "1,180",
    avatar: "https://i.pravatar.cc/150?img=47",
    crown: false,
  },
  {
    rank: 3,
    name: "Food For All NGO",
    meals: 175,
    points: "1,060",
    avatar: "https://i.pravatar.cc/150?img=58",
    crown: false,
  },
];

const MY_ENTRY = {
  rank: 14,
  name: "You",
  meals: 32,
  points: "450",
  avatar: "https://i.pravatar.cc/150?img=12",
};

// ── Rank Badge ────────────────────────────────────────────────────────────────

const RANK_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: "#f5a623", text: "#fff" },
  2: { bg: "#96a4ae", text: "#fff" },
  3: { bg: "#b87333", text: "#fff" },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function RankBadge({ rank }: { rank: number }) {
  const col = RANK_COLORS[rank] ?? { bg: "#e8f5ee", text: Brand.main };
  return (
    <View style={[rb.circle, { backgroundColor: col.bg }]}>
      <Text style={[rb.num, { color: col.text }]}>{rank}</Text>
    </View>
  );
}

const rb = StyleSheet.create({
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  num: { fontSize: 14, fontWeight: "800" },
});

// ── ShieldBadge ───────────────────────────────────────────────────────────────

function ShieldBadge() {
  return (
    <View style={shS.container}>
      {/* Laurel + shield */}
      <View style={shS.bodyRow}>
        <View style={shS.shieldWrap}>
          <View style={shS.shieldTop}>
            <Text style={shS.starText}>★</Text>
          </View>
          <View style={shS.shieldTip} />
        </View>
      </View>
    </View>
  );
}

const shS = StyleSheet.create({
  container: {
    width: 88,
    height: 88,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sparkle: {
    position: "absolute",
    fontSize: 11,
    color: "#f5a623",
    zIndex: 1,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  laurel: {
    fontSize: 22,
    marginTop: 8,
  },
  laurelFlip: {
    transform: [{ scaleX: -1 }],
  },
  shieldWrap: {
    alignItems: "center",
    marginHorizontal: 2,
  },
  shieldTop: {
    width: 46,
    height: 44,
    backgroundColor: Brand.main,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  shieldTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 23,
    borderRightWidth: 23,
    borderTopWidth: 18,
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Brand.main,
  },
  starText: {
    fontSize: 24,
    color: "#ffffff",
    fontWeight: "bold",
  },
});

// ── Screen ────────────────────────────────────────────────────────────────────

interface FirestoreProfile {
  name?: string;
  email?: string;
  mobileNumber?: string;
  role?: string;
  rewardPoints?: number;
  verificationStatus?: string;
  badges?: string[];
}

export default function RewardsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const cardBg = "#ffffff";
  const textPrimary = theme.text;
  const { t } = useTranslation();

  const [profile, setProfile] = useState<FirestoreProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [stats, setStats] = useState({ totalDonations: 0, mealsSaved: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as FirestoreProfile) : null);
        setProfileLoading(false);
      },
      () => setProfileLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || profile?.role !== "donor") {
      setStatsLoading(false);
      return;
    }

    const deliveredDonationsQuery = query(
      collection(db, "donations"),
      where("donorId", "==", user.uid),
      where("status", "==", "delivered"),
    );

    const unsub = onSnapshot(
      deliveredDonationsQuery,
      (snap) => {
        let totalDonations = 0;
        let mealsSaved = 0;
        snap.forEach((docSnap) => {
          totalDonations += 1;
          const qty = docSnap.data()?.quantity;
          if (typeof qty === "number") {
            mealsSaved += qty;
          }
        });
        setStats({ totalDonations, mealsSaved });
        setStatsLoading(false);
      },
      () => setStatsLoading(false),
    );
    return unsub;
  }, [user?.uid, profile?.role]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={t("rewards.screenTitle")} />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. Total Reward Points Card ────────────────────────────────────── */}
        <View style={s.pointsCard}>
          {/* Leaf decorations */}
          <Text style={[s.leaf, { top: 0, left: 8 }]}>🍃</Text>
          <Text
            style={[
              s.leaf,
              { top: 16, left: 30, transform: [{ rotate: "-25deg" }] },
            ]}
          >
            🌿
          </Text>
          {/* Sparkle accents */}
          <Text style={[s.sparkle, { top: 14, left: "43%" }]}>✦</Text>
          <Text style={[s.sparkle, { top: 30, right: "25%", fontSize: 9 }]}>
            ✦
          </Text>
          <Text
            style={[
              s.sparkle,
              { top: 54, left: "28%", fontSize: 8, color: "#aed6bc" },
            ]}
          >
            +
          </Text>
          <Text style={[s.sparkle, { bottom: 50, right: "20%", fontSize: 9 }]}>
            ✦
          </Text>

          <Text style={s.pointsLabel}>{t("rewards.totalRewardPoints")}</Text>

          <View style={s.pointsValueRow}>
            <Text style={s.pointsNum}>
              {profileLoading
                ? "0"
                : (profile?.rewardPoints ?? 0).toLocaleString()}
            </Text>
            <View style={s.goldCoin}>
              <Text style={s.goldCoinStar}>★</Text>
            </View>
          </View>

          <View style={s.cardHDivider} />

          <View style={s.pointsStats}>
            {/* Donations Made */}
            <View style={s.pointsStat}>
              <View style={s.pointsStatIcon}>
                <Text style={s.pointsStatEmoji}>🎁</Text>
              </View>
              <View>
                <Text style={s.pointsStatNum}>{stats.totalDonations}</Text>
                <Text style={s.pointsStatLbl}>
                  {t("rewards.donationsMade")}
                </Text>
              </View>
            </View>

            <View style={s.cardVDivider} />

            {/* Meals Saved */}
            <View style={s.pointsStat}>
              <View style={s.pointsStatIcon}>
                <Text style={s.pointsStatEmoji}>🍽️</Text>
              </View>
              <View>
                <Text style={s.pointsStatNum}>{stats.mealsSaved}</Text>
                <Text style={s.pointsStatLbl}>{t("rewards.mealsSaved")}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. Earned Badges ───────────────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>{t("rewards.earnedBadges")}</Text>
          {/*<Pressable style={s.seeAllBtn}>
            <Text style={s.seeAllText}>{t("rewards.viewAll")}</Text>
            <Ionicons name="chevron-forward" size={14} color={Brand.main} />
          </Pressable>*/}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.badgesScroll}
        >
          {BADGES.map((badge) => (
            <View key={badge.id} style={s.badgeItem}>
              <View
                style={[
                  s.badgeCircle,
                  { backgroundColor: badge.bg, borderColor: badge.border },
                  badge.locked && s.badgeLocked,
                ]}
              >
                <Text style={[s.badgeIcon, badge.locked && { opacity: 0.75 }]}>
                  {badge.icon}
                </Text>
              </View>
              <Text style={[s.badgeLabel, badge.locked && s.badgeLabelLocked]}>
                {badge.label}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* ── 4. Top Donors Leaderboard ──────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>{t("rewards.topDonorsWeek")}</Text>
          {/*<Pressable style={s.seeAllBtn}>
            <Text style={s.seeAllText}>{t("rewards.seeAll")}</Text>
            <Ionicons name="chevron-forward" size={14} color={Brand.main} />
          </Pressable>*/}
        </View>

        <View style={s.leaderCard}>
          {TOP_DONORS.map((donor, idx) => (
            <View key={donor.rank}>
              <View style={s.donorRow}>
                <RankBadge rank={donor.rank} />
                {/*<Image
                  source={{ uri: donor.avatar }}
                  style={s.donorAvatar}
                  contentFit="cover"
                />*/}
                <View style={s.avatarWrapper}>
                  <View
                    style={[s.avatarCircle, { backgroundColor: Brand.main }]}
                  >
                    <Text style={s.avatarInitials}>
                      {getInitials(donor.name)}
                    </Text>
                  </View>
                </View>
                <View style={s.donorInfo}>
                  <View style={s.donorNameRow}>
                    <Text style={s.donorName} numberOfLines={1}>
                      {donor.name}
                    </Text>
                    {donor.crown && <Text style={s.crownEmoji}>👑</Text>}
                  </View>
                  <Text style={s.donorMeals}>
                    {donor.meals} {t("rewards.mealsDonated")}
                  </Text>
                </View>
                <Text style={s.donorPts}>
                  {donor.points} {t("rewards.pts")}
                </Text>
              </View>
              {idx < TOP_DONORS.length - 1 && <View style={s.rowDivider} />}
            </View>
          ))}

          <View style={s.rowDivider} />

          {/* You row */}
          <View style={[s.donorRow, s.youRow]}>
            <Text style={s.youRank}>#{MY_ENTRY.rank}</Text>
            {/*<Image
              source={{ uri: MY_ENTRY.avatar }}
              style={s.donorAvatar}
              contentFit="cover"
            />*/}
            <View style={s.avatarWrapper}>
              <View
                style={[s.avatarCircle, { backgroundColor: Brand.main }]}
              >
                <Text style={s.avatarInitials}>
                  {getInitials(profile?.name ?? MY_ENTRY.name)}
                </Text>
              </View>
            </View>
            <View style={s.donorInfo}>
              <Text style={[s.donorName, { color: Brand.main }]}>
                {profile?.name ?? MY_ENTRY.name} ({MY_ENTRY.name})
              </Text>
              <Text style={s.donorMeals}>
                {statsLoading ? "—" : stats.totalDonations} {t("rewards.mealsDonated")}
              </Text>
            </View>
            <Text style={[s.donorPts, { color: Brand.main }]}>
              {/*{MY_ENTRY.points} {t("rewards.pts")}*/}
              {profileLoading
                ? "0"
                : (profile?.rewardPoints ?? 0).toLocaleString()}{" "}
              {t("rewards.pts")}
            </Text>
          </View>
        </View>

        {/* ──  Rewards progressFill ─────────────────────────────────────── */}
        <Text
          style={[
            s.sectionTitle,
            {
              color: textPrimary,
              marginHorizontal: Spacing.three,
              marginTop: Spacing.four,
              marginBottom: Spacing.two,
            },
          ]}
        >
          {t("rewards.rewardsRecognition")}
        </Text>

        <View style={[s.rewardsCard, { backgroundColor: cardBg }]}>
          <ShieldBadge />
          <View style={s.rewardsRight}>
            <View style={s.badgePillRow}>
              <View style={s.badgePill}>
                <Text style={s.badgePillTxt}>{t("rewards.topDonor")}</Text>
              </View>
              <View style={s.badgePill}>
                <Text style={s.badgePillTxt}>{t("rewards.hungerHero")}</Text>
              </View>
            </View>
            <Text style={[s.ptsText, { color: textPrimary }]}>
              {t("rewards.ptsToNext", {
                current: profileLoading ? 0 : (profile?.rewardPoints ?? 0),
                max: 500,
              })}
            </Text>
            <View style={s.progressTrack}>
              <View style={s.progressFill} />
            </View>
          </View>
        </View>
        {/* ── 5. Motivational Banner ─────────────────────────────────────────── */}
        <View style={s.motiveBanner}>
          <View style={s.motiveLeft}>
            <Text style={s.trophyEmoji}>🏆</Text>
          </View>
          <View style={s.motiveBody}>
            <Text style={s.motiveHeadline}>
              {t("rewards.keepGoing")}
              <Text style={s.motiveSparkle}>✦</Text>
            </Text>
            <Text style={s.motiveSub}>{t("rewards.donateMore")}</Text>
          </View>
          {/*<Text style={s.motiveSparkleRight}>✦</Text>*/}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#f2f4f6",
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.four,
  },

  avatarWrapper: {
    position: "relative",
    width: 48,
    height: 48,
    flexShrink: 0,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: Spacing.three,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f2419",
    letterSpacing: -0.3,
  },
  bellBtn: {
    position: "relative",
    padding: 4,
  },
  bellDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  // ── Rewards progressFill ────────────────────────────────────────────────────────────
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
  // ── Points Card ─────────────────────────────────────────────────────────────
  pointsCard: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    borderRadius: 18,
    backgroundColor: "#eef7f2",
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#50b070",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  leaf: {
    position: "absolute",
    fontSize: 32,
    zIndex: 0,
    opacity: 0.85,
  },
  sparkle: {
    position: "absolute",
    fontSize: 12,
    color: "#f5a623",
    fontWeight: "800",
    zIndex: 0,
  },
  pointsLabel: {
    fontSize: 13,
    color: "#5c7a68",
    textAlign: "center",
    marginBottom: 2,
    fontWeight: "500",
  },
  pointsValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    marginTop: 2,
  },
  pointsNum: {
    fontSize: 52,
    fontWeight: "900",
    color: "#0d3820",
    letterSpacing: -1.5,
  },
  goldCoin: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f5a623",
    borderWidth: 3,
    borderColor: "#d4881e",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    elevation: 3,
    shadowColor: "#d4881e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  goldCoinStar: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "800",
    lineHeight: 22,
  },
  cardHDivider: {
    height: 1,
    backgroundColor: "#c0dece",
    marginBottom: 14,
  },
  pointsStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  pointsStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
  },
  cardVDivider: {
    width: 1,
    height: 44,
    backgroundColor: "#c0dece",
  },
  pointsStatIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#d4edde",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pointsStatEmoji: {
    fontSize: 20,
  },
  pointsStatNum: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f2419",
    lineHeight: 28,
  },
  pointsStatLbl: {
    fontSize: 11,
    color: "#5c7a68",
    lineHeight: 15,
  },

  // ── Section row ─────────────────────────────────────────────────────────────
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.three,
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 14,
    color: Brand.main,
    fontWeight: "600",
  },

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgesScroll: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 6,
    gap: 4,
  },
  badgeItem: {
    alignItems: "center",
    width: 82,
    marginRight: 6,
  },
  badgeCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3.5,
    marginBottom: 6,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  badgeLocked: {
    opacity: 0.65,
  },
  badgeIcon: {
    fontSize: 28,
  },
  badgeLabel: {
    fontSize: 11,
    color: "#374151",
    textAlign: "center",
    lineHeight: 15,
    fontWeight: "500",
  },
  badgeLabelLocked: {
    color: "#9ca3af",
  },

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  leaderCard: {
    marginHorizontal: Spacing.three,
    borderRadius: 16,
    backgroundColor: "#fff",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  donorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  donorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    flexShrink: 0,
  },
  donorInfo: {
    flex: 1,
    minWidth: 0,
  },
  donorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  donorName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    flexShrink: 1,
  },
  crownEmoji: {
    fontSize: 14,
    flexShrink: 0,
  },
  donorMeals: {
    fontSize: 12,
    color: "#6b7280",
  },
  donorPts: {
    fontSize: 14,
    fontWeight: "700",
    color: Brand.main,
    flexShrink: 0,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#f0f2f4",
    marginHorizontal: 14,
  },
  youRow: {
    backgroundColor: "#f6fdf9",
  },
  youRank: {
    width: 38,
    fontSize: 15,
    fontWeight: "800",
    color: Brand.main,
    textAlign: "center",
    flexShrink: 0,
  },

  // ── Motivational Banner ─────────────────────────────────────────────────────
  motiveBanner: {
    marginHorizontal: Spacing.three,
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: "#f0faf4",
    borderWidth: 1.5,
    borderColor: "#b4ddc3",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 1,
    shadowColor: "#50b070",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  motiveLeft: {
    position: "relative",
    flexShrink: 0,
    width: 52,
    alignItems: "center",
  },
  trophyEmoji: {
    fontSize: 46,
  },
  motiveLeaves: {
    position: "absolute",
    bottom: -2,
    right: -10,
    fontSize: 20,
    transform: [{ rotate: "30deg" }],
  },
  motiveBody: {
    flex: 1,
  },
  motiveHeadline: {
    fontSize: 13,
    fontWeight: "700",
    color: Brand.main,
    lineHeight: 19,
    marginBottom: 4,
  },
  motiveSub: {
    fontSize: 12,
    color: "#4b5563",
    lineHeight: 17,
  },
  motiveSparkle: {
    color: "#f5a623",
    fontSize: 13,
    fontWeight: "800",
  },
  motiveSparkleRight: {
    fontSize: 16,
    color: "#f5a623",
    flexShrink: 0,
    fontWeight: "800",
  },
});
