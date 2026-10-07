import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";

const db = getFirestore();

import { useAuth } from "@/context/auth";
import { Brand } from "@/constants/theme";

// ── Constants ─────────────────────────────────────────────────────────────────

type Role = "donor" | "receiver" | "volunteer";

// ── Palette (mirrors profile.tsx) ─────────────────────────────────────────────

const P = {
  bg: "#F4FBF7",
  cardBg: "#ffffff",
  textPrimary: "#0f2419",
  textSecondary: "#5a7a62",
  border: "#e0ede5",
  placeholder: "#9e9e9e",
  error: "#d32f2f",
  inputBg: "#ffffff",
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("donor");

  const [roleDrawerVisible, setRoleDrawerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ROLES: {
    value: Role;
    label: string;
    description: string;
    emoji: string;
  }[] = [
    {
      value: "donor",
      label: t("editProfile.roles.donor.label"),
      description: t("editProfile.roles.donor.description"),
      emoji: "🤲",
    },
    {
      value: "receiver",
      label: t("editProfile.roles.receiver.label"),
      description: t("editProfile.roles.receiver.description"),
      emoji: "🏛️",
    },
    {
      value: "volunteer",
      label: t("editProfile.roles.volunteer.label"),
      description: t("editProfile.roles.volunteer.description"),
      emoji: "🚴",
    },
  ];

  // Pre-populate fields from Firestore
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data()!;
          setName(data.name ?? "");
          setPhone(data.mobileNumber ?? "");
          setRole((data.role as Role) ?? "donor");
        }
      })
      .finally(() => setLoading(false));
  }, [user?.uid]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    if (!user?.uid) return;

    setError(null);
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: name.trim(),
        mobileNumber: phone.trim(),
        role,
        updatedAt: serverTimestamp(),
      });
      // Use replace instead of back so this screen is not in the back-stack.
      // The role redirect in app-tabs.tsx will immediately send the user to
      // their role-specific home screen without leaving a stale history entry.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)/profile" as any);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = ROLES.find((r) => r.value === role)!;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: P.border }]}>
          <Pressable
            style={styles.headerBack}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <SymbolView
              name={{
                ios: "chevron.left",
                android: "arrow_back",
                web: "arrow_back",
              }}
              size={20}
              tintColor={Brand.main}
            />
            <Text style={[styles.headerBackText, { color: Brand.main }]}>
              {t("common.back")}
            </Text>
          </Pressable>

          <Text style={[styles.headerTitle, { color: P.textPrimary }]}>
            {t("editProfile.screenTitle")}
          </Text>

          {/* Spacer to centre the title */}
          <View style={styles.headerBack} />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Brand.main} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Profile fields card ── */}
            <View
              style={[
                styles.card,
                { backgroundColor: P.cardBg, borderColor: P.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: P.textPrimary }]}>
                {t("editProfile.personalInfo")}
              </Text>

              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>
                  {t("editProfile.name")}
                </Text>
                <View style={[styles.inputRow, { borderColor: P.border }]}>
                  <SymbolView
                    name={{ ios: "person", android: "person", web: "person" }}
                    size={18}
                    tintColor={P.placeholder}
                  />
                  <TextInput
                    style={[styles.textInput, { color: P.textPrimary }]}
                    placeholder="Your full name"
                    placeholderTextColor={P.placeholder}
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      setError(null);
                    }}
                    returnKeyType="next"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>
                  {t("editProfile.mobile")}
                </Text>
                <View style={[styles.inputRow, { borderColor: P.border }]}>
                  <SymbolView
                    name={{ ios: "phone", android: "phone", web: "phone" }}
                    size={18}
                    tintColor={P.placeholder}
                  />
                  <TextInput
                    style={[styles.textInput, { color: P.textPrimary }]}
                    placeholder="e.g. +91 98765 43210"
                    placeholderTextColor={P.placeholder}
                    value={phone}
                    onChangeText={(t) => setPhone(t)}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />
                </View>
              </View>
            </View>

            {/* ── Role card ── */}
            <View
              style={[
                styles.card,
                { backgroundColor: P.cardBg, borderColor: P.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: P.textPrimary }]}>
                {t("editProfile.role")}
              </Text>
              <Text style={[styles.cardSubtitle, { color: P.textSecondary }]}>
                {t("editProfile.roleSubtitle")}
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.roleSelector,
                  { borderColor: Brand.main },
                  pressed && styles.pressed,
                ]}
                onPress={() => setRoleDrawerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Select role"
              >
                <View
                  style={[
                    styles.roleEmojiBadge,
                    { backgroundColor: "#e8f5ee" },
                  ]}
                >
                  <Text style={styles.roleEmoji}>{selectedRole.emoji}</Text>
                </View>
                <View style={styles.roleTextBlock}>
                  <Text style={[styles.roleLabel, { color: P.textPrimary }]}>
                    {selectedRole.label}
                  </Text>
                  <Text style={[styles.roleDesc, { color: P.textSecondary }]}>
                    {selectedRole.description}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: P.textSecondary }]}>
                  ›
                </Text>
              </Pressable>
            </View>

            {/* ── Error ── */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* ── Save button ── */}
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: Brand.main },
                pressed && styles.pressed,
                saving && styles.disabled,
              ]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {t("editProfile.saveChanges")}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* ── Role Picker Drawer ── */}
      <Modal
        visible={roleDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoleDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRoleDrawerVisible(false)}
          />
          <View style={[styles.drawerSheet, { backgroundColor: P.cardBg }]}>
            <View
              style={[styles.drawerHandle, { backgroundColor: P.border }]}
            />
            <Text style={[styles.drawerTitle, { color: P.textPrimary }]}>
              {t("editProfile.selectRole")}
            </Text>

            {ROLES.map((r) => (
              <Pressable
                key={r.value}
                style={({ pressed }) => [
                  styles.drawerItem,
                  { borderBottomColor: "#f0f0f0" },
                  pressed && styles.drawerItemPressed,
                  role === r.value && styles.drawerItemSelected,
                ]}
                onPress={() => {
                  setRole(r.value);
                  setRoleDrawerVisible(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: role === r.value }}
              >
                <View style={styles.drawerItemLeft}>
                  <View
                    style={[
                      styles.drawerEmojiBadge,
                      { backgroundColor: "#e8f5ee" },
                    ]}
                  >
                    <Text style={styles.drawerItemEmoji}>{r.emoji}</Text>
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.drawerItemText,
                        { color: P.textPrimary },
                        role === r.value && {
                          color: Brand.main,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {r.label}
                    </Text>
                    <Text
                      style={[
                        styles.drawerItemDesc,
                        { color: P.textSecondary },
                      ]}
                    >
                      {r.description}
                    </Text>
                  </View>
                </View>
                {role === r.value && (
                  <Text style={[styles.drawerCheckmark, { color: Brand.main }]}>
                    ✓
                  </Text>
                )}
              </Pressable>
            ))}

            <Pressable
              style={({ pressed }) => [
                styles.drawerCancelBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => setRoleDrawerVisible(false)}
            >
              <Text style={[styles.drawerCancelText, { color: P.textPrimary }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  safe: {
    flex: 1,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.cardBg,
    borderBottomWidth: 1,
  },
  headerBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 70,
  },
  headerBackText: {
    fontSize: 15,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // ── Loader ──
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 48,
  },

  // ── Cards ──
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
  },

  // ── Field ──
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
  },

  // ── Role selector ──
  roleSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  roleEmojiBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roleEmoji: {
    fontSize: 22,
  },
  roleTextBlock: {
    flex: 1,
    gap: 2,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  roleDesc: {
    fontSize: 13,
    lineHeight: 17,
  },
  chevron: {
    fontSize: 22,
    fontWeight: "300",
    lineHeight: 26,
  },

  // ── Error ──
  errorText: {
    fontSize: 13,
    color: P.error,
    textAlign: "center",
  },

  // ── Save button ──
  saveBtn: {
    borderRadius: 26,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 4,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },

  // ── Role Drawer ──
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawerSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: 1,
  },
  drawerItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  drawerEmojiBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  drawerItemEmoji: {
    fontSize: 20,
  },
  drawerItemPressed: {
    backgroundColor: "#f0f7f0",
  },
  drawerItemSelected: {
    backgroundColor: "#e8f5e1",
  },
  drawerItemText: {
    fontSize: 16,
  },
  drawerItemDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  drawerCheckmark: {
    fontSize: 18,
    fontWeight: "700",
    flexShrink: 0,
  },
  drawerCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
  },
  drawerCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
