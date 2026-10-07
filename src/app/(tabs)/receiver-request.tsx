import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { createFoodRequest } from "@/lib/request-service";
import { triggerReceiverRequest } from "@/lib/notifications-api";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/screen";

// ─── Types ────────────────────────────────────────────────────────────────────
type DietaryType = "Veg" | "NonVeg" | "Both";
type DeliveryMode = "volunteer" | "self";

// ─── Dietary option config ────────────────────────────────────────────────────
const DIETARY_OPTIONS: { key: DietaryType; icon: string; label: string }[] = [
  { key: "Veg", icon: "🌿", label: "Veg" },
  { key: "NonVeg", icon: "🍗", label: "Non-Veg" },
  { key: "Both", icon: "🌿🍗", label: "Both" },
];

// ─── Default state ────────────────────────────────────────────────────────────
const DEFAULT_DESCRIPTION = "";
const DEFAULT_SERVINGS = "";
const DEFAULT_DIETARY: DietaryType = "Veg";
const DEFAULT_DELIVERY: DeliveryMode = "volunteer";

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReceiverRequestScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [dietary, setDietary] = useState<DietaryType>(DEFAULT_DIETARY);
  const [deliveryMode, setDeliveryMode] =
    useState<DeliveryMode>(DEFAULT_DELIVERY);
  const [submitting, setSubmitting] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setDescription(DEFAULT_DESCRIPTION);
    setServings(DEFAULT_SERVINGS);
    setDietary(DEFAULT_DIETARY);
    setDeliveryMode(DEFAULT_DELIVERY);
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert(
        t("receiver.request.errorNotSignedIn"),
        t("receiver.request.errorSignIn"),
      );
      return;
    }
    if (!description.trim()) {
      Alert.alert(
        t("receiver.request.errorDescription"),
        t("receiver.request.errorDescriptionMsg"),
      );
      return;
    }
    const qty = parseInt(servings, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(
        t("receiver.request.errorServings"),
        t("receiver.request.errorServingsMsg"),
      );
      return;
    }

    setSubmitting(true);
    try {
      const requestId = await createFoodRequest({
        receiverId: user.uid,
        description: description.trim(),
        servings: qty,
        dietaryType: dietary,
        deliveryMode,
      });

      // Fire-and-forget: notify nearby donors via the receiver_request worker event.
      // Passes the new requestId so the worker can update possibleDonorsId.
      void triggerReceiverRequest(user.uid, requestId);

      Alert.alert(
        t("receiver.request.successTitle"),
        deliveryMode === "volunteer"
          ? t("receiver.request.successVolunteer")
          : t("receiver.request.successSelf"),
        [{ text: t("common.great"), onPress: resetForm }],
      );
    } catch (e) {
      Alert.alert(
        t("receiver.request.failedTitle"),
        e instanceof Error ? e.message : t("receiver.request.failedMsg"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable
          style={s.headerClose}
          // onPress={() => router.back()}
          // Go to receiver home
          onPress={() => router.push("/(tabs)/receiver-home" as any)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color={Brand.main} />
        </Pressable>

        <Text style={s.headerTitle}>{t("receiver.request.title")}</Text>

        {/* Placeholder to balance close button */}
        <View style={s.headerClose} />
      </View>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <Screen>
        {/* ── Card 1: Food Details ──────────────────────────────────────── */}
        <View style={s.card}>
          {/* Card header */}
          <View style={s.cardHeader}>
            <View style={s.cardIconWrap}>
              <Text style={s.cardIconEmoji}>📋</Text>
            </View>
            <Text style={s.cardTitle}>{t("receiver.request.foodDetails")}</Text>
          </View>
          <View style={s.cardDivider} />

          {/* Description */}
          <Text style={s.label}>{t("receiver.request.description")}</Text>
          <TextInput
            style={s.textArea}
            placeholder={t("receiver.request.descriptionPlaceholder")}
            placeholderTextColor="#b0b8b4"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Servings */}
          <Text style={s.label}>{t("receiver.request.servingsRequired")}</Text>
          <View style={s.servingsRow}>
            <TextInput
              style={[s.input, s.servingsInput]}
              keyboardType="numeric"
              value={servings}
              onChangeText={setServings}
              placeholder="50"
              placeholderTextColor="#b0b8b4"
            />
            <View style={s.servingsUnit}>
              <Text style={s.servingsUnitText}>{t("common.servings")}</Text>
            </View>
          </View>

          {/* Dietary type */}
          <Text style={s.label}>{t("receiver.request.dietaryType")}</Text>
          <View style={s.dietaryRow}>
            {DIETARY_OPTIONS.map(({ key, icon }) => {
              const active = dietary === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.dietBtn, active && s.dietBtnActive]}
                  onPress={() => setDietary(key)}
                  activeOpacity={0.8}
                >
                  <Text style={s.dietBtnIcon}>{icon}</Text>
                  <Text style={[s.dietBtnText, active && s.dietBtnTextActive]}>
                    {key === "Veg"
                      ? t("dietary.veg")
                      : key === "NonVeg"
                        ? t("dietary.nonVeg")
                        : t("dietary.both")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Card 2: Logistics & Delivery ─────────────────────────────── */}
        <View style={s.card}>
          {/* Card header */}
          <View style={s.cardHeader}>
            <View style={s.cardIconWrap}>
              <Text style={s.cardIconEmoji}>🚚</Text>
            </View>
            <Text style={s.cardTitle}>{t("receiver.request.logistics")}</Text>
          </View>
          <View style={s.cardDivider} />

          <Text style={s.deliverySubLabel}>
            {t("receiver.request.howReceive")}
          </Text>

          {/* Option: Volunteer Delivery */}
          <TouchableOpacity
            style={[
              s.radioRow,
              deliveryMode === "volunteer" && s.radioRowActive,
            ]}
            onPress={() => setDeliveryMode("volunteer")}
            activeOpacity={0.8}
          >
            <View style={s.radioLeft}>
              <View
                style={[
                  s.radioCircle,
                  deliveryMode === "volunteer" && s.radioCircleFilled,
                ]}
              >
                {deliveryMode === "volunteer" && (
                  <View style={s.radioInnerDot} />
                )}
              </View>
              <View style={s.radioTextWrap}>
                <Text style={s.radioTitle}>
                  {t("receiver.request.needVolunteer")}
                </Text>
                <Text style={s.radioSub}>
                  {t("receiver.request.needVolunteerSub")}
                </Text>
              </View>
            </View>
            <Text style={s.radioEmoji}>🛵</Text>
          </TouchableOpacity>

          {/* Option: Self-Pickup */}
          <TouchableOpacity
            style={[s.radioRow, deliveryMode === "self" && s.radioRowActive]}
            onPress={() => setDeliveryMode("self")}
            activeOpacity={0.8}
          >
            <View style={s.radioLeft}>
              <View
                style={[
                  s.radioCircle,
                  deliveryMode === "self" && s.radioCircleFilled,
                ]}
              >
                {deliveryMode === "self" && <View style={s.radioInnerDot} />}
              </View>
              <View style={s.radioTextWrap}>
                <Text style={s.radioTitle}>
                  {t("receiver.request.selfPickup")}
                </Text>
                <Text style={s.radioSub}>
                  {t("receiver.request.selfPickupSub")}
                </Text>
              </View>
            </View>
            <Text style={s.radioEmoji}>🏛️</Text>
          </TouchableOpacity>
        </View>

        {/* ── Submit button ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.postBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={s.postBtnText}>
                {t("receiver.request.postRequest")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </Screen>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const SHADOW = {
  elevation: 2,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
} as const;

const s = StyleSheet.create({
  // Layout
  kav: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },

  // Header
  header: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
  },
  headerClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Brand.main,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    ...SHADOW,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e6f4ec",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconEmoji: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#e8f0eb",
    marginBottom: 14,
  },

  // Form elements
  label: {
    fontSize: 13,
    color: "#327023",
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f2419",
    backgroundColor: "#fafffe",
  },
  textArea: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f2419",
    backgroundColor: "#fafffe",
    minHeight: 96,
    textAlignVertical: "top",
  },

  // Servings row
  servingsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 10,
    backgroundColor: "#fafffe",
    overflow: "hidden",
  },
  servingsInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  servingsUnit: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: "#e8f0eb",
  },
  servingsUnitText: {
    fontSize: 14,
    color: "#9ab8a4",
    fontWeight: "500",
  },

  // Dietary toggle
  dietaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  dietBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6ede0",
    backgroundColor: "#fff",
  },
  dietBtnActive: {
    backgroundColor: Brand.main,
    borderColor: Brand.main,
  },
  dietBtnIcon: {
    fontSize: 14,
  },
  dietBtnText: {
    fontSize: 13,
    color: "#0f2419",
    fontWeight: "600",
  },
  dietBtnTextActive: {
    color: "#fff",
  },

  // Delivery section
  deliverySubLabel: {
    fontSize: 13,
    color: "#327023",
    marginBottom: 12,
    lineHeight: 18,
  },

  // Radio rows
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e8f0eb",
    backgroundColor: "#fafffe",
    marginBottom: 10,
  },
  radioRowActive: {
    borderColor: Brand.main,
    backgroundColor: "#f0faf4",
  },
  radioLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#c0d8c8",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioCircleFilled: {
    borderColor: Brand.main,
    backgroundColor: Brand.main,
  },
  radioInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  radioTextWrap: {
    flex: 1,
    gap: 2,
  },
  radioTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
  },
  radioSub: {
    fontSize: 12,
    color: "#5a8a6a",
    lineHeight: 17,
  },
  radioEmoji: {
    fontSize: 22,
    marginLeft: 8,
  },

  // Submit button
  postBtn: {
    backgroundColor: Brand.main,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    ...SHADOW,
    elevation: 3,
  },
  postBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
