import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
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
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
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
};

type Phase = "email" | "otp";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  const ref0 = useRef<TextInput>(null);
  const ref1 = useRef<TextInput>(null);
  const ref2 = useRef<TextInput>(null);
  const ref3 = useRef<TextInput>(null);
  const ref4 = useRef<TextInput>(null);
  const otpRefs = [ref0, ref1, ref2, ref3, ref4];

  const router = useRouter();

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  async function handleSendOtp() {
    if (!email.trim()) {
      setError(t("auth.forgotPassword.errorEmail"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetOtp(email.trim().toLowerCase());
      setPhase("otp");
      setTimer(60);
      setTimeout(() => ref0.current?.focus(), 300);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (timer > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetOtp(email.trim().toLowerCase());
      setDigits(["", "", "", "", ""]);
      setTimer(60);
      setTimeout(() => ref0.current?.focus(), 100);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    const otp = digits.join("");
    if (otp.length < 5) {
      setError(t("auth.forgotPassword.errorOtp"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const resetToken = await verifyPasswordResetOtp(
        email.trim().toLowerCase(),
        otp,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(
        `/(auth)/update-password?email=${encodeURIComponent(
          email.trim().toLowerCase(),
        )}&token=${encodeURIComponent(resetToken)}` as any,
      );
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(text: string, idx: number) {
    const char = text.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 4) {
      otpRefs[idx + 1].current?.focus();
    }
  }

  function handleKeyPress(key: string, idx: number) {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
      otpRefs[idx - 1].current?.focus();
    }
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        {/* ── Back / Change Email ── */}
        <Pressable
          style={styles.backBtn}
          onPress={() => (phase === "otp" ? setPhase("email") : router.back())}
          accessibilityRole="button"
          accessibilityLabel={
            phase === "otp" ? "Change email" : "Back to login"
          }
        >
          <SymbolView
            name={{
              android: "arrow_back",
            }}
            size={20}
            tintColor={Brand.green}
          />
          <Text style={styles.backText}>
            {phase === "otp"
              ? t("auth.forgotPassword.changeEmail")
              : t("auth.forgotPassword.backToLogin")}
          </Text>
        </Pressable>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.logoRing}>
            <Image
              source={require("@/assets/icon.png")}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.title}>
            {phase === "email"
              ? t("auth.forgotPassword.titleEmail")
              : t("auth.forgotPassword.titleOtp")}
          </Text>
          <Text style={styles.subtitle}>
            {phase === "email"
              ? t("auth.forgotPassword.subtitleEmail")
              : t("auth.forgotPassword.subtitleOtp", { email })}
          </Text>
        </View>

        {/* ── Email phase ── */}
        {phase === "email" && (
          <View style={styles.form}>
            <View style={styles.inputRow}>
              <SymbolView
                name={{ android: "mail" }}
                size={20}
                tintColor={Brand.placeholder}
              />
              <TextInput
                style={styles.textInput}
                placeholder={t("auth.forgotPassword.emailAddress")}
                placeholderTextColor={Brand.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                onSubmitEditing={handleSendOtp}
                returnKeyType="send"
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
              onPress={handleSendOtp}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Send OTP"
            >
              {loading ? (
                <ActivityIndicator color={Brand.buttonText} />
              ) : (
                <Text style={styles.btnText}>
                  {t("auth.forgotPassword.sendOtp")}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* ── OTP phase ── */}
        {phase === "otp" && (
          <View style={styles.form}>
            {/* Digit boxes */}
            <View style={styles.otpRow}>
              {digits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={otpRefs[i]}
                  style={[styles.otpBox, d ? styles.otpBoxFilled : null]}
                  value={d}
                  onChangeText={(t) => handleDigitChange(t, i)}
                  onKeyPress={({ nativeEvent }) =>
                    handleKeyPress(nativeEvent.key, i)
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                  selectTextOnFocus
                  accessibilityLabel={`OTP digit ${i + 1}`}
                />
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
              onPress={handleVerify}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Verify OTP"
            >
              {loading ? (
                <ActivityIndicator color={Brand.buttonText} />
              ) : (
                <Text style={styles.btnText}>
                  {t("auth.forgotPassword.verifyOtp")}
                </Text>
              )}
            </Pressable>

            {/* Resend */}
            <Pressable
              style={styles.resendWrapper}
              onPress={handleResend}
              disabled={timer > 0 || loading}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.resendText,
                  (timer > 0 || loading) && styles.resendDisabled,
                ]}
              >
                {timer > 0
                  ? t("auth.forgotPassword.resendIn", { count: timer })
                  : t("auth.forgotPassword.resendOtp")}
              </Text>
            </Pressable>
          </View>
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
  otpRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  otpBox: {
    width: 52,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.inputBorder,
    backgroundColor: Brand.inputBg,
    fontSize: 26,
    fontWeight: "700",
    color: Brand.green,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  otpBoxFilled: {
    borderColor: Brand.green,
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
  resendWrapper: {
    alignItems: "center",
    paddingVertical: 4,
  },
  resendText: {
    fontSize: 14,
    color: Brand.greenDark,
    textDecorationLine: "underline",
  },
  resendDisabled: {
    color: Brand.placeholder,
    textDecorationLine: "none",
  },
});
