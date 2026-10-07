import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
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
  collection,
  addDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";
import { useTranslation } from "react-i18next";
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AddOrganisationScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState<OrgType | "">("");
  const [address, setAddress] = useState("");

  const [orgDrawerVisible, setOrgDrawerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!organizationName.trim()) {
      setError(t("orgDetails.addOrg.errorOrgName"));
      return;
    }
    if (!organizationType) {
      setError(t("orgDetails.addOrg.errorOrgType"));
      return;
    }
    if (!address.trim()) {
      setError(t("orgDetails.addOrg.errorAddress"));
      return;
    }
    if (!user?.uid) return;

    setError(null);
    setSaving(true);
    try {
      await addDoc(collection(db, "organizations"), {
        userId: user.uid,
        organizationName: organizationName.trim(),
        organizationType,
        address: address.trim(),
        verificationStatus: "pending",
        createdAt: serverTimestamp(),
      });
      router.back();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

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
            {t("orgDetails.addOrg.screenTitle")}
          </Text>

          {/* Spacer to centre the title */}
          <View style={styles.headerBack} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: P.cardBg, borderColor: P.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: P.textPrimary }]}>
              {t("orgDetails.addOrg.orgDetails")}
            </Text>
            <Text style={[styles.cardSubtitle, { color: P.textSecondary }]}>
              {t("orgDetails.addOrg.addOrganizationSub")}
            </Text>

            {/* Organisation Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>
                {t("orgDetails.addOrg.organisationName")}
              </Text>
              <View
                style={[
                  styles.inputRow,
                  {
                    borderColor:
                      error && !organizationName.trim() ? P.error : P.border,
                  },
                ]}
              >
                <SymbolView
                  name={{
                    ios: "building.2",
                    android: "business",
                    web: "business",
                  }}
                  size={18}
                  tintColor={P.placeholder}
                />
                <TextInput
                  style={[styles.textInput, { color: P.textPrimary }]}
                  placeholder="e.g. Hope Foundation"
                  placeholderTextColor={P.placeholder}
                  value={organizationName}
                  onChangeText={(t) => {
                    setOrganizationName(t);
                    setError(null);
                  }}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Organisation Type */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>
                {t("orgDetails.addOrg.organisationType")}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.typeSelector,
                  {
                    borderColor:
                      error && !organizationType ? P.error : Brand.main,
                  },
                  pressed && styles.pressed,
                ]}
                onPress={() => setOrgDrawerVisible(true)}
                accessibilityRole="combobox"
                accessibilityLabel="Select organisation type"
              >
                <SymbolView
                  name={{ ios: "lock", android: "lock", web: "lock" }}
                  size={18}
                  tintColor={P.placeholder}
                />
                <Text
                  style={[
                    styles.typeSelectorText,
                    organizationType
                      ? { color: P.textPrimary }
                      : { color: P.placeholder },
                  ]}
                >
                  {organizationType ||
                    t("orgDetails.addOrg.organisationTypeSelect")}
                </Text>
                <Text style={[styles.chevron, { color: P.textSecondary }]}>
                  ▾
                </Text>
              </Pressable>
            </View>

            {/* Address */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>
                {t("orgDetails.addOrg.address")}
              </Text>
              <View
                style={[
                  styles.inputRow,
                  styles.inputRowMultiline,
                  {
                    borderColor: error && !address.trim() ? P.error : P.border,
                  },
                ]}
              >
                <View style={styles.addressIconWrapper}>
                  <SymbolView
                    name={{
                      ios: "mappin",
                      android: "location_on",
                      web: "location_on",
                    }}
                    size={18}
                    tintColor={P.placeholder}
                  />
                </View>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.addressInput,
                    { color: P.textPrimary },
                  ]}
                  placeholder={t("orgDetails.addOrg.addressPlaceholder")}
                  placeholderTextColor={P.placeholder}
                  value={address}
                  onChangeText={(t) => {
                    setAddress(t);
                    setError(null);
                  }}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  multiline
                />
              </View>
            </View>
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
            accessibilityLabel="Save organisation"
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {t("orgDetails.addOrg.saveBtnText")}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>

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
          <View style={[styles.drawerSheet, { backgroundColor: P.cardBg }]}>
            <View
              style={[styles.drawerHandle, { backgroundColor: P.border }]}
            />
            <Text style={[styles.drawerTitle, { color: P.textPrimary }]}>
              {t("orgDetails.addOrg.organisationType")}
            </Text>

            {ORG_TYPES.map((type) => (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.drawerItem,
                  { borderBottomColor: "#f0f0f0" },
                  pressed && styles.drawerItemPressed,
                  organizationType === type && styles.drawerItemSelected,
                ]}
                onPress={() => {
                  setOrganizationType(type);
                  setOrgDrawerVisible(false);
                  setError(null);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: organizationType === type }}
              >
                <Text
                  style={[
                    styles.drawerItemText,
                    { color: P.textPrimary },
                    organizationType === type && {
                      color: Brand.main,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {type}
                </Text>
                {organizationType === type && (
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
              onPress={() => setOrgDrawerVisible(false)}
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
  inputRowMultiline: {
    height: "auto" as any,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
  },
  addressIconWrapper: {
    alignItems: "center",
  },
  addressInput: {
    minHeight: 28,
    maxHeight: 100,
    textAlignVertical: "top",
  },

  // ── Type selector (outlined pressable) ──
  typeSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    backgroundColor: P.inputBg,
  },
  typeSelectorText: {
    flex: 1,
    fontSize: 16,
  },
  chevron: {
    fontSize: 18,
    lineHeight: 22,
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

  // ── Org Type Drawer ──
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
  drawerItemPressed: {
    backgroundColor: "#f0f7f0",
  },
  drawerItemSelected: {
    backgroundColor: "#e8f5e1",
  },
  drawerItemText: {
    fontSize: 16,
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
