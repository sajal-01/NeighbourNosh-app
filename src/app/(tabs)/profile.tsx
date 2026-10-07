import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import i18next, {
  LANGUAGE_NAME_TO_CODE,
  LANGUAGE_CODE_TO_NAME,
  STORAGE_KEY,
} from "@/i18n";

const db = getFirestore();

import { useAuth } from "@/context/auth";
import { Brand } from "@/constants/theme";
import ScreenHeader from "@/components/screen-header";
import { useTheme } from "@/hooks/use-theme";

const LANGUAGES = [
  "English",
  "Hindi",
  "Kannada",
  "Tamil",
  "Telugu",
  "Malayalam",
];

function getActivityItems(t: (k: string) => string) {
  return [
    {
      icon: "📍",
      iconBg: "#e8f5ee",
      label: t("profile.savedLocations"),
      sub: t("profile.savedLocationsSub"),
      route: "/saved-locations",
    },
    {
      icon: "🏛️",
      iconBg: "#e8f5ee",
      label: t("profile.orgDetails"),
      sub: t("profile.orgDetailsSub"),
      route: "/organization-details",
    },
    {
      icon: "🛡️",
      iconBg: "#e8f5ee",
      label: t("profile.verificationDocs"),
      sub: t("profile.verificationDocsSub"),
      route: "/verification-documents",
    },
  ];
}

// ── Firestore types & helpers ────────────────────────────────────────────────

interface FirestoreProfile {
  name?: string;
  email?: string;
  mobileNumber?: string;
  role?: string;
  rewardPoints?: number;
  verificationStatus?: string;
  badges?: string[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function getRoleLabel(
  role: string | undefined,
  t: (k: string) => string,
): string {
  switch (role) {
    case "donor":
      return t("profile.verifiedDonor");
    case "receiver":
      return t("profile.verifiedReceiver");
    case "volunteer":
      return t("profile.verifiedVolunteer");
    default:
      return t("profile.member");
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut, role } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [langModalVisible, setLangModalVisible] = useState(false);
  // Initialise from the current i18next language
  const [selectedLang, setSelectedLang] = useState(
    () =>
      LANGUAGE_CODE_TO_NAME[
        i18next.language as keyof typeof LANGUAGE_CODE_TO_NAME
      ] ?? "English",
  );
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  // Sync selectedLang display name when language changes externally
  useEffect(() => {
    const name =
      LANGUAGE_CODE_TO_NAME[
        i18next.language as keyof typeof LANGUAGE_CODE_TO_NAME
      ] ?? "English";
    setSelectedLang(name);
  }, [i18next.language]);

  const ACTIVITY_ITEMS = getActivityItems(t);

  const [profile, setProfile] = useState<FirestoreProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const appVersion = Constants.expoConfig?.version;

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

  const bg = theme.background; // #F4FBF7
  const cardBg = "#ffffff";
  const divider = "#f0f4f1";
  const textPrimary = "#0f2419";
  const textSecondary = "#5a7a62";
  const borderColor = "#e0ede5";

  const handleViewLeaderboard = () => {
    router.push(role === "volunteer" ? "/volunteer-rewards" : "/rewards");
  };

  async function handleLanguageChange(langName: string) {
    setSelectedLang(langName);
    setLangModalVisible(false);
    const code = LANGUAGE_NAME_TO_CODE[langName] ?? "en";
    // Immediately switch UI language across all screens
    await i18next.changeLanguage(code);
    // Persist so the preference survives restarts, updates, and reboots
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {
      /* non-critical */
    });
  }

  async function handleLogOut() {
    Alert.alert(
      t("profile.logOutConfirmTitle"),
      t("profile.logOutConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profile.logOut"),
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
            } catch {
              Alert.alert(t("common.error"), t("profile.logOutError"));
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title={t("profile.title")} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, marginTop: 16 },
          ]}
        >
          <View style={styles.profileRow}>
            {/* Avatar */}
            <View style={styles.avatarWrapper}>
              <View
                style={[styles.avatarCircle, { backgroundColor: Brand.main }]}
              >
                <Text style={styles.avatarInitials}>
                  {profileLoading
                    ? "…"
                    : getInitials(profile?.name ?? user?.displayName ?? "")}
                </Text>
              </View>
              {/*<View
                style={[
                  styles.cameraBtn,
                  { backgroundColor: "#ffffff", borderColor: borderColor },
                ]}
              >
                <Text style={{ fontSize: 12 }}>📷</Text>
              </View>*/}
            </View>

            {/* Info */}
            <View style={styles.profileInfo}>
              <Text style={[styles.userName, { color: textPrimary }]}>
                {profileLoading
                  ? t("profile.loading")
                  : (profile?.name ?? user?.displayName ?? t("profile.user"))}
              </Text>

              <View style={styles.profileTagRow}>
                {/* Verified badge */}
                <View
                  style={[
                    styles.verifiedBadge,
                    { backgroundColor: "#e8f5ee", borderColor: Brand.main },
                  ]}
                >
                  <Text style={[styles.verifiedText, { color: Brand.main }]}>
                    ✓ {getRoleLabel(profile?.role, t)}
                  </Text>
                </View>

                {/* Edit button */}
                <Pressable
                  style={[styles.editBtn, { borderColor: Brand.main }]}
                  accessibilityRole="button"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push("/edit-profile" as any)}
                >
                  <Text style={[styles.editBtnText, { color: Brand.main }]}>
                    {t("profile.editProfile")}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.contactRow}>
                <Text style={styles.contactIcon}>✉</Text>
                <Text style={[styles.contactText, { color: textSecondary }]}>
                  {profile?.email ?? user?.email ?? ""}
                </Text>
              </View>
              <View style={styles.contactRow}>
                <Text style={styles.contactIcon}>📞</Text>
                <Text style={[styles.contactText, { color: textSecondary }]}>
                  {profile?.mobileNumber ?? "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── My Impact & Rewards (donor + volunteer only) ─────────────── */}
        {role !== "receiver" && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            {/* Card header */}
            <View style={styles.impactHeader}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                {t("profile.myImpact")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleViewLeaderboard}
              >
                <Text style={[styles.viewLeaderboard, { color: Brand.main }]}>
                  {t("profile.viewLeaderboard")}
                </Text>
              </Pressable>
            </View>

            {/* Three columns */}
            <View style={[styles.impactColumns, { borderTopColor: divider }]}>
              {/* Points */}
              <View style={styles.impactCol}>
                <Text style={styles.impactMedalEmoji}>🏅</Text>
                <Text style={[styles.impactBigNumber, { color: textPrimary }]}>
                  {(profile?.rewardPoints ?? 0).toLocaleString()}
                </Text>
                <Text style={[styles.impactColLabel, { color: textSecondary }]}>
                  {t("profile.rewardPoints")}
                </Text>
              </View>

              {/* Separator */}
              <View style={[styles.impactSep, { backgroundColor: divider }]} />

              {/* Badges */}
              <View style={styles.impactCol}>
                <Text
                  style={[
                    styles.impactColLabel,
                    { color: textPrimary, fontWeight: "700", marginBottom: 8 },
                  ]}
                >
                  {t("profile.badgesEarned")}
                </Text>
                <View style={styles.badgeCircleRow}>
                  {(profile?.badges ?? ["❤️", "🌱", "50"]).map((b, i) => (
                    <View
                      key={i}
                      style={[
                        styles.badgeCircle,
                        {
                          backgroundColor: ["#ef4444", "#50b070", "#3b82f6"][
                            i % 3
                          ],
                          marginLeft: i > 0 ? -10 : 0,
                        },
                      ]}
                    >
                      <Text style={styles.badgeCircleLabel}>{b}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.moreBadges, { color: textSecondary }]}>
                  {t("profile.moreBadges")}
                </Text>
              </View>

              {/* Separator */}
              <View style={[styles.impactSep, { backgroundColor: divider }]} />

              {/* Rank */}
              <View style={styles.impactCol}>
                <Text style={styles.trophyEmoji}>🏆</Text>
                <Text style={[styles.impactBigNumber, { color: textPrimary }]}>
                  #7
                </Text>
                <Text style={[styles.impactColLabel, { color: textSecondary }]}>
                  {t("profile.thisWeek")}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Activity & History ───────────────────────────────────────── */}
        <Text style={[styles.groupLabel, { color: textPrimary }]}>
          {t("profile.activityHistory")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, padding: 0 },
          ]}
        >
          {ACTIVITY_ITEMS.map((item, idx) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuRow,
                pressed && styles.rowPressed,
                idx < ACTIVITY_ITEMS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: divider,
                },
              ]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => item.route && router.push(item.route as any)}
              accessibilityRole="button"
            >
              <View
                style={[styles.menuIconBox, { backgroundColor: item.iconBg }]}
              >
                <Text style={styles.menuIconEmoji}>{item.icon}</Text>
              </View>
              <View style={styles.menuTextBlock}>
                <Text style={[styles.menuLabel, { color: textPrimary }]}>
                  {item.label}
                </Text>
                <Text style={[styles.menuSub, { color: textSecondary }]}>
                  {item.sub}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* ── App Settings ─────────────────────────────────────────────── */}
        <Text style={[styles.groupLabel, { color: textPrimary }]}>
          {t("profile.appSettings")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, padding: 0 },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.rowPressed,
            ]}
            onPress={() => setLangModalVisible(true)}
            accessibilityRole="button"
          >
            <View style={[styles.menuIconBox, { backgroundColor: "#e8f5ee" }]}>
              <Text style={styles.menuIconEmoji}>🌐</Text>
            </View>
            <View style={styles.menuTextBlock}>
              <Text style={[styles.menuLabel, { color: textPrimary }]}>
                {t("profile.language")}
              </Text>
              <Text style={[styles.menuSub, { color: textSecondary }]}>
                {t("profile.languageSub")}
              </Text>
            </View>
            <Text style={[styles.langValue, { color: textSecondary }]}>
              {selectedLang}
            </Text>
            <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
          </Pressable>
        </View>

        {/* ── Help & Support ───────────────────────────────────────────── */}
        <Text style={[styles.groupLabel, { color: textPrimary }]}>
          {t("profile.helpSupport")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, padding: 0 },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.rowPressed,
            ]}
            onPress={() => setHelpModalVisible(true)}
            accessibilityRole="button"
          >
            <View style={[styles.menuIconBox, { backgroundColor: "#e8f0ff" }]}>
              <Text style={styles.menuIconEmoji}>🎧</Text>
            </View>
            <View style={styles.menuTextBlock}>
              <Text style={[styles.menuLabel, { color: textPrimary }]}>
                {t("profile.helpSupport")}
              </Text>
              <Text style={[styles.menuSub, { color: textSecondary }]}>
                {t("profile.helpSupportSub")}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
          </Pressable>
        </View>

        {/* ── Account ──────────────────────────────────────────────────── */}
        <Text style={[styles.groupLabel, { color: textPrimary }]}>
          {t("profile.account")}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, padding: 0 },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.rowPressed,
            ]}
            onPress={handleLogOut}
            accessibilityRole="button"
          >
            <View style={[styles.menuIconBox, { backgroundColor: "#ffeeed" }]}>
              <Text style={styles.menuIconEmoji}>🚪</Text>
            </View>
            <View style={styles.menuTextBlock}>
              <Text style={[styles.menuLabel, { color: "#ef4444" }]}>
                {t("profile.logOut")}
              </Text>
              <Text style={[styles.menuSub, { color: "#f87171" }]}>
                {t("profile.logOutSub")}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: "#ef4444" }]}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Help & Support Modal ─────────────────────────────────────────── */}
      <Modal
        visible={helpModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHelpModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setHelpModalVisible(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            {/* Handle bar */}
            <View
              style={[styles.modalHandle, { backgroundColor: borderColor }]}
            />

            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              {t("profile.helpSupportTitle")}
            </Text>

            {/* Privacy Policy */}
            <Pressable
              style={({ pressed }) => [
                styles.helpItem,
                { borderBottomColor: divider },
                pressed && styles.rowPressed,
              ]}
              onPress={() =>
                openBrowserAsync("https://neighbournosh.vercel.app/privacy")
              }
              accessibilityRole="link"
            >
              <Text style={styles.helpItemIcon}>🔒</Text>
              <View style={styles.helpItemText}>
                <Text style={[styles.helpItemLabel, { color: textPrimary }]}>
                  {t("profile.privacyPolicy")}
                </Text>
                <Text style={[styles.helpItemSub, { color: textSecondary }]}>
                  {t("profile.privacyPolicySub")}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
            </Pressable>

            {/* Terms & Conditions */}
            <Pressable
              style={({ pressed }) => [
                styles.helpItem,
                { borderBottomColor: divider },
                pressed && styles.rowPressed,
              ]}
              onPress={() =>
                openBrowserAsync(
                  "https://neighbournosh.vercel.app/services#terms",
                )
              }
              accessibilityRole="link"
            >
              <Text style={styles.helpItemIcon}>📋</Text>
              <View style={styles.helpItemText}>
                <Text style={[styles.helpItemLabel, { color: textPrimary }]}>
                  {t("profile.termsConditions")}
                </Text>
                <Text style={[styles.helpItemSub, { color: textSecondary }]}>
                  {t("profile.termsConditionsSub")}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
            </Pressable>

            {/* Contact Us */}
            <Pressable
              style={({ pressed }) => [
                styles.helpItem,
                { borderBottomColor: cardBg },
                pressed && styles.rowPressed,
              ]}
              onPress={() =>
                openBrowserAsync(
                  "https://neighbournosh.vercel.app/services#contact",
                )
              }
              accessibilityRole="link"
            >
              <Text style={styles.helpItemIcon}>📩</Text>
              <View style={styles.helpItemText}>
                <Text style={[styles.helpItemLabel, { color: textPrimary }]}>
                  {t("profile.contactUs")}
                </Text>
                <Text style={[styles.helpItemSub, { color: textSecondary }]}>
                  {t("profile.contactUsSub")}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
            </Pressable>

            {/* Version */}
            <View
              style={[
                styles.helpVersion,
                { borderTopColor: cardBg, paddingBottom: 25 },
              ]}
            >
              <Text style={[styles.helpVersionLabel, { color: textSecondary }]}>
                {t("profile.appName")}
              </Text>
              <Text
                style={[styles.helpVersionNumber, { color: textSecondary }]}
              >
                {t("profile.version")} {appVersion}
              </Text>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Language Modal ───────────────────────────────────────────────── */}
      <Modal
        visible={langModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLangModalVisible(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            {/* Handle bar */}
            <View
              style={[styles.modalHandle, { backgroundColor: borderColor }]}
            />

            <Text style={[styles.modalTitle, { color: textPrimary }]}>
              {t("profile.selectLanguage")}
            </Text>

            {LANGUAGES.map((lang) => (
              <Pressable
                key={lang}
                style={({ pressed }) => [
                  styles.langOption,
                  { borderBottomColor: divider },
                  pressed && styles.rowPressed,
                ]}
                onPress={() => handleLanguageChange(lang)}
                accessibilityRole="radio"
                accessibilityState={{ selected: lang === selectedLang }}
              >
                <Text
                  style={[
                    styles.langOptionText,
                    { color: lang === selectedLang ? Brand.main : textPrimary },
                  ]}
                >
                  {lang}
                </Text>
                {lang === selectedLang && (
                  <Text
                    style={{
                      color: Brand.main,
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    ✓
                  </Text>
                )}
              </Pressable>
            ))}

            <Pressable
              style={[styles.modalCancelBtn, { borderColor: Brand.main }]}
              onPress={() => setLangModalVisible(false)}
            >
              <Text style={[styles.modalCancelText, { color: Brand.main }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },

  // ── App bar ──
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  appBarTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  bellWrapper: {
    position: "absolute",
    right: 16,
  },
  bellIcon: {
    fontSize: 22,
  },
  pulseDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 14,
  },

  // ── Card shell ──
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // ── Profile card ──
  profileRow: {
    flexDirection: "row",
    gap: 14,
  },
  avatarWrapper: {
    position: "relative",
    width: 86,
    height: 86,
    flexShrink: 0,
  },
  avatarCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cameraBtn: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
    gap: 6,
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
  },
  profileTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  verifiedBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "700",
  },
  editBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactIcon: {
    fontSize: 13,
  },
  contactText: {
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Impact & Rewards card ──
  impactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  viewLeaderboard: {
    fontSize: 13,
    fontWeight: "600",
  },
  impactColumns: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 16,
  },
  impactCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  impactSep: {
    width: 1,
    marginHorizontal: 4,
  },
  impactMedalEmoji: {
    fontSize: 30,
    marginBottom: 2,
  },
  trophyEmoji: {
    fontSize: 28,
    marginBottom: 2,
    color: Brand.main,
  },
  impactBigNumber: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  impactColLabel: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 14,
  },
  badgeCircleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  badgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  badgeCircleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  moreBadges: {
    fontSize: 11,
    fontWeight: "600",
  },

  // ── Group labels ──
  groupLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
    marginBottom: -4,
    paddingLeft: 2,
  },

  // ── Menu rows (Activity / Settings / Help / Account) ──
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  menuIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuIconEmoji: {
    fontSize: 20,
  },
  menuTextBlock: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  menuSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    fontSize: 22,
    fontWeight: "400",
    lineHeight: 24,
  },
  langValue: {
    fontSize: 14,
    fontWeight: "500",
    marginRight: 2,
  },

  // ── Language modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 80,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  langOptionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalCancelBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 26,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "700",
  },

  // ── Help & Support Modal items ──
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  helpItemIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  helpItemText: {
    flex: 1,
    gap: 2,
  },
  helpItemLabel: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  helpItemSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  helpVersion: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  helpVersionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  helpVersionNumber: {
    fontSize: 12,
  },
});
