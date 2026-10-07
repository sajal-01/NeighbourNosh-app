import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getAuthErrorMessage,
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/auth-service";

// NeighbourNosh brand palette
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
  error: "#d32f2f",
};

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  // RouteGuard in _layout.tsx handles navigation after auth state changes.

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError(t("auth.login.errorRequired"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
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
      <SafeAreaView style={styles.safeArea}>
        {/* ── Logo & title ── */}
        <View style={styles.hero}>
          <View style={styles.logoRing}>
            <Image
              source={require("@/assets/icon.png")}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.appName}>{t("auth.login.title")}</Text>
        </View>

        {/* ── Email / Password form ── */}
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <SymbolView
              name={{ android: "person" }}
              size={20}
              tintColor={Brand.placeholder}
            />
            <TextInput
              style={styles.textInput}
              placeholder={t("auth.login.email")}
              placeholderTextColor={Brand.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
            />
          </View>

          <View style={styles.inputRow}>
            <SymbolView
              name={{ android: "lock" }}
              size={20}
              tintColor={Brand.placeholder}
            />
            <TextInput
              style={styles.textInput}
              placeholder={t("auth.login.password")}
              placeholderTextColor={Brand.placeholder}
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
            />
          </View>

          {/* Inline error message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* LOG IN */}
          <Pressable
            style={({ pressed }) => [
              styles.loginBtn,
              pressed && styles.pressed,
              loading && styles.disabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Log in"
          >
            {loading ? (
              <ActivityIndicator color={Brand.buttonText} />
            ) : (
              <Text style={styles.loginBtnText}>
                {t("auth.login.loginBtn")}
              </Text>
            )}
          </Pressable>

          {/* Forgot password */}
          <Pressable
            style={styles.forgotWrapper}
            accessibilityRole="button"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/(auth)/forgot-password" as any)}
          >
            <Text style={styles.forgotText}>
              {t("auth.login.forgotPassword")}
            </Text>
          </Pressable>
        </View>

        {/* ── Social login ── */}
        <View style={styles.socialSection}>
          <Pressable
            style={({ pressed }) => [
              styles.googleBtn,
              pressed && styles.pressed,
              loading && styles.disabled,
            ]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            <Image
              source={require("@/assets/google.png")}
              style={styles.logoGoogle}
              contentFit="contain"
            />
            <Text style={styles.googleBtnText}>
              {t("auth.login.signInWithGoogle")}
            </Text>
          </Pressable>
        </View>

        {/* ── Sign up prompt ── */}
        <View style={styles.signUpRow}>
          <Text style={styles.signUpBase}>{t("auth.login.noAccount")}</Text>
          <Pressable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push("/(auth)/signup" as any)}
            accessibilityRole="button"
          >
            <Text style={styles.signUpLink}>{t("auth.login.signUp")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}


// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: 420,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },

  // ── Hero ──
  hero: {
    alignItems: "center",
    gap: 14,
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
    fontSize: 30,
    fontWeight: "700",
    color: Brand.green,
    letterSpacing: 0.4,
  },

  // ── Form ──
  form: {
    alignSelf: "stretch",
    gap: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.inputBorder,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: Brand.bodyText,
  },
  errorText: {
    fontSize: 13,
    color: Brand.error,
    textAlign: "center",
    marginTop: -4,
  },
  loginBtn: {
    backgroundColor: Brand.green,
    borderRadius: 26,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    shadowColor: Brand.greenDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  loginBtnText: {
    color: Brand.buttonText,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  forgotWrapper: {
    alignItems: "center",
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 14,
    color: Brand.greenDark,
    textDecorationLine: "underline",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },

  // ── Social ──
  socialSection: {
    alignSelf: "stretch",
    gap: 18,
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

  // ── Sign up ──
  signUpRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  signUpBase: {
    fontSize: 14,
    color: Brand.bodyText,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: "700",
    color: Brand.linkText,
    textDecorationLine: "underline",
  },
});
