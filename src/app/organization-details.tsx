import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";

import { useAuth } from "@/context/auth";
import { Brand } from "@/constants/theme";

const db = getFirestore();

// ── Palette ───────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

type VerificationStatus = "pending" | "verified" | "rejected";

interface Organisation {
  id: string;
  organizationName: string;
  organizationType: string;
  verificationStatus: VerificationStatus;
  address: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadgeStyle(status: VerificationStatus) {
  switch (status) {
    case "verified":
      return { bg: "#e8f5e9", text: "#2e7d32" };
    case "rejected":
      return { bg: "#ffebee", text: "#c62828" };
    default:
      return { bg: "#fff3e0", text: "#e65100" };
  }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OrganisationDetailsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // ── Org list state ──
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Edit dialog state ──
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organisation | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<OrgType | "">("");
  const [editAddress, setEditAddress] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editTypeDrawerVisible, setEditTypeDrawerVisible] = useState(false);

  // ── Fetch orgs ──
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "organizations"),
      where("userId", "==", user.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Organisation[] = snapshot.docs.map((d) => ({
        id: d.id,
        organizationName: d.data().organizationName ?? "",
        organizationType: d.data().organizationType ?? "",
        verificationStatus:
          (d.data().verificationStatus as VerificationStatus) ?? "pending",
        address: d.data().address ?? "",
      }));
      setOrgs(docs);
      setLoading(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  // ── Edit handlers ──
  function openEdit(org: Organisation) {
    setEditingOrg(org);
    setEditName(org.organizationName);
    setEditType(org.organizationType as OrgType | "");
    setEditAddress(org.address);
    setEditError(null);
    setEditModalVisible(true);
  }

  function handleDelete(org: Organisation) {
    Alert.alert(
      "Remove Organisation",
      `Are you sure you want to remove "${org.organizationName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteDoc(doc(db, "organizations", org.id)),
        },
      ],
    );
  }

  function closeEdit() {
    setEditModalVisible(false);
    setEditingOrg(null);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editName.trim()) {
      setEditError("Please enter the organisation name.");
      return;
    }
    if (!editType) {
      setEditError("Please select an organisation type.");
      return;
    }
    if (!editingOrg) return;

    setEditError(null);
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "organizations", editingOrg.id), {
        organizationName: editName.trim(),
        organizationType: editType,
        address: editAddress.trim(),
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch {
      setEditError("Failed to save. Please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Render ──
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
            {t("orgDetails.screenTitle")}
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
            showsVerticalScrollIndicator={false}
          >
            {orgs.length === 0 ? (
              /* ── Empty state ── */
              <View
                style={[
                  styles.card,
                  styles.emptyCard,
                  { backgroundColor: P.cardBg, borderColor: P.border },
                ]}
              >
                <Text style={styles.emptyEmoji}>🏛️</Text>
                <Text style={[styles.emptyTitle, { color: P.textPrimary }]}>
                  {t("orgDetails.noOrganizations")}
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: P.textSecondary }]}
                >
                  {t("orgDetails.addOrganizationSub")}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.addBtn,
                    { backgroundColor: Brand.main },
                    pressed && styles.pressed,
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push("/add-organization" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add organisation"
                >
                  <Text style={styles.addBtnText}>
                    {t("orgDetails.addOrganizationBtn")}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* ── Org cards ── */}
                {orgs.map((org) => {
                  const badge = statusBadgeStyle(org.verificationStatus);
                  return (
                    <View
                      key={org.id}
                      style={[
                        styles.card,
                        { backgroundColor: P.cardBg, borderColor: P.border },
                      ]}
                    >
                      {/* Row 1: name + status badge */}
                      <View style={styles.cardRow}>
                        <Text
                          style={[styles.orgName, { color: P.textPrimary }]}
                          numberOfLines={2}
                        >
                          {org.organizationName}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <Text
                            style={[styles.statusText, { color: badge.text }]}
                          >
                            {capitalise(org.verificationStatus)}
                          </Text>
                        </View>
                      </View>

                      {/* Row 2: org type */}
                      <View style={styles.metaRow}>
                        <Text style={styles.metaIcon}>🏢</Text>
                        <Text
                          style={[styles.metaText, { color: P.textSecondary }]}
                        >
                          {org.organizationType}
                        </Text>
                      </View>

                      {/* Row 3: address */}
                      <View style={styles.metaRow}>
                        <Text style={styles.metaIcon}>📍</Text>
                        <Text
                          style={[
                            styles.metaText,
                            {
                              color: org.address
                                ? P.textSecondary
                                : P.placeholder,
                            },
                          ]}
                        >
                          {org.address || "—"}
                        </Text>
                      </View>

                      {/* ── Action buttons ── */}
                      <View
                        style={[
                          styles.cardDivider,
                          { borderTopColor: P.border },
                        ]}
                      />
                      <View style={styles.cardActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.editBtn,
                            { borderColor: Brand.main },
                            pressed && styles.pressed,
                          ]}
                          onPress={() => openEdit(org)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${org.organizationName}`}
                        >
                          <Text
                            style={[styles.editBtnText, { color: Brand.main }]}
                          >
                            ✏️ {t("common.edit")}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={({ pressed }) => [
                            styles.removeBtn,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => handleDelete(org)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${org.organizationName}`}
                        >
                          <Text style={styles.removeBtnText}>
                            🗑️ {t("common.remove")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                {/* ── Add another link ── */}
                <Pressable
                  style={({ pressed }) => [
                    styles.addAnotherBtn,
                    pressed && styles.pressed,
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push("/add-organization" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add another organisation"
                >
                  <Text style={[styles.addAnotherText, { color: Brand.main }]}>
                    ＋ {t("orgDetails.addAnotherOrganization")}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* ════════════════════════════════════════════
          Edit Organisation Dialog
          ════════════════════════════════════════════ */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <Pressable style={styles.dialogOverlay} onPress={closeEdit}>
          {/* Stop tap-through on the dialog itself */}
          <Pressable
            style={[styles.dialogCard, { backgroundColor: P.cardBg }]}
            onPress={() => {}}
          >
            {/* Title */}
            <Text style={[styles.dialogTitle, { color: P.textPrimary }]}>
              {t("orgDetails.editOrganization")}
            </Text>

            {/* ── Organisation Name ── */}
            <View style={styles.dialogFieldGroup}>
              <Text
                style={[styles.dialogFieldLabel, { color: P.textSecondary }]}
              >
                {t("orgDetails.orgName")}
              </Text>
              <View
                style={[
                  styles.dialogInputRow,
                  {
                    borderColor:
                      editError && !editName.trim() ? P.error : P.border,
                  },
                ]}
              >
                <SymbolView
                  name={{
                    ios: "building.2",
                    android: "business",
                    web: "business",
                  }}
                  size={16}
                  tintColor={P.placeholder}
                />
                <TextInput
                  style={[styles.dialogTextInput, { color: P.textPrimary }]}
                  placeholder="Organisation name"
                  placeholderTextColor={P.placeholder}
                  value={editName}
                  onChangeText={(t) => {
                    setEditName(t);
                    setEditError(null);
                  }}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* ── Organisation Type ── */}
            <View style={styles.dialogFieldGroup}>
              <Text
                style={[styles.dialogFieldLabel, { color: P.textSecondary }]}
              >
                {t("orgDetails.orgType")}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogTypeSelector,
                  {
                    borderColor: editError && !editType ? P.error : Brand.main,
                  },
                  pressed && styles.pressed,
                ]}
                onPress={() => setEditTypeDrawerVisible(true)}
                accessibilityRole="combobox"
              >
                <SymbolView
                  name={{ ios: "lock", android: "lock", web: "lock" }}
                  size={16}
                  tintColor={P.placeholder}
                />
                <Text
                  style={[
                    styles.dialogTypeSelectorText,
                    { color: editType ? P.textPrimary : P.placeholder },
                  ]}
                >
                  {editType || "Select type"}
                </Text>
                <Text
                  style={[styles.dialogChevron, { color: P.textSecondary }]}
                >
                  ▾
                </Text>
              </Pressable>
            </View>

            {/* ── Address ── */}
            <View style={styles.dialogFieldGroup}>
              <Text
                style={[styles.dialogFieldLabel, { color: P.textSecondary }]}
              >
                {t("orgDetails.address")}
              </Text>
              <View
                style={[
                  styles.dialogInputRow,
                  styles.dialogInputRowMultiline,
                  { borderColor: P.border },
                ]}
              >
                <View style={styles.dialogAddressIconWrapper}>
                  <SymbolView
                    name={{
                      ios: "mappin",
                      android: "location_on",
                      web: "location_on",
                    }}
                    size={16}
                    tintColor={P.placeholder}
                  />
                </View>
                <TextInput
                  style={[
                    styles.dialogTextInput,
                    styles.dialogAddressInput,
                    { color: P.textPrimary },
                  ]}
                  placeholder="Street, City, State, PIN"
                  placeholderTextColor={P.placeholder}
                  value={editAddress}
                  onChangeText={(t) => {
                    setEditAddress(t);
                    setEditError(null);
                  }}
                  autoCapitalize="sentences"
                  multiline
                />
              </View>
            </View>

            {/* Error */}
            {editError ? (
              <Text style={styles.dialogErrorText}>{editError}</Text>
            ) : null}

            {/* ── Action buttons ── */}
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogCancelBtn,
                  { borderColor: P.border },
                  pressed && styles.pressed,
                ]}
                onPress={closeEdit}
                disabled={editSaving}
              >
                <Text
                  style={[styles.dialogCancelText, { color: P.textSecondary }]}
                >
                  {t("common.cancel")}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.dialogSaveBtn,
                  { backgroundColor: Brand.main },
                  pressed && styles.pressed,
                  editSaving && styles.disabled,
                ]}
                onPress={handleEditSave}
                disabled={editSaving}
                accessibilityRole="button"
              >
                {editSaving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.dialogSaveText}>{t("common.save")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Org Type Drawer (for edit dialog) ── */}
      <Modal
        visible={editTypeDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTypeDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEditTypeDrawerVisible(false)}
          />
          <View style={[styles.drawerSheet, { backgroundColor: P.cardBg }]}>
            <View
              style={[styles.drawerHandle, { backgroundColor: P.border }]}
            />
            <Text style={[styles.drawerTitle, { color: P.textPrimary }]}>
              {t("orgDetails.orgType")}
            </Text>

            {ORG_TYPES.map((type) => (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.drawerItem,
                  { borderBottomColor: "#f0f0f0" },
                  pressed && styles.drawerItemPressed,
                  editType === type && styles.drawerItemSelected,
                ]}
                onPress={() => {
                  setEditType(type);
                  setEditTypeDrawerVisible(false);
                  setEditError(null);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: editType === type }}
              >
                <Text
                  style={[
                    styles.drawerItemText,
                    { color: P.textPrimary },
                    editType === type && {
                      color: Brand.main,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {type}
                </Text>
                {editType === type && (
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
              onPress={() => setEditTypeDrawerVisible(false)}
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

  // ── Card ──
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // ── Empty state ──
  emptyCard: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 10,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 12,
  },

  // ── Add (empty-state) button ──
  addBtn: {
    borderRadius: 26,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginTop: 8,
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  addBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },

  // ── Org card rows ──
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  orgName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  metaText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  cardDivider: {
    borderTopWidth: 1,
    marginTop: 2,
    marginBottom: -4,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  editBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  removeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff5f5",
  },
  removeBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
    letterSpacing: 0.3,
  },

  // ── Add another link ──
  addAnotherBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  addAnotherText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },

  // ══════════════════════════════════════════
  // Edit Dialog
  // ══════════════════════════════════════════
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
    marginBottom: 4,
  },
  dialogFieldGroup: {
    gap: 6,
  },
  dialogFieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingLeft: 2,
  },
  dialogInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: P.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  dialogInputRowMultiline: {
    height: "auto" as any,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  dialogTextInput: {
    flex: 1,
    fontSize: 15,
  },
  dialogAddressIconWrapper: {
    alignItems: "center",
  },
  dialogAddressInput: {
    minHeight: 26,
    maxHeight: 80,
    textAlignVertical: "top",
  },
  dialogTypeSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
    backgroundColor: P.inputBg,
  },
  dialogTypeSelectorText: {
    flex: 1,
    fontSize: 15,
  },
  dialogChevron: {
    fontSize: 16,
    lineHeight: 20,
  },
  dialogErrorText: {
    fontSize: 13,
    color: P.error,
    textAlign: "center",
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  dialogCancelBtn: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  dialogSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dialogSaveText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  // ══════════════════════════════════════════
  // Org Type Bottom-Sheet Drawer (edit)
  // ══════════════════════════════════════════
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
  drawerItemPressed: { backgroundColor: "#f0f7f0" },
  drawerItemSelected: { backgroundColor: "#e8f5e1" },
  drawerItemText: { fontSize: 16 },
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
