/**
 * emergency-request.tsx
 *
 * Red-themed Emergency Hunger Alert screen.
 *
 * Flow:
 *  1. Mount → request foreground location → save GeoPoint to users/{uid}
 *     so the Cloudflare Worker can find nearby donors.
 *  2. User fills form (description, servings, dietary, delivery mode, urgency).
 *  3. On submit → confirmation dialog → createEmergencyRequest → Firestore
 *     → triggerEmergencyFoodRequest (fire-and-forget) → success → back.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  GeoPoint,
  doc,
  getFirestore,
  updateDoc,
} from "@react-native-firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/context/auth";
import {
  createEmergencyRequest,
  type EmergencyRequestInput,
} from "@/lib/request-service";
import { triggerEmergencyFoodRequest } from "@/lib/notifications-api";
import { Screen } from "@/components/screen";

const db = getFirestore();

// ── Types ─────────────────────────────────────────────────────────────────────

type DietaryType = "Veg" | "NonVeg" | "Both";
type DeliveryMode = "volunteer" | "self";
type Urgency = "1h" | "3h" | "today";

// ── Options ───────────────────────────────────────────────────────────────────

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EmergencyRequestScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  // Form state
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("50");
  const [dietary, setDietary] = useState<DietaryType>("Veg");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("volunteer");
  const [urgency, setUrgency] = useState<Urgency>("1h");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "obtained" | "fallback"
  >("loading");

  const DIETARY_OPTIONS: { key: DietaryType; label: string; icon: string }[] = [
    { key: "Veg", label: t("emergency.veg"), icon: "🌿" },
    { key: "NonVeg", label: t("emergency.nonVeg"), icon: "🍗" },
    { key: "Both", label: t("emergency.both"), icon: "🍱" },
  ];

  const DELIVERY_OPTIONS: {
    key: DeliveryMode;
    title: string;
    sub: string;
  }[] = [
    {
      key: "volunteer",
      title: t("emergency.volunteer"),
      sub: t("emergency.volunteerSub"),
    },
    {
      key: "self",
      title: t("emergency.self"),
      sub: t("emergency.selfSub"),
    },
  ];

  const URGENCY_OPTIONS: { key: Urgency; label: string; dot: string }[] = [
    { key: "1h", label: t("emergency.urgency1h"), dot: "🔴" },
    { key: "3h", label: t("emergency.urgency3h"), dot: "🟡" },
    { key: "today", label: t("emergency.urgencyToday"), dot: "🟢" },
  ];

  // ── Obtain location on mount and save to Firestore ──────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationStatus("fallback");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        // Persist to Firestore so triggerEmergencyFoodRequest can read it
        await updateDoc(doc(db, "users", user.uid), {
          gpsLocation: new GeoPoint(pos.coords.latitude, pos.coords.longitude),
        });
        setLocationStatus("obtained");
      } catch {
        // Non-fatal — worker will use whatever gpsLocation was last saved
        setLocationStatus("fallback");
      }
    })();
  }, [user?.uid]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!user) return;

    if (!description.trim()) {
      Alert.alert(t("emergency.errorDesc"), t("emergency.errorDesc"));
      return;
    }
    const qty = parseInt(servings, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(
        "Invalid Servings",
        "Please enter a valid number of servings.",
      );
      return;
    }

    // Confirmation dialog
    Alert.alert(
      "Broadcast Emergency Alert?",
      "Emergency Hunger Alerts immediately notify nearby donors. Please use this feature only for genuine emergencies.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Broadcast Alert",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await createEmergencyRequest({
                receiverId: user.uid,
                description: description.trim(),
                servings: qty,
                dietaryType: dietary as EmergencyRequestInput["dietaryType"],
                deliveryMode,
                urgency,
              });

              // Fire-and-forget: notify nearby donors
              void triggerEmergencyFoodRequest(user.uid);

              Alert.alert(
                t("emergency.successTitle"),
                t("emergency.successMsg"),
                [{ text: t("common.ok"), onPress: () => router.back() }],
              );
            } catch (e) {
              Alert.alert(
                "Failed to Broadcast",
                e instanceof Error
                  ? e.message
                  : "Something went wrong. Please try again.",
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }, [user, description, servings, dietary, deliveryMode, urgency, router]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Red Header ─────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerEmoji}>🚨</Text>
          <Text style={s.headerTitle}>{t("emergency.screenTitle")}</Text>
          <Text style={s.headerSub}>{t("emergency.subTitle")}</Text>
        </View>

        {/* Spacer to balance back button */}
        <View style={{ width: 30 }} />
      </View>

      <Screen>
        {/* ── Location status pill ────────────────────────────────────── */}
        <View style={s.locationPill}>
          {locationStatus === "loading" ? (
            <ActivityIndicator size="small" color="#9ca3af" />
          ) : (
            <Ionicons
              name={
                locationStatus === "obtained" ? "location" : "location-outline"
              }
              size={16}
              color={locationStatus === "obtained" ? "#22c55e" : "#f97316"}
            />
          )}
          <Text style={s.locationText}>
            {locationStatus === "loading"
              ? t("emergency.locationLoading")
              : locationStatus === "obtained"
                ? t("emergency.locationObtained")
                : t("emergency.locationSavedUsed")}
          </Text>
        </View>

        {/* ── What do you need? ───────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("emergency.whatDoYouNeed")}</Text>

          <Text style={s.label}>{t("emergency.description")}</Text>
          <TextInput
            style={s.textArea}
            placeholder={t("emergency.descPlaceholder")}
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={s.label}>{t("emergency.servings")}</Text>
          <View style={s.servingsRow}>
            <TextInput
              style={s.servingsInput}
              value={servings}
              onChangeText={setServings}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9ca3af"
            />
            <View style={s.servingsUnit}>
              <Text style={s.servingsUnitText}>
                {t("emergency.servingsUnit")}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Dietary Type ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("emergency.dietary")}</Text>
          <View style={s.dietaryRow}>
            {DIETARY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[s.dietBtn, dietary === opt.key && s.dietBtnActive]}
                onPress={() => setDietary(opt.key)}
                activeOpacity={0.8}
              >
                <Text style={s.dietBtnIcon}>{opt.icon}</Text>
                <Text
                  style={[
                    s.dietBtnText,
                    dietary === opt.key && s.dietBtnTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Delivery Mode ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("emergency.deliveryMode")}</Text>
          {DELIVERY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[s.radioRow, deliveryMode === opt.key && s.radioRowActive]}
              onPress={() => setDeliveryMode(opt.key)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  s.radioCircle,
                  deliveryMode === opt.key && s.radioCircleActive,
                ]}
              >
                {deliveryMode === opt.key && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.radioTitle}>{opt.title}</Text>
                <Text style={s.radioSub}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Urgency ──────────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("emergency.urgency")}</Text>
          {URGENCY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[s.radioRow, urgency === opt.key && s.radioRowActive]}
              onPress={() => setUrgency(opt.key)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  s.radioCircle,
                  urgency === opt.key && s.radioCircleActive,
                ]}
              >
                {urgency === opt.key && <View style={s.radioDot} />}
              </View>
              <Text style={[s.radioTitle, { flex: 1 }]}>
                {opt.dot}
                {"  "}
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={s.submitIcon}>🚨</Text>
              <Text style={s.submitText}>{t("emergency.sendAlert")}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.disclaimer}>{t("emergency.disclaimer")}</Text>
      </Screen>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const RED = "#ef4444";
const RED_DARK = "#991b1b";
const RED_BG = "#fff5f5";
const RED_LIGHT = "#fee2e2";

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },

  // Header
  header: {
    backgroundColor: RED,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerEmoji: {
    fontSize: 28,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  headerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 14,
  },

  // Location pill
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
  },

  // Cards
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 12,
  },

  // Label
  label: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },

  // Text area
  textArea: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f2419",
    backgroundColor: "#fafafa",
    minHeight: 80,
    textAlignVertical: "top",
  },

  // Servings row
  servingsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#fafafa",
    overflow: "hidden",
  },
  servingsInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "#0f2419",
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  servingsUnit: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
    backgroundColor: "#f3f4f6",
  },
  servingsUnitText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },

  // Dietary
  dietaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  dietBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
  },
  dietBtnActive: {
    backgroundColor: RED_BG,
    borderColor: RED,
  },
  dietBtnIcon: {
    fontSize: 15,
  },
  dietBtnText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  dietBtnTextActive: {
    color: RED_DARK,
    fontWeight: "700",
  },

  // Radio rows (delivery mode + urgency)
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    marginBottom: 8,
  },
  radioRowActive: {
    borderColor: RED,
    backgroundColor: RED_BG,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioCircleActive: {
    borderColor: RED,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RED,
  },
  radioTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
    marginBottom: 2,
  },
  radioSub: {
    fontSize: 12,
    color: "#6b7280",
  },

  // Submit button
  submitBtn: {
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    elevation: 3,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitIcon: {
    fontSize: 18,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // Disclaimer
  disclaimer: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
