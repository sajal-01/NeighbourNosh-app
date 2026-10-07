import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getFirestore,
  doc,
  onSnapshot,
  updateDoc,
  GeoPoint,
} from "@react-native-firebase/firestore";
import { encodeGeohash } from "@/lib/donation-service";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
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
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedAddress {
  id: string;
  label?: string; // "Home" | "Work" | "Other"
  fullAddress: string; // Reverse-geocoded street address
  houseNo: string;
  building: string;
  landmark: string;
  lat: number;
  lng: number;
  isPrimary?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SavedLocationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Real-time listener ──
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAddresses((data?.savedAddresses as SavedAddress[]) ?? []);
      } else {
        setAddresses([]);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  // ── Delete handler ──
  function handleDelete(id: string) {
    Alert.alert(
      t("savedLocations.deleteConfirm"),
      t("savedLocations.deleteConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!user?.uid) return;
            const deleted = addresses.find((a) => a.id === id);
            let filtered = addresses.filter((a) => a.id !== id);

            let syncedFields: {
              gpsLocation: GeoPoint;
              geohash: string;
            } | null = null;

            if (filtered.length === 1) {
              // Only one address left — it's the de-facto primary, so sync
              // the top-level fields to match it.
              const onlyRemaining = filtered[0];
              syncedFields = {
                gpsLocation: new GeoPoint(onlyRemaining.lat, onlyRemaining.lng),
                geohash: encodeGeohash(onlyRemaining.lat, onlyRemaining.lng),
              };
            } else if (filtered.length > 1 && deleted?.isPrimary) {
              // The primary address was just deleted and multiple addresses
              // still remain — fall back to auto-promoting the first
              // remaining address instead of leaving the top-level fields
              // pointing at a now-deleted address.
              const [first, ...rest] = filtered;
              filtered = [{ ...first, isPrimary: true }, ...rest];
              syncedFields = {
                gpsLocation: new GeoPoint(first.lat, first.lng),
                geohash: encodeGeohash(first.lat, first.lng),
              };
            }

            await updateDoc(doc(db, "users", user.uid), {
              savedAddresses: filtered,
              ...(syncedFields ?? {}),
            });
          },
        },
      ],
    );
  }

  // ── Set Primary handler ──
  async function handleSetPrimary(id: string) {
    if (!user?.uid) return;
    const target = addresses.find((a) => a.id === id);
    if (!target) return;

    const updated = addresses.map((a) => ({ ...a, isPrimary: a.id === id }));

    try {
      // The address being set primary always satisfies the "isPrimary"
      // condition, so the top-level fields are synced to it unconditionally.
      await updateDoc(doc(db, "users", user.uid), {
        savedAddresses: updated,
        gpsLocation: new GeoPoint(target.lat, target.lng),
        geohash: encodeGeohash(target.lat, target.lng),
      });
    } catch {
      Alert.alert(
        "Error",
        "Could not update primary address. Please try again.",
      );
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
            {t("savedLocations.screenTitle")}
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
            {addresses.length === 0 ? (
              /* ── Empty state ── */
              <View
                style={[
                  styles.card,
                  styles.emptyCard,
                  { backgroundColor: P.cardBg, borderColor: P.border },
                ]}
              >
                {/*<Text style={styles.emptyEmoji}>📍</Text>*/}
                <MaterialIcons
                  name="location-pin"
                  size={24}
                  color={Brand.main}
                />
                <Text style={[styles.emptyTitle, { color: P.textPrimary }]}>
                  {t("savedLocations.noLocations")}
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: P.textSecondary }]}
                >
                  Add your frequently used addresses
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.addBtn,
                    { backgroundColor: Brand.main },
                    pressed && styles.pressed,
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push("/add-location" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add location"
                >
                  <Text style={styles.addBtnText}>
                    {t("savedLocations.addLocation")}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* ── Address cards ── */}
                {addresses.map((addr) => (
                  <View
                    key={addr.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: P.cardBg,
                        borderColor: addr.isPrimary ? Brand.main : P.border,
                        borderWidth: addr.isPrimary ? 2 : 1,
                      },
                    ]}
                  >
                    {/* Row 1: label text + PRIMARY badge + delete */}
                    <View style={styles.cardRow}>
                      {/*location pin icon*/}
                      <MaterialIcons
                        name="location-pin"
                        size={24}
                        color={Brand.main}
                      />
                      <Text
                        style={[styles.labelText, { color: P.textPrimary }]}
                      >
                        {addr.label ?? "Address"}
                      </Text>
                      {addr.isPrimary && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>
                            ⭐ {t("savedLocations.primary")}
                          </Text>
                        </View>
                      )}
                      <Pressable
                        style={({ pressed }) => [
                          styles.deleteBtn,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => handleDelete(addr.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${addr.label ?? "address"}`}
                      >
                        <Ionicons
                          name="trash-bin-outline"
                          size={24}
                          color={Brand.main}
                        />
                      </Pressable>
                    </View>

                    {/* Row 2: full address */}
                    <Text
                      style={[styles.addressText, { color: P.textSecondary }]}
                      numberOfLines={2}
                    >
                      {addr.fullAddress}
                    </Text>

                    {/* Row 3: house number (if present) */}
                    {!!addr.houseNo && (
                      <Text
                        style={[styles.houseNoText, { color: P.textSecondary }]}
                      >
                        {addr.houseNo}
                      </Text>
                    )}

                    {/* ── Card footer: Set Primary + Edit ── */}
                    <View
                      style={[styles.cardDivider, { borderTopColor: P.border }]}
                    />
                    <View style={styles.cardFooter}>
                      {/* Set as Primary / Primary indicator */}
                      <Pressable
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          addr.isPrimary && {
                            backgroundColor: Brand.main,
                            borderColor: Brand.main,
                          },
                          pressed && !addr.isPrimary && styles.pressed,
                        ]}
                        onPress={() => {
                          if (!addr.isPrimary) handleSetPrimary(addr.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          addr.isPrimary
                            ? "Already primary address"
                            : `Set ${addr.label ?? "address"} as primary`
                        }
                      >
                        <Text
                          style={[
                            styles.primaryBtnText,
                            addr.isPrimary && styles.primaryBtnTextActive,
                          ]}
                        >
                          {addr.isPrimary
                            ? `⭐ ${t("savedLocations.primary")}`
                            : t("savedLocations.setPrimary")}
                        </Text>
                      </Pressable>

                      {/* Edit */}
                      <Pressable
                        style={({ pressed }) => [
                          styles.editBtn,
                          // { borderColor: Brand.main },
                          // border none
                          { borderWidth: 0 },
                          // padding left
                          { paddingLeft: 20 },
                          pressed && styles.pressed,
                        ]}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onPress={() =>
                          router.push(`/add-location?editId=${addr.id}` as any)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${addr.label ?? "address"}`}
                      >
                        <MaterialIcons
                          name="edit-location-alt"
                          size={25}
                          color={Brand.main}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}

                {/* ── Add new location link ── */}
                <Pressable
                  style={({ pressed }) => [
                    styles.addAnotherBtn,
                    pressed && styles.pressed,
                  ]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push("/add-location" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add new location"
                >
                  <Text style={[styles.addAnotherText, { color: Brand.main }]}>
                    ＋ {t("savedLocations.addLocation")}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
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

  // ── Address card rows ──
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  labelText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    fontSize: 18,
    color: "#d32f2f",
  },
  addressText: {
    fontSize: 14,
    lineHeight: 20,
  },
  houseNoText: {
    fontSize: 12,
    lineHeight: 18,
  },

  // ── Card divider + edit button ──
  cardDivider: {
    borderTopWidth: 1,
    marginTop: 2,
    marginBottom: -4,
  },
  editBtn: {
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

  // ── Add new location link ──
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

  // ── Primary address ──
  primaryBadge: {
    backgroundColor: "#fff8e1",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#b45309",
  },
  cardFooter: {
    flexDirection: "row" as const,
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Brand.main,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Brand.main,
    letterSpacing: 0.2,
  },
  primaryBtnTextActive: {
    color: "#ffffff",
  },
});
