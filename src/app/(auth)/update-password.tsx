import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  updatePasswordAfterReset,
} from "@/lib/auth-service";

const Brand = {
  bg: "#e8f5e1",
  green: "#3a7d44",
  greenDark: "#2d6035",
  inputBg: "#ffffff",
  inputBorder: "#c5ddc6",
  placeholder: "#9e9e9e",
  buttonText: "#ffffff",
  bodyText: "#333333",
  linkText: "#3a7d44",
  error: "#d32f2f",
  success: "#2e7d32",
};

export default function UpdatePasswordScreen() {
  const { t } = useTranslation();
  const { email, token } = useLocalSearchParams<{
    email: string;
    token: string;
  }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const router = useRouter();

  async function handleSave() {
    if (!password) {
      setError(t("auth.updatePassword.errorRequired"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth.updatePassword.errorLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.updatePassword.errorMatch"));
      return;
    }
    if (!token) {
      setError("Your reset session has expired. Please start over.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await updatePasswordAfterReset(email ?? "", token, password);
      setDone(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        {/* ── Back (only before success) ── */}
        {!done && (
          <Pressable
            style={styles.backBtn}
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
              tintColor={Brand.green}
            />
            <Text style={styles.backText}>{t("auth.updatePassword.back")}</Text>
          </Pressable>
        )}

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.logoRing}>
            <Image
              source={require("@/assets/icon.png")}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>

          {done ? (
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
          ) : null}

          <Text style={styles.title}>
            {done
              ? t("auth.updatePassword.titleDone")
              : t("auth.updatePassword.titleForm")}
          </Text>
          {/*<Text style={styles.subtitle}>
            {done
              ? t("auth.updatePassword.subtitleDone", { email })
              : t("auth.updatePassword.subtitleForm")}
          </Text>*/}
        </View>

        {/* ── Form ── */}
        {!done ? (
          <View style={styles.form}>
            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "lock", android: "lock", web: "lock" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.updatePassword.newPassword")}
                placeholderTextColor={Brand.placeholder}
                secureTextEntry
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                }}
              />
            </View>

            <View style={styles.inputRow}>
              <SymbolView
                name={{ ios: "lock", android: "lock", web: "lock" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.updatePassword.confirmPassword")}
                placeholderTextColor={Brand.placeholder}
                secureTextEntry
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  setError(null);
                }}
                onSubmitEditing={handleSave}
                returnKeyType="done"
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
              onPress={handleSave}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Save new password"
            >
              {loading ? (
                <ActivityIndicator color={Brand.buttonText} />
              ) : (
                <Text style={styles.btnText}>
                  {t("auth.updatePassword.savePassword")}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          /* ── Success CTA ── */
          <Pressable
            style={styles.btn}
            onPress={() => router.dismissAll()}
            accessibilityRole="button"
            accessibilityLabel="Back to login"
          >
            <Text style={styles.btnText}>
              {t("auth.updatePassword.backToLogin")}
            </Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 32,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: 14,
    color: Brand.green,
    fontWeight: "600",
  },
  hero: {
    alignItems: "center",
    gap: 12,
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
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.success,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  successIconText: {
    fontSize: 28,
    color: "#ffffff",
    fontWeight: "700",
    lineHeight: 34,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Brand.green,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Brand.bodyText,
    textAlign: "center",
    lineHeight: 22,
  },
  form: {
    gap: 16,
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
  btn: {
    backgroundColor: Brand.green,
    borderRadius: 26,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Brand.greenDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  btnText: {
    color: Brand.buttonText,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
});
