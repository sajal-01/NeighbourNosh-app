import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
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
  createAccountWithEmail,
  getAuthErrorMessage,
  signInWithGoogle,
} from "@/lib/auth-service";
import { Screen } from "@/components/screen";

const ORG_TYPES = [
  "NGO",
  "Orphanage",
  "Old Age Home",
  "Shelter",
  "Community Kitchen",
  "Restaurant",
  "Hotel",
] as const;
type OrgType = (typeof ORG_TYPES)[number];

// NeighbourNosh brand palette (matches login.tsx)
const Brand = {
  bg: "#e8f5e1",
  green: "#3a7d44",
  greenDark: "#2d6035",
  inputBg: "#ffffff",
  inputBorder: "#c5ddc6",
  placeholder: "#9e9e9e",
  buttonText: "#ffffff",
  dividerLine: "#b5ccb5",
  dividerText: "#444444",
  googleBg: "#ffffff",
  googleBorder: "#dadce0",
  googleText: "#3c4043",
  bodyText: "#333333",
  linkText: "#3a7d44",
  segmentActive: "#3a7d44",
  segmentBorder: "#3a7d44",
  segmentTextActive: "#ffffff",
  segmentTextInactive: "#3a7d44",
  error: "#d32f2f",
};

type UserRole = "Donor" | "Receiver" | "Volunteer";
const USER_ROLES: UserRole[] = ["Donor", "Receiver", "Volunteer"];

export default function SignUpScreen() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<UserRole>("Donor");
  const [emailAddress, setEmailAddress] = useState("");
  const [orgType, setOrgType] = useState<OrgType | "">("");
  const [orgName, setOrgName] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgDrawerVisible, setOrgDrawerVisible] = useState(false);

  const router = useRouter();

  // RouteGuard in _layout.tsx handles navigation after auth state changes.

  function pickOrgType() {
    setOrgDrawerVisible(true);
  }

  async function handleCreateAccount() {
    if (!fullName.trim()) {
      setError(t("auth.signup.errorName"));
      return;
    }
    if (!emailAddress.trim()) {
      setError(t("auth.signup.errorEmail"));
      return;
    }
    if (!password) {
      setError(t("auth.signup.errorPassword"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.signup.errorPasswordMatch"));
      return;
    }
    if (orgType && !orgName.trim()) {
      setError(t("auth.signup.errorOrgName"));
      return;
    }
    if (orgType && !orgAddress.trim()) {
      setError(t("auth.signup.errorOrgAddress"));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await createAccountWithEmail(emailAddress.trim(), password, {
        name: fullName.trim(),
        mobileNumber: mobile.trim(),
        role,
        organizationType: orgType || undefined,
        organizationName: orgName.trim() || undefined,
        organizationAddress: orgAddress.trim() || undefined,
      });
      // onAuthStateChanged in AuthProvider → RouteGuard → navigate to /(tabs)
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      // onAuthStateChanged → RouteGuard → navigate to /(tabs)
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Screen>
        <SafeAreaView style={styles.safeArea}>
          {/* ── Logo & titles ── */}
          <View style={styles.hero}>
            <View style={styles.logoRing}>
              <Image
                source={require("@/assets/icon.png")}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>
            <Text style={styles.appName}>{t("auth.signup.title")}</Text>
            <Text style={styles.subtitle}>{t("auth.signup.subtitle")}</Text>
          </View>

          {/* ── Form ── */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "person", android: "person", web: "person" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.signup.fullName")}
                placeholderTextColor={Brand.placeholder}
                autoCapitalize="words"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* Mobile Number */}
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "phone", android: "phone", web: "phone" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.signup.mobile")}
                placeholderTextColor={Brand.placeholder}
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={setMobile}
              />
            </View>

            {/* Select User Role */}
            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>
                {t("auth.signup.selectRole")}
              </Text>
              <View style={styles.segmented}>
                {USER_ROLES.map((r, i) => {
                  const active = role === r;
                  return (
                    <Pressable
                      key={r}
                      style={[
                        styles.segment,
                        active && styles.segmentActive,
                        i === USER_ROLES.length - 1 && styles.segmentLast,
                      ]}
                      onPress={() => setRole(r)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active && styles.segmentTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Email Address */}
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "envelope", android: "mail", web: "mail" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.signup.email")}
                placeholderTextColor={Brand.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={emailAddress}
                onChangeText={setEmailAddress}
              />
            </View>

            {/* Organization Type — outlined field with floating label + dropdown */}
            <View style={styles.outlinedField}>
              <Text style={styles.outlinedFieldLabel}>
                {t("auth.signup.orgType")}
              </Text>
              <Pressable
                style={styles.outlinedFieldInner}
                onPress={pickOrgType}
                accessibilityRole="combobox"
                accessibilityLabel="Organization Type"
              >
                <SymbolView
                  name={{ ios: "lock", android: "lock", web: "lock" }}
                  size={18}
                  tintColor={Brand.placeholder}
                />
                <Text
                  style={[
                    styles.outlinedFieldText,
                    orgType
                      ? styles.outlinedFieldValue
                      : styles.outlinedFieldPlaceholder,
                  ]}
                >
                  {orgType || t("auth.signup.selectType")}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </Pressable>
            </View>

            {/* Organization Name */}
            {orgType ? (
              <View style={styles.inputRow}>
                <SymbolView
                  name={{
                    ios: "building.2",
                    android: "business",
                    web: "business",
                  }}
                  size={20}
                  tintColor={Brand.placeholder}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder={t("auth.signup.orgName")}
                  placeholderTextColor={Brand.placeholder}
                  autoCapitalize="words"
                  value={orgName}
                  onChangeText={setOrgName}
                />
              </View>
            ) : null}

            {/* Organization Address */}
            {orgType ? (
              <View style={styles.inputRow}>
                <SymbolView
                  name={{
                    ios: "mappin",
                    android: "location_on",
                    web: "location_on",
                  }}
                  size={20}
                  tintColor={Brand.placeholder}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder={t("auth.signup.orgAddress")}
                  placeholderTextColor={Brand.placeholder}
                  autoCapitalize="sentences"
                  value={orgAddress}
                  onChangeText={setOrgAddress}
                />
              </View>
            ) : null}

            {/* Password */}
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "lock", android: "lock", web: "lock" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.signup.password")}
                placeholderTextColor={Brand.placeholder}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {/* Confirm Password */}
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "lock", android: "lock", web: "lock" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.signup.confirmPassword")}
                placeholderTextColor={Brand.placeholder}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            {/* Inline error message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* CREATE ACCOUNT */}
            <Pressable
              style={({ pressed }) => [
                styles.createBtn,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
              onPress={handleCreateAccount}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {loading ? (
                <ActivityIndicator color={Brand.buttonText} />
              ) : (
                <Text style={styles.createBtnText}>
                  {t("auth.signup.createAccount")}
                </Text>
              )}
            </Pressable>
          </View>

          {/* ── Social login ── */}
          <View style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
              onPress={handleGoogleSignIn}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <Image
                source={require("@/assets/google.png")}
                style={styles.logoGoogle}
                contentFit="contain"
              />
              <Text style={styles.googleBtnText}>
                {t("auth.signup.continueWithGoogle")}
              </Text>
            </Pressable>
          </View>

          {/* ── Already have account ── */}
          <View style={styles.loginRow}>
            <Text style={styles.loginBase}>
              {t("auth.signup.alreadyHaveAccount")}
            </Text>
            <Pressable onPress={() => router.back()} accessibilityRole="button">
              <Text style={styles.loginLink}>{t("auth.signup.logIn")}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Screen>
      {/* ── Organisation Type Drawer ── */}
      <Modal
        visible={orgDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOrgDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOrgDrawerVisible(false)}
          />
          <View style={styles.drawerSheet}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>
              {t("auth.signup.orgDrawerTitle")}
            </Text>
            {ORG_TYPES.map((type) => (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.drawerItem,
                  pressed && styles.drawerItemPressed,
                  orgType === type && styles.drawerItemSelected,
                ]}
                onPress={() => {
                  setOrgType(type);
                  setOrgDrawerVisible(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: orgType === type }}
              >
                <Text
                  style={[
                    styles.drawerItemText,
                    orgType === type && styles.drawerItemTextSelected,
                  ]}
                >
                  {type}
                </Text>
                {orgType === type && (
                  <Text style={styles.drawerCheckmark}>✓</Text>
                )}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [
                styles.drawerCancelBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => setOrgDrawerVisible(false)}
            >
              <Text style={styles.drawerCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}


// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
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
    maxWidth: 420,
    paddingHorizontal: 28,
    paddingBottom: 32,
    alignItems: "center",
    gap: 22,
  },

  // ── Hero ──
  hero: {
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
  },
  logoRing: {
    width: 90,
    height: 90,
    borderRadius: 25,
    backgroundColor: "#50b070",
    borderWidth: 2,
    borderColor: Brand.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#50b070",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  logoImage: {
    width: 180,
    height: 180,
  },
  logoGoogle: {
    width: 24,
    height: 24,
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: Brand.green,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Brand.bodyText,
    letterSpacing: 0.2,
  },

  // ── Form ──
  form: {
    alignSelf: "stretch",
    gap: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.inputBorder,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: Brand.bodyText,
  },

  // ── User role segmented control ──
  roleSection: {
    alignSelf: "stretch",
    gap: 6,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Brand.bodyText,
    paddingLeft: 2,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.segmentBorder,
    overflow: "hidden",
    backgroundColor: Brand.inputBg,
    height: 40,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Brand.segmentBorder,
  },
  segmentLast: {
    borderRightWidth: 0,
  },
  segmentActive: {
    backgroundColor: Brand.segmentActive,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: Brand.segmentTextInactive,
  },
  segmentTextActive: {
    color: Brand.segmentTextActive,
  },

  // ── Organization Type outlined field ──
  outlinedField: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: Brand.inputBorder,
    borderRadius: 10,
    backgroundColor: Brand.inputBg,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  outlinedFieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Brand.green,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  outlinedFieldInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 28,
  },
  outlinedFieldText: {
    flex: 1,
    fontSize: 15,
  },
  outlinedFieldPlaceholder: {
    color: Brand.placeholder,
  },
  outlinedFieldValue: {
    color: Brand.bodyText,
  },
  dropdownArrow: {
    fontSize: 16,
    color: Brand.placeholder,
    lineHeight: 18,
  },

  // ── CREATE ACCOUNT button ──
  createBtn: {
    backgroundColor: Brand.green,
    borderRadius: 26,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: Brand.greenDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  createBtnText: {
    color: Brand.buttonText,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 13,
    color: Brand.error,
    textAlign: "center",
    marginTop: -2,
  },

  // ── Social ──
  socialSection: {
    alignSelf: "stretch",
    gap: 12,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Brand.dividerLine,
  },
  dividerLabel: {
    fontSize: 13,
    color: Brand.dividerText,
    fontWeight: "500",
  },
  googleBtn: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: Brand.googleBg,
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Brand.googleBorder,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: Brand.googleText,
  },

  // ── Login link ──
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loginBase: {
    fontSize: 14,
    color: Brand.bodyText,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: "700",
    color: Brand.linkText,
    textDecorationLine: "underline",
  },

  // ── Org Type Drawer ──
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawerSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d0d0d0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Brand.bodyText,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  drawerItemPressed: {
    backgroundColor: "#f0f7f0",
  },
  drawerItemSelected: {
    backgroundColor: "#e8f5e1",
  },
  drawerItemText: {
    fontSize: 16,
    color: Brand.bodyText,
  },
  drawerItemTextSelected: {
    color: Brand.green,
    fontWeight: "600",
  },
  drawerCheckmark: {
    fontSize: 18,
    color: Brand.green,
    fontWeight: "700",
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
    color: Brand.bodyText,
    fontWeight: "600",
  },
});
