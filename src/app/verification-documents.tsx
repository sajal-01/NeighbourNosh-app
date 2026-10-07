import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_W = Dimensions.get("window").width;
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  doc,
  getDoc,
  getFirestore,
  updateDoc,
} from "@react-native-firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { uploadToCloudinary } from "@/lib/donation-service";
import { SymbolView } from "expo-symbols";

const db = getFirestore();
const MAX_DOCS = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocItem {
  id: string;
  /** Local file URI — present for newly picked images before/during upload */
  localUri: string | null;
  /** Remote Cloudinary URL — null while uploading, set for existing or uploaded docs */
  remoteUrl: string | null;
  uploading: boolean;
  error: string | null;
}

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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function VerificationDocumentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // ── Load existing docs from Firestore ──────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const existing: string[] =
            (snap.data()?.verificationDoc as string[]) ?? [];
          setDocs(
            existing.map((url) => ({
              id: `existing_${url}`,
              localUri: null,
              remoteUrl: url,
              uploading: false,
              error: null,
            })),
          );
        }
      })
      .catch(() => {
        // Non-fatal — start with empty list
      })
      .finally(() => setInitialLoading(false));
  }, [user?.uid]);

  // ── Pick images ───────────────────────────────────────────────────────────

  const pickImages = useCallback(
    async (source: "camera" | "library") => {
      if (!user) return;
      const remaining = MAX_DOCS - docs.length;
      if (remaining <= 0) {
        Alert.alert(
          "Limit reached",
          `You can upload up to ${MAX_DOCS} documents.`,
        );
        return;
      }

      let pickedUris: string[] = [];

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission required",
            "Camera access is needed to take a photo.",
          );
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
        if (result.canceled) return;
        pickedUris = result.assets.map((a) => a.uri);
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission required",
            "Photo library access is needed to select images.",
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: 0.8,
        });
        if (result.canceled) return;
        pickedUris = result.assets.map((a) => a.uri);
      }

      // Create placeholder items immediately (shows local preview right away)
      const newItems: DocItem[] = pickedUris.slice(0, remaining).map((uri) => ({
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        localUri: uri,
        remoteUrl: null,
        uploading: true,
        error: null,
      }));

      setDocs((prev) => [...prev, ...newItems].slice(0, MAX_DOCS));

      // Upload each to Cloudinary in the background
      newItems.forEach(async (item) => {
        try {
          const url = await uploadToCloudinary(item.localUri!, user.uid);
          setDocs((prev) =>
            prev.map((d) =>
              d.id === item.id ? { ...d, remoteUrl: url, uploading: false } : d,
            ),
          );
        } catch (e) {
          setDocs((prev) =>
            prev.map((d) =>
              d.id === item.id
                ? {
                    ...d,
                    uploading: false,
                    error: e instanceof Error ? e.message : "Upload failed",
                  }
                : d,
            ),
          );
        }
      });
    },
    [docs.length, user],
  );

  // ── Picker prompt ─────────────────────────────────────────────────────────

  const showPicker = useCallback(() => {
    Alert.alert(
      t("verificationDocs.addDocTitle"),
      t("verificationDocs.chooseSource"),
      [
        {
          text: t("verificationDocs.takePhoto"),
          onPress: () => pickImages("camera"),
        },
        {
          text: t("verificationDocs.photoLibrary"),
          onPress: () => pickImages("library"),
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  }, [pickImages]);

  // ── Remove a doc ──────────────────────────────────────────────────────────

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ── Save to Firestore ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!user?.uid) return;

    const stillUploading = docs.some((d) => d.uploading);
    if (stillUploading) {
      Alert.alert(t("common.loading"), t("donate.errorPhotosMsg"));
      return;
    }

    const failedDocs = docs.filter((d) => d.error);
    if (failedDocs.length > 0) {
      Alert.alert(
        t("donate.errorPhotosFailed"),
        t("donate.errorPhotosFailedMsg"),
      );
      return;
    }

    const urls = docs
      .map((d) => d.remoteUrl)
      .filter((url): url is string => url !== null);

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        verificationDoc: urls,
      });
      Alert.alert(
        t("verificationDocs.savedTitle"),
        t("verificationDocs.savedMsg"),
        [{ text: t("common.ok"), onPress: () => router.back() }],
      );
    } catch {
      Alert.alert(t("common.error"), t("verificationDocs.saveError"));
    } finally {
      setSaving(false);
    }
  }, [docs, user?.uid, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.screen}>
      <SafeAreaView style={s.safe} edges={["top"]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: P.border }]}>
          <Pressable
            style={s.headerBack}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <SymbolView
              name={{
                android: "arrow_back",
              }}
              size={20}
              tintColor={Brand.main}
            />
            <Text style={[s.headerBackText, { color: Brand.main }]}>
              {t("common.back")}
            </Text>
          </Pressable>
          <Text style={[s.headerTitle, { color: P.textPrimary }]}>
            {t("verificationDocs.screenTitle")}
          </Text>
          <View style={s.headerBack} />
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Info card */}
          <View style={s.infoCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={28}
              color={Brand.main}
              style={{ marginBottom: 8 }}
            />
            <Text style={s.infoTitle}>{t("verificationDocs.uploadDoc")}</Text>
            <Text style={s.infoBody}>
              {t("verificationDocs.uploadDocSub", { MAX_DOCS: MAX_DOCS })}
            </Text>
          </View>

          {/* Document upload card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {t("verificationDocs.yourDocuments")}
            </Text>

            {initialLoading ? (
              <ActivityIndicator
                size="small"
                color={Brand.main}
                style={{ marginVertical: 24 }}
              />
            ) : (
              <>
                {/* Photo grid */}
                {docs.length > 0 && (
                  <View style={s.photoGrid}>
                    {docs.map((item) => {
                      const displayUri = (item.localUri ?? item.remoteUrl)!;
                      return (
                        <View key={item.id} style={s.photoThumb}>
                          {/* Tap thumbnail to open full-screen preview */}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => setPreviewUri(displayUri)}
                            style={s.thumbTouchable}
                          >
                            <Image
                              source={{ uri: displayUri }}
                              style={s.thumbImg}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>

                          {/* Uploading overlay */}
                          {item.uploading && (
                            <View
                              style={[s.thumbOverlay, s.thumbOverlayNoTouch]}
                            >
                              <ActivityIndicator size="small" color="#fff" />
                            </View>
                          )}

                          {/* Error overlay */}
                          {item.error && (
                            <View style={[s.thumbOverlay, s.thumbOverlayError]}>
                              <Ionicons name="warning" size={18} color="#fff" />
                            </View>
                          )}

                          {/* Remove button */}
                          <TouchableOpacity
                            style={s.removeBtn}
                            onPress={() => removeDoc(item.id)}
                            activeOpacity={0.8}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={s.removeBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Add document button */}
                {docs.length < MAX_DOCS && (
                  <TouchableOpacity
                    style={[s.addBtn, docs.length > 0 && s.addBtnCompact]}
                    onPress={showPicker}
                    activeOpacity={0.7}
                  >
                    <View style={s.addIconWrap}>
                      <Ionicons
                        name="camera-sharp"
                        size={26}
                        color={Brand.main}
                      />
                    </View>
                    <Text style={s.addBtnText}>
                      {docs.length === 0
                        ? `Upload document photo\n(${MAX_DOCS} max)`
                        : `Add another (${MAX_DOCS - docs.length} remaining)`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[
              s.saveBtn,
              (saving || docs.some((d) => d.uploading)) && s.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving || docs.some((d) => d.uploading)}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>
                {t("verificationDocs.uploadDoc")}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* ── Full-screen image preview ─────────────────────────────────── */}
        <Modal
          visible={!!previewUri}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewUri(null)}
        >
          <View style={s.previewOverlay}>
            <Image
              source={{ uri: previewUri! }}
              style={s.previewImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={s.previewCloseBtn}
              onPress={() => setPreviewUri(null)}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  safe: { flex: 1 },

  // Header
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
  headerBackText: { fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },

  // Info card
  infoCard: {
    backgroundColor: "#e8f5ee",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#b8d4c0",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 6,
    textAlign: "center",
  },
  infoBody: {
    fontSize: 13,
    color: "#374151",
    textAlign: "center",
    lineHeight: 19,
  },

  // Upload card
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
    marginBottom: 14,
  },

  // Photo grid
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },

  photoThumb: {
    width: "48%", // two items per row
    aspectRatio: 1, // keeps thumbnails square
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginBottom: 12,
  },

  thumbTouchable: {
    width: "100%",
    height: "100%",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbOverlayNoTouch: {
    // Sits above the touchable but shouldn't block remove button interactions
    pointerEvents: "none" as const,
  },
  thumbOverlayError: {
    backgroundColor: "rgba(220,38,38,0.7)",
  },
  removeBtn: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },

  // Add document button (mirrors photoUpload in donate.tsx)
  addBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Brand.main,
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f0faf3",
  },
  addBtnCompact: {
    paddingVertical: 14,
  },
  addIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: 13,
    color: Brand.main,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
  },

  // Save button
  saveBtn: {
    backgroundColor: Brand.main,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Full-screen preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: SCREEN_W,
    height: SCREEN_W * 1.4,
  },
  previewCloseBtn: {
    position: "absolute",
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
