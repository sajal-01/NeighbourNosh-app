/**
 * complete-profile.tsx
 *
 * Shown automatically to new Google Sign-In users who have authenticated
 * but haven't selected a role yet (identified by `needsOnboarding: true`
 * in their Firestore `users/{uid}` document).
 *
 * After the user fills in this form:
 *  - `users/{uid}` is updated with name, role, mobileNumber, needsOnboarding: false
 *  - Optionally an `organizations` document is created
 *  - `router.replace("/(tabs)")` sends them to the main app
 *
 * The back gesture is disabled in _layout.tsx to prevent bypassing this step.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from "@react-native-firebase/firestore";
import { useAuth } from "@/context/auth";
import { Screen } from "@/components/screen";

const db = getFirestore();

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_TYPES = [
  "NGO",
  "Community Kitchen",
  "School",
  "Temple / Religious Institution",
  "Homeless Shelter",
  "Old-Age Home",
  "Other",
];

type UserRole = "donor" | "receiver" | "volunteer";

const USER_ROLES: {
  key: UserRole;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: "donor",
    label: "Donor",
    description: "I donate surplus food to those in need",
    icon: "🤲",
  },
  {
    key: "receiver",
    label: "Receiver",
    description: "I receive donated food for my organisation",
    icon: "🏛️",
  },
  {
    key: "volunteer",
    label: "Volunteer",
    description: "I help deliver food to receivers",
    icon: "🛵",
  },
];

// ── Brand colors ──────────────────────────────────────────────────────────────

const B = {
  green: "#3a7d44",
  greenDark: "#2d6035",
  bg: "#e8f5e1",
  inputBg: "#ffffff",
  inputBorder: "#c5ddc6",
  placeholder: "#9e9e9e",
  bodyText: "#333333",
  error: "#d32f2f",
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CompleteProfileScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  // Pre-fill name from Google displayName
  const [name, setName] = useState(user?.displayName ?? "");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<UserRole>("donor");
  const [orgType, setOrgType] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgDrawerVisible, setOrgDrawerVisible] = useState(false);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleContinue() {
    if (!user) return;

    if (!name.trim()) {
      Alert.alert(
        t("auth.completeProfile.errorName"),
        t("auth.completeProfile.errorNameMsg"),
      );
      return;
    }
    if (orgType && !orgName.trim()) {
      Alert.alert(
        t("auth.completeProfile.errorOrgName"),
        t("auth.completeProfile.errorOrgNameMsg"),
      );
      return;
    }

    setLoading(true);
    try {
      // Update the user's Firestore document
      await updateDoc(doc(db, "users", user.uid), {
        name: name.trim(),
        mobileNumber: mobile.trim(),
        role,
        needsOnboarding: false,
        updatedAt: serverTimestamp(),
      });

      // Create an organisations document if org details were provided
      if (orgType) {
        await addDoc(collection(db, "organizations"), {
          userId: user.uid,
          organizationName: orgName.trim(),
          organizationType: orgType,
          verificationStatus: "pending",
          address: orgAddress.trim(),
        });
      }

      // Replace the current route with /(tabs).
      // AuthContext's onSnapshot will set needsOnboarding: false, which prevents
      // RouteGuard from redirecting back here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)" as any);
    } catch (e) {
      Alert.alert(
        t("auth.completeProfile.errorGeneral"),
        e instanceof Error
          ? e.message
          : t("auth.completeProfile.errorGeneralMsg"),
      );
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      <Screen>
        <SafeAreaView style={s.safeArea} edges={["top"]}>
          {/* ── Welcome header ───────────────────────────────────────────── */}
          <View style={s.hero}>
            <Text style={s.heroEmoji}>🌿</Text>
            <Text style={s.heroTitle}>{t("auth.completeProfile.welcome")}</Text>
            <Text style={s.heroSub}>{t("auth.completeProfile.subtitle")}</Text>
          </View>

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <View style={s.form}>
            {/* Name */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>{t("auth.completeProfile.yourName")}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("auth.completeProfile.fullNamePlaceholder")}
                  placeholderTextColor={B.placeholder}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Mobile (optional) */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>
                {t("auth.completeProfile.mobile")}{" "}
                <Text style={s.optional}>(optional)</Text>
              </Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.textInput}
                  value={mobile}
                  onChangeText={setMobile}
                  placeholder={t("auth.completeProfile.mobilePlaceholder")}
                  placeholderTextColor={B.placeholder}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Role */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>{t("auth.completeProfile.iAmA")}</Text>
              <View style={s.roleGrid}>
                {USER_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={[s.roleCard, role === r.key && s.roleCardActive]}
                    onPress={() => setRole(r.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.roleIcon}>{r.icon}</Text>
                    <Text
                      style={[s.roleLabel, role === r.key && s.roleLabelActive]}
                    >
                      {t(`auth.completeProfile.roles.${r.key}.label`)}
                    </Text>
                    <Text style={s.roleDesc}>
                      {t(`auth.completeProfile.roles.${r.key}.description`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Organisation type (optional) */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>
                {t("auth.completeProfile.orgType")}{" "}
                <Text style={s.optional}>(optional)</Text>
              </Text>
              <TouchableOpacity
                style={s.picker}
                onPress={() => setOrgDrawerVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[s.pickerText, !orgType && s.pickerPlaceholder]}>
                  {orgType || t("auth.completeProfile.orgTypePlaceholder")}
                </Text>
                <Text style={s.pickerArrow}>⌄</Text>
              </TouchableOpacity>
            </View>

            {/* Org name + address (conditional) */}
            {orgType ? (
              <>
                <View style={s.fieldGroup}>
                  <Text style={s.label}>
                    {t("auth.completeProfile.orgName")}
                  </Text>
                  <View style={s.inputRow}>
                    <TextInput
                      style={s.textInput}
                      value={orgName}
                      onChangeText={setOrgName}
                      placeholder={t("auth.completeProfile.orgNamePlaceholder")}
                      placeholderTextColor={B.placeholder}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                <View style={s.fieldGroup}>
                  <Text style={s.label}>
                    {t("auth.completeProfile.orgAddress")}{" "}
                    <Text style={s.optional}>(optional)</Text>
                  </Text>
                  <View style={s.inputRow}>
                    <TextInput
                      style={s.textInput}
                      value={orgAddress}
                      onChangeText={setOrgAddress}
                      placeholder={t(
                        "auth.completeProfile.orgAddressPlaceholder",
                      )}
                      placeholderTextColor={B.placeholder}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[s.continueBtn, loading && s.continueBtnDisabled]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.continueBtnText}>
                  {t("auth.completeProfile.continueBtn")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Screen>

      {/* ── Org Type Bottom Drawer ──────────────────────────────────────────── */}
      <Modal
        visible={orgDrawerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setOrgDrawerVisible(false)}
      >
        <Pressable
          style={s.drawerOverlay}
          onPress={() => setOrgDrawerVisible(false)}
        >
          <View style={s.drawerSheet}>
            <View style={s.drawerHandle} />
            <Text style={s.drawerTitle}>
              {t("auth.completeProfile.selectOrgType")}
            </Text>

            {ORG_TYPES.map((type) => (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  s.drawerItem,
                  pressed && s.drawerItemPressed,
                  orgType === type && s.drawerItemSelected,
                ]}
                onPress={() => {
                  setOrgType(type);
                  setOrgDrawerVisible(false);
                }}
              >
                <Text
                  style={[
                    s.drawerItemText,
                    orgType === type && s.drawerItemTextSelected,
                  ]}
                >
                  {type}
                </Text>
                {orgType === type && <Text style={s.drawerCheckmark}>✓</Text>}
              </Pressable>
            ))}

            {/* Clear selection */}
            {orgType ? (
              <Pressable
                style={s.drawerClearBtn}
                onPress={() => {
                  setOrgType("");
                  setOrgName("");
                  setOrgAddress("");
                  setOrgDrawerVisible(false);
                }}
              >
                <Text style={s.drawerClearText}>
                  {t("auth.completeProfile.clearSelection")}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={s.drawerCancelBtn}
              onPress={() => setOrgDrawerVisible(false)}
            >
              <Text style={s.drawerCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: B.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  safeArea: {
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: "center",
    gap: 28,
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingTop: 48,
    gap: 10,
  },
  heroEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: B.green,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  heroSub: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },

  // Form
  form: {
    alignSelf: "stretch",
    gap: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: B.bodyText,
    paddingLeft: 2,
  },
  optional: {
    fontWeight: "400",
    color: "#888",
  },

  // Input
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: B.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: B.inputBorder,
    paddingHorizontal: 14,
    height: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: B.bodyText,
  },

  // Role grid
  roleGrid: {
    gap: 10,
  },
  roleCard: {
    backgroundColor: B.inputBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: B.inputBorder,
    padding: 14,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  roleCardActive: {
    borderColor: B.green,
    backgroundColor: "#f0faf2",
  },
  roleIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: B.bodyText,
  },
  roleLabelActive: {
    color: B.green,
  },
  roleDesc: {
    fontSize: 12,
    color: "#777",
    lineHeight: 17,
  },

  // Org type picker
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: B.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: B.inputBorder,
    paddingHorizontal: 14,
    height: 52,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  pickerText: {
    fontSize: 15,
    color: B.bodyText,
    flex: 1,
  },
  pickerPlaceholder: {
    color: B.placeholder,
  },
  pickerArrow: {
    fontSize: 18,
    color: "#aaa",
    lineHeight: 22,
  },

  // Continue button
  continueBtn: {
    backgroundColor: B.green,
    borderRadius: 26,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: B.greenDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  continueBtnDisabled: {
    opacity: 0.6,
  },
  continueBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Bottom drawer
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawerSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  drawerItemPressed: {
    backgroundColor: "#f9fafb",
  },
  drawerItemSelected: {
    backgroundColor: "#f0faf2",
  },
  drawerItemText: {
    fontSize: 15,
    color: "#374151",
  },
  drawerItemTextSelected: {
    color: B.green,
    fontWeight: "600",
  },
  drawerCheckmark: {
    fontSize: 16,
    color: B.green,
    fontWeight: "700",
  },
  drawerClearBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#fff3f3",
  },
  drawerClearText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
  drawerCancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  drawerCancelText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
});
