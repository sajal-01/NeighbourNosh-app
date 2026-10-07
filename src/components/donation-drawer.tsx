import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Brand } from "@/constants/theme";
import {
  type DonationDoc,
  type DonationUpdate,
  updateDonation,
  deleteDonation,
  formatExpiresAt,
  timeAgo,
} from "@/lib/donation-service";

// ── Props ─────────────────────────────────────────────────────────────────────

interface DonationDrawerProps {
  doc: DonationDoc | null;
  visible: boolean;
  onClose: () => void;
}

// ── Local constants ───────────────────────────────────────────────────────────

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "pending":
      return t("status.pending");
    case "accepted":
      return t("status.accepted");
    case "pickup_scheduled":
      return "Pickup Scheduled";
    case "in_progress":
      return t("status.inProgress");
    case "in_transit":
      return "In Transit";
    case "delivered":
      return t("status.delivered");
    case "expired":
      return t("status.expired");
    case "cancelled":
      return t("status.cancelled");
    default:
      return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "pending":
      return "#f97316";
    case "accepted":
      return "#3b82f6";
    case "in_progress":
      return "#50b070";
    case "delivered":
      return "#22c55e";
    case "expired":
    case "cancelled":
      return "#9ca3af";
    default:
      return "#9ca3af";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DonationDrawer({
  doc,
  visible,
  onClose,
}: DonationDrawerProps) {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dietary, setDietary] = useState("Veg");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const DIETARY_OPTIONS: { label: string; value: string }[] = [
    { label: t("donate.veg"), value: "Veg" },
    { label: t("donate.nonVeg"), value: "NonVeg" },
    { label: t("donate.both"), value: "Both" },
  ];

  // Sync local state whenever the opened doc changes
  useEffect(() => {
    if (doc) {
      setDescription(doc.foodDescription);
      setQuantity(String(doc.quantity));
      setDietary(doc.dietaryType);
    }
  }, [doc?.id]);

  // Editable only while pending and unclaimed
  const canEdit =
    doc?.status === "pending" && !doc?.receiverId && !doc?.assignedVolunteerId;

  const hasChanged = doc
    ? description !== doc.foodDescription ||
      quantity !== String(doc.quantity) ||
      dietary !== doc.dietaryType
    : false;

  async function handleSave() {
    if (!doc || !hasChanged) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert(t("common.error"), t("receiver.request.errorServingsMsg"));
      return;
    }
    setSaving(true);
    try {
      const updates: DonationUpdate = {};
      if (description.trim() !== doc.foodDescription)
        updates.foodDescription = description.trim();
      if (qty !== doc.quantity) updates.quantity = qty;
      if (dietary !== doc.dietaryType) updates.dietaryType = dietary;
      await updateDonation(doc.id, updates);
      Alert.alert(t("donationDrawer.savedTitle"), t("donationDrawer.savedMsg"));
      onClose();
    } catch (e) {
      Alert.alert(
        t("common.error"),
        e instanceof Error ? e.message : t("donationDrawer.updateError"),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!doc) return;
    const hasClaims = !!(doc.receiverId || doc.assignedVolunteerId);
    Alert.alert(
      t("donationDrawer.deleteConfirmTitle"),
      hasClaims
        ? t("donationDrawer.deleteConfirmMsgClaimed")
        : t("donationDrawer.deleteConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteDonation(doc.id);
              Alert.alert(
                t("donationDrawer.deletedTitle"),
                t("donationDrawer.deletedMsg"),
              );
              onClose();
            } catch (e) {
              Alert.alert(
                t("common.error"),
                e instanceof Error
                  ? e.message
                  : t("donationDrawer.updateError"),
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  if (!doc) return null;

  const exp = formatExpiresAt(doc.expiresAt);
  const foodEmoji =
    doc.dietaryType === "NonVeg"
      ? "🍗"
      : doc.dietaryType === "Both"
        ? "🍱"
        : "🍚";

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={d.modalRoot}>
        {/* Tappable area above the sheet — tap to dismiss */}
        <TouchableOpacity
          style={d.backdropArea}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={d.sheet}>
            {/* ── Drag handle ─────────────────────────────────── */}
            <View style={d.handleWrap}>
              <View style={d.handle} />
            </View>

            {/* ── Header ──────────────────────────────────────── */}
            <View style={d.header}>
              <TouchableOpacity
                style={d.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            {/* ── Scrollable content ───────────────────────────── */}
            <ScrollView
              style={d.scroll}
              contentContainerStyle={d.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Food Info (read-only) ────────────────────── */}
              <View style={d.section}>
                <View style={d.foodInfoRow}>
                  <View style={d.foodEmojiBox}>
                    <Text style={d.foodEmojiText}>{foodEmoji}</Text>
                  </View>
                  <View style={d.foodInfoMeta}>
                    <Text style={d.foodInfoName} numberOfLines={2}>
                      {doc.foodDescription}
                    </Text>
                    <View
                      style={[
                        d.statusChip,
                        { backgroundColor: statusColor(doc.status) + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          d.statusChipTxt,
                          { color: statusColor(doc.status) },
                        ]}
                      >
                        {statusLabel(doc.status, t)}
                      </Text>
                    </View>
                  </View>
                </View>

                {exp.label ? (
                  <View style={[d.expiryPill, { borderColor: exp.color }]}>
                    <Text style={[d.expiryPillTxt, { color: exp.color }]}>
                      ⏳ {exp.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={d.divider} />

              {/* ── Edit Details ─────────────────────────────── */}
              <View style={d.section}>
                <Text style={d.fieldLabel}>{t("donate.foodDetails")}</Text>
                <TextInput
                  style={[
                    d.input,
                    d.inputMultiline,
                    !canEdit && d.inputDisabled,
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  editable={canEdit}
                  multiline
                  numberOfLines={3}
                  placeholder="Describe the food…"
                  placeholderTextColor="#aaa"
                />

                <Text style={d.fieldLabel}>{t("donate.quantity")}</Text>
                <TextInput
                  style={[d.input, !canEdit && d.inputDisabled]}
                  value={quantity}
                  onChangeText={setQuantity}
                  editable={canEdit}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  placeholderTextColor="#aaa"
                />

                <Text style={d.fieldLabel}>{t("donate.dietaryType")}</Text>
                <View style={d.toggleRow}>
                  {DIETARY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        d.toggleBtn,
                        dietary === opt.value && d.toggleBtnActive,
                      ]}
                      onPress={() => canEdit && setDietary(opt.value)}
                      disabled={!canEdit}
                      activeOpacity={canEdit ? 0.75 : 1}
                    >
                      <Text
                        style={[
                          d.toggleBtnTxt,
                          dietary === opt.value && d.toggleBtnTxtActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {!canEdit && (
                <View style={d.infoBanner}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color="#92400e"
                  />
                  <Text style={d.infoBannerTxt}>
                    {t("donate.donationDisclaimer")}
                  </Text>
                </View>
              )}

              <View style={d.divider} />

              {/* ── Pickup Info (read-only) ───────────────────── */}
              <View style={d.section}>
                <Text style={d.fieldLabel}>{t("donate.pickupLocation")}</Text>
                <Text style={d.pickupAddr}>📍 {doc.pickupAddress}</Text>
                <Text style={d.pickupPosted}>
                  Posted {timeAgo(doc.createdAt)}
                </Text>
              </View>

              {/* ── Save button (only when editable & dirty) ─── */}
              {canEdit && hasChanged && (
                <TouchableOpacity
                  style={d.saveBtn}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={d.saveBtnTxt}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              )}

              {/* ── Delete button ────────────────────────────── */}
              <TouchableOpacity
                style={[
                  d.deleteBtn,
                  { marginTop: canEdit && hasChanged ? 12 : 0 },
                ]}
                onPress={handleDelete}
                activeOpacity={0.8}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#e53935" />
                ) : (
                  <Text style={d.deleteBtnTxt}>{t("common.delete")}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  // Modal layout
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  backdropArea: {
    flex: 1,
  },

  // Sheet
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },

  // Handle
  handleWrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d5dd",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
  },
  closeBtn: {
    padding: 2,
  },

  // Scroll
  scroll: {},
  scrollContent: {
    paddingBottom: 8,
  },

  // Section container
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginHorizontal: 20,
  },

  // Food info row
  foodInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  foodEmojiBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  foodEmojiText: {
    fontSize: 28,
  },
  foodInfoMeta: {
    flex: 1,
    gap: 6,
  },
  foodInfoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f2419",
    lineHeight: 22,
  },
  statusChip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  statusChipTxt: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Expiry pill
  expiryPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  expiryPillTxt: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Field labels and inputs
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Brand.main,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    backgroundColor: "#fafffe",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f2419",
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  inputDisabled: {
    backgroundColor: "#f5f5f5",
    color: "#888",
  },

  // Dietary toggle
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d6ede0",
    alignItems: "center",
    backgroundColor: "#fafffe",
  },
  toggleBtnActive: {
    backgroundColor: Brand.main,
    borderColor: Brand.main,
  },
  toggleBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  toggleBtnTxtActive: {
    color: "#fff",
  },

  // Read-only info banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  infoBannerTxt: {
    flex: 1,
    fontSize: 13,
    color: "#92400e",
    lineHeight: 18,
  },

  // Pickup info
  pickupAddr: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    marginBottom: 4,
  },
  pickupPosted: {
    fontSize: 12,
    color: "#888",
  },

  // Save button
  saveBtn: {
    marginHorizontal: 20,
    backgroundColor: Brand.main,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Delete button
  deleteBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#e53935",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnTxt: {
    color: "#e53935",
    fontSize: 15,
    fontWeight: "600",
  },
});
