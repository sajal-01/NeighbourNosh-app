import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { createDonation, uploadToCloudinary } from "@/lib/donation-service";
import {
  fetchSavedLocations,
  saveLocation,
  deleteSavedLocation,
  type SavedLocation,
} from "@/lib/saved-locations-service";
import ScreenHeader from "@/components/screen-header";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Screen } from "@/components/screen";

// ── Constants ────────────────────────────────────────────────────────────────

const CONSUME_OPTIONS = [
  "1 Hour",
  "2 Hours",
  "4 Hours",
  "6 Hours",
  "8 Hours",
  "12 Hours",
  "24 Hours",
];

const MAX_PHOTOS = 5;

type DietaryType = "Veg" | "NonVeg" | "Both";

/** Tracks a single picked photo through its Cloudinary upload lifecycle. */
interface PhotoItem {
  /** Stable ID for React keys and state updates */
  id: string;
  /** Local file:// URI shown immediately as a preview */
  localUri: string;
  /** Cloudinary HTTPS URL once the upload completes; null while uploading */
  cloudinaryUrl: string | null;
  /** True while the XHR upload is in-flight */
  uploading: boolean;
  /** Non-null when the upload failed */
  error: string | null;
}

interface LocationState {
  latitude: number;
  longitude: number;
  /** Primary display line (street / label) */
  addressMain: string;
  /** Secondary display line (city / full address) */
  addressSub: string;
  /** Complete address stored in Firestore */
  fullAddress: string;
}

// ── Map Placeholder ──────────────────────────────────────────────────────────

// Default region shown before a location is selected (Bengaluru city centre)
const DEFAULT_REGION = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const map = StyleSheet.create({
  container: {
    height: 160,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 14,
  },
});

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DonateScreen() {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dietary, setDietary] = useState<DietaryType>("Veg");
  const [consumeWithin, setConsumeWithin] = useState("4 Hours");
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Photo state ────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // ── Map ref (for animating the camera when location changes) ──────────────
  const mapRef = useRef<MapView>(null);

  // ── Active location ────────────────────────────────────────────────────────
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // ── Location picker modal ──────────────────────────────────────────────────
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [savedLocationsLoading, setSavedLocationsLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualGeocoding, setManualGeocoding] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // ── Save location state ────────────────────────────────────────────────────
  const [showSaveNameRow, setShowSaveNameRow] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const { user } = useAuth();
  const { t } = useTranslation();

  const dietaryOptions: { key: DietaryType; label: string; icon: string }[] = [
    { key: "Veg", label: t("donate.veg"), icon: "🛡" },
    { key: "NonVeg", label: t("donate.nonVeg"), icon: "🍗" },
    { key: "Both", label: t("donate.both"), icon: "🌿" },
  ];

  // ── GPS location fetch ─────────────────────────────────────────────────────

  const fetchLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError(t("addLocation.permissionDenied"));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      const mainParts = [
        place?.streetNumber,
        place?.street ?? place?.name,
        place?.district,
      ].filter(Boolean);

      const subParts = [place?.city, place?.region, place?.country].filter(
        Boolean,
      );

      const addressMain =
        mainParts.length > 0 ? mainParts.join(", ") : "Current Location";
      const addressSub = subParts.join(", ");

      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        addressMain,
        addressSub,
        fullAddress: [addressMain, addressSub].filter(Boolean).join(", "),
      });
    } catch {
      setLocationError("Could not detect location. Please try again.");
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // Animate the map camera whenever the active location changes
  useEffect(() => {
    if (!location) return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500,
    );
  }, [location]);

  // ── Location picker modal helpers ──────────────────────────────────────────

  const loadSavedLocations = useCallback(async () => {
    if (!user) return;
    setSavedLocationsLoading(true);
    try {
      const locs = await fetchSavedLocations(user.uid);
      setSavedLocations(locs);
    } catch {
      // Saved locations are optional — fail silently
    } finally {
      setSavedLocationsLoading(false);
    }
  }, [user]);

  const openLocationModal = useCallback(() => {
    setManualMode(false);
    setManualInput("");
    setManualError(null);
    setShowLocationModal(true);
    loadSavedLocations();
  }, [loadSavedLocations]);

  const handleSelectGPS = useCallback(async () => {
    setShowLocationModal(false);
    await fetchLocation();
  }, [fetchLocation]);

  const handleSelectSaved = useCallback((loc: SavedLocation) => {
    // Compose a complete address string: place name + area + building + landmark
    const fullAddress = [loc.label, loc.building, loc.landmark, loc.address]
      .filter(Boolean)
      .join(", ");

    setLocation({
      latitude: loc.latitude,
      longitude: loc.longitude,
      addressMain: loc.label,
      addressSub: [loc.building, loc.landmark, loc.address]
        .filter(Boolean)
        .join(" · "),
      fullAddress,
    });
    setLocationError(null);
    setShowSaveNameRow(false);
    setShowLocationModal(false);
  }, []);

  const confirmManualAddress = useCallback(async () => {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      setManualError("Please enter an address.");
      return;
    }
    setManualGeocoding(true);
    setManualError(null);
    try {
      const results = await Location.geocodeAsync(trimmed);
      if (!results || results.length === 0) {
        setManualError("Address not found. Try a more specific address.");
        return;
      }
      const { latitude, longitude } = results[0];
      setLocation({
        latitude,
        longitude,
        addressMain: trimmed,
        addressSub: "",
        fullAddress: trimmed,
      });
      setLocationError(null);
      setShowSaveNameRow(false);
      setShowLocationModal(false);
    } catch {
      setManualError("Could not resolve address. Please try again.");
    } finally {
      setManualGeocoding(false);
    }
  }, [manualInput]);

  const handleDeleteSaved = useCallback(
    async (id: string) => {
      if (!user) return;
      try {
        await deleteSavedLocation(user.uid, id);
        setSavedLocations((prev) => prev.filter((l) => l.id !== id));
      } catch {
        Alert.alert(t("common.error"), t("donate.deleteLocationError"));
      }
    },
    [user],
  );

  // ── Save current location ──────────────────────────────────────────────────

  const saveCurrentLocation = useCallback(async () => {
    if (!user || !location) return;
    const trimmedLabel = saveNameInput.trim();
    if (!trimmedLabel) {
      Alert.alert(t("donate.labelRequired"), t("donate.labelRequiredMsg"));
      return;
    }
    setSavingLocation(true);
    try {
      await saveLocation(user.uid, {
        label: trimmedLabel,
        address: location.fullAddress,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setSaveNameInput("");
      setShowSaveNameRow(false);
      Alert.alert(
        t("donate.successTitle"),
        `"${trimmedLabel}" added to your saved locations.`,
      );
    } catch {
      Alert.alert(t("common.error"), t("donate.saveLocationError"));
    } finally {
      setSavingLocation(false);
    }
  }, [user, location, saveNameInput]);

  // ── Image picker ───────────────────────────────────────────────────────────

  const pickImages = useCallback(
    async (source: "camera" | "library") => {
      if (!user) return;
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) {
        Alert.alert(
          t("common.error"),
          t("donate.maxPhotos", { count: MAX_PHOTOS }),
        );
        return;
      }

      let pickedUris: string[] = [];

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("common.error"), t("donate.cameraPermissionMsg"));
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.75,
        });
        if (result.canceled) return;
        pickedUris = result.assets.map((a) => a.uri);
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("common.error"), t("donate.libraryPermissionMsg"));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          quality: 0.75,
        });
        if (result.canceled) return;
        pickedUris = result.assets.map((a) => a.uri);
      }

      // Create PhotoItem entries immediately (show local preview right away)
      const newItems: PhotoItem[] = pickedUris
        .slice(0, remaining)
        .map((uri) => ({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          localUri: uri,
          cloudinaryUrl: null,
          uploading: true,
          error: null,
        }));

      setPhotos((prev) => [...prev, ...newItems].slice(0, MAX_PHOTOS));

      // Upload each photo to Cloudinary in the background
      const donorId = user.uid;
      newItems.forEach(async (item) => {
        try {
          const url = await uploadToCloudinary(item.localUri, donorId);
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? { ...p, cloudinaryUrl: url, uploading: false }
                : p,
            ),
          );
        } catch (e) {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    uploading: false,
                    error: e instanceof Error ? e.message : "Upload failed",
                  }
                : p,
            ),
          );
        }
      });
    },
    [photos.length, user],
  );

  const showPhotoPicker = useCallback(() => {
    Alert.alert(t("donate.addFoodPhotoTitle"), t("donate.chooseSource"), [
      { text: t("donate.takePicture"), onPress: () => pickImages("camera") },
      { text: t("donate.chooseLibrary"), onPress: () => pickImages("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [pickImages]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Form submit ────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setTitle("");
    setQuantity("1");
    setDietary("Veg");
    setConsumeWithin("4 Hours");
    setPhotos([]);
    setShowSaveNameRow(false);
    setSaveNameInput("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user) {
      Alert.alert(t("donate.notSignedIn"), t("donate.notSignedInMsg"));
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert(t("donate.errorTitle"), t("donate.errorTitleEmpty"));
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t("donate.errorTitle"), t("donate.errorQtyInvalid"));
      return;
    }

    if (!location) {
      Alert.alert(t("donate.errorLocation"), t("donate.errorLocationMsg"));
      return;
    }

    const stillUploading = photos.some((p) => p.uploading);
    if (stillUploading) {
      Alert.alert(t("donate.errorPhotos"), t("donate.errorPhotosMsg"));
      return;
    }

    const failedPhotos = photos.filter((p) => p.error);
    if (failedPhotos.length > 0) {
      Alert.alert(
        t("donate.errorPhotosFailed"),
        t("donate.errorPhotosFailedMsg"),
      );
      return;
    }

    setSubmitting(true);
    try {
      const expiresInHours = parseInt(consumeWithin, 10);

      await createDonation({
        donorId: user.uid,
        foodDescription: trimmedTitle,
        quantity: qty,
        dietaryType: dietary,
        pickupCoords: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        pickupAddress: location.fullAddress,
        imageUrls: photos.map((p) => p.cloudinaryUrl!),
        expiresInHours,
      });

      Alert.alert(t("donate.successTitle"), t("donate.successMsg"), [
        { text: t("common.great"), onPress: resetForm },
      ]);

      router.push("/(tabs)/" as any);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("common.somethingWentWrong");
      Alert.alert(t("donate.failedToPost"), msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    title,
    quantity,
    dietary,
    consumeWithin,
    location,
    photos,
    resetForm,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={t("donate.screenTitle")} />

      <Screen>
        {/* ── Photo Upload ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("donate.photos")}</Text>

          {photos.length > 0 && (
            <View style={s.photoGrid}>
              {photos.map((photo, index) => (
                <View key={photo.id} style={s.photoThumb}>
                  {/* Always show the local URI as preview */}
                  <Image
                    source={{ uri: photo.localUri }}
                    style={s.thumbImg}
                    resizeMode="cover"
                  />

                  {/* Uploading overlay */}
                  {photo.uploading && (
                    <View style={s.thumbOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}

                  {/* Error overlay */}
                  {photo.error && (
                    <View style={[s.thumbOverlay, s.thumbOverlayError]}>
                      <Ionicons name="warning" size={18} color="#fff" />
                    </View>
                  )}

                  <TouchableOpacity
                    style={s.removeBtn}
                    onPress={() => removePhoto(index)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={s.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {photos.length < MAX_PHOTOS && (
            <TouchableOpacity
              style={[s.photoUpload, photos.length > 0 && s.photoUploadCompact]}
              onPress={showPhotoPicker}
              activeOpacity={0.7}
            >
              <View style={s.cameraIconWrap}>
                <Ionicons name="camera-sharp" size={26} color={Brand.main} />
              </View>
              <Text style={s.photoText}>
                {photos.length === 0
                  ? t("donate.addPhotos")
                  : t("donate.addMorePhotos")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Food Details ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("donate.foodDetails")}</Text>

          <Text style={s.label}>{t("donate.foodTitle")}</Text>
          <TextInput
            style={s.input}
            placeholder="E.g., 50 Boxes of Veg Biryani"
            placeholderTextColor="#b0b8b4"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={s.label}>{t("donate.quantity")}</Text>
          <View style={s.quantityRow}>
            <TextInput
              style={[s.input, s.quantityInput]}
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
            />
            <View style={s.unitChip}>
              <Text style={s.unitChipText}>{t("donate.servings")}</Text>
            </View>
          </View>

          <Text style={s.label}>{t("donate.dietaryType")}</Text>
          <View style={s.dietaryRow}>
            {dietaryOptions.map(({ key, label, icon }) => {
              const active = dietary === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.dietBtn, active && s.dietBtnActive]}
                  onPress={() => setDietary(key)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dietBtnIcon, active && s.dietBtnIconActive]}>
                    {icon}
                  </Text>
                  <Text style={[s.dietBtnText, active && s.dietBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>{t("donate.consumeWithin")}</Text>
          <TouchableOpacity
            style={s.dropdown}
            onPress={() => setShowDropdown((v) => !v)}
            activeOpacity={0.8}
          >
            <Text style={s.dropdownText}>{consumeWithin}</Text>
            <Text style={s.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          {showDropdown && (
            <View style={s.dropdownOptions}>
              {CONSUME_OPTIONS.map((opt) => {
                const selected = consumeWithin === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.dropdownOption,
                      selected && s.dropdownOptionActive,
                    ]}
                    onPress={() => {
                      setConsumeWithin(opt);
                      setShowDropdown(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        s.dropdownOptionText,
                        selected && s.dropdownOptionTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Pickup Location ──────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t("donate.pickupLocation")}</Text>

          <MapView
            ref={mapRef}
            style={map.container}
            initialRegion={
              location
                ? {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }
                : DEFAULT_REGION
            }
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            pointerEvents="none"
          >
            {location && (
              <Marker
                coordinate={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                }}
                title={location.addressMain}
                description={location.addressSub || undefined}
                pinColor={Brand.main}
              />
            )}
          </MapView>

          {locationLoading ? (
            <View style={s.locationRow}>
              <ActivityIndicator size="small" color={Brand.main} />
              <Text style={s.locationLoadingText}>{t("donate.detecting")}</Text>
            </View>
          ) : locationError && !location ? (
            <>
              <Text style={s.locationErrorText}>{locationError}</Text>
              <TouchableOpacity
                style={s.changeLocationBtn}
                onPress={openLocationModal}
                activeOpacity={0.7}
              >
                <Text style={s.changeLocationText}>Set Pickup Location</Text>
                <Text style={s.changeLocationArrow}> ›</Text>
              </TouchableOpacity>
            </>
          ) : location ? (
            <>
              <View style={s.addressRow}>
                <Text style={s.pinEmoji}>📍</Text>
                <View style={s.addressInfo}>
                  <Text style={s.addressMain}>{location.addressMain}</Text>
                  {!!location.addressSub && (
                    <Text style={s.addressSub}>{location.addressSub}</Text>
                  )}
                </View>
              </View>

              {/* Action row: Change + Save */}
              <View style={s.locationActions}>
                <TouchableOpacity
                  style={s.changeLocationBtn}
                  onPress={openLocationModal}
                  activeOpacity={0.7}
                >
                  <Text style={s.changeLocationText}>
                    {t("donate.changeLocation")}
                  </Text>
                  <Text style={s.changeLocationArrow}> ›</Text>
                </TouchableOpacity>

                {!showSaveNameRow && (
                  <TouchableOpacity
                    style={s.saveLocationBtn}
                    onPress={() => setShowSaveNameRow(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="bookmark-outline"
                      size={13}
                      color={Brand.main}
                    />
                    <Text style={s.saveLocationText}>Save</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Inline save-name input */}
              {showSaveNameRow && (
                <View style={s.saveNameRow}>
                  <TextInput
                    style={[s.input, s.saveNameInput]}
                    placeholder='Label (e.g. "Home", "Office")'
                    placeholderTextColor="#b0b8b4"
                    value={saveNameInput}
                    onChangeText={setSaveNameInput}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[
                      s.saveNameBtn,
                      savingLocation && s.saveNameBtnDisabled,
                    ]}
                    onPress={saveCurrentLocation}
                    disabled={savingLocation}
                    activeOpacity={0.8}
                  >
                    {savingLocation ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.saveNameBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.saveNameCancel}
                    onPress={() => {
                      setShowSaveNameRow(false);
                      setSaveNameInput("");
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={18} color="#6b9e80" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={s.changeLocationBtn}
              onPress={openLocationModal}
              activeOpacity={0.7}
            >
              <Text style={s.changeLocationText}>Set Pickup Location</Text>
              <Text style={s.changeLocationArrow}> ›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── POST DONATION Button ─────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [
            s.postBtn,
            pressed && s.postBtnPressed,
            submitting && s.postBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Post Donation"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={s.postBtnIcon}>➤</Text>
              <Text style={s.postBtnText}>{t("donate.submitBtn")}</Text>
            </>
          )}
        </Pressable>
      </Screen>

      {/* ── Location Picker Modal ────────────────────────────────────────── */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLocationModal(false)}
      >
        <KeyboardAvoidingView
          style={m.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={m.sheet}>
            {/* Sheet header */}
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>{t("donate.locationModal")}</Text>
              <TouchableOpacity
                style={m.closeBtn}
                onPress={() => setShowLocationModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#0f2419" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* GPS option */}
              <TouchableOpacity
                style={m.optionRow}
                onPress={handleSelectGPS}
                activeOpacity={0.7}
              >
                <View style={m.optionIconWrap}>
                  <Ionicons name="locate" size={20} color={Brand.main} />
                </View>
                <View style={m.optionTextWrap}>
                  <Text style={m.optionTitle}>{t("donate.gpsOption")}</Text>
                  <Text style={m.optionSub}>{t("donate.gpsOptionSub")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c8d8ce" />
              </TouchableOpacity>

              <View style={m.divider} />

              {/* Saved locations */}
              {savedLocationsLoading ? (
                <View style={m.loadingRow}>
                  <ActivityIndicator size="small" color={Brand.main} />
                  <Text style={m.loadingText}>Loading saved locations…</Text>
                </View>
              ) : savedLocations.length > 0 ? (
                <>
                  <Text style={m.sectionLabel}>{t("donate.savedOption")}</Text>
                  {savedLocations.map((loc) => (
                    <View key={loc.id} style={m.savedRow}>
                      <TouchableOpacity
                        style={m.savedRowContent}
                        onPress={() => handleSelectSaved(loc)}
                        activeOpacity={0.7}
                      >
                        <View style={m.optionIconWrap}>
                          <Ionicons
                            name="location"
                            size={18}
                            color={Brand.main}
                          />
                        </View>
                        <View style={m.optionTextWrap}>
                          <Text style={m.savedLabel}>{loc.label}</Text>
                          <Text style={m.optionSub} numberOfLines={2}>
                            {[loc.building, loc.landmark, loc.address]
                              .filter(Boolean)
                              .join(" · ") || loc.address}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={m.deleteBtn}
                        onPress={() => handleDeleteSaved(loc.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#e05252"
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={m.divider} />
                </>
              ) : null}

              {/* Manual entry toggle */}
              <TouchableOpacity
                style={m.optionRow}
                onPress={() => {
                  setManualMode((v) => !v);
                  setManualInput("");
                  setManualError(null);
                }}
                activeOpacity={0.7}
              >
                <View style={m.optionIconWrap}>
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={Brand.main}
                  />
                </View>
                <View style={m.optionTextWrap}>
                  <Text style={m.optionTitle}>{t("donate.manualOption")}</Text>
                  <Text style={m.optionSub}>{t("donate.manualOptionSub")}</Text>
                </View>
                <Ionicons
                  name={manualMode ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#c8d8ce"
                />
              </TouchableOpacity>

              {manualMode && (
                <View style={m.manualWrap}>
                  <TextInput
                    style={m.manualInput}
                    placeholder="e.g. 45 Church Street, Bengaluru, Karnataka"
                    placeholderTextColor="#b0b8b4"
                    value={manualInput}
                    onChangeText={(t) => {
                      setManualInput(t);
                      setManualError(null);
                    }}
                    multiline
                    autoFocus
                  />
                  {!!manualError && (
                    <Text style={m.manualError}>{manualError}</Text>
                  )}
                  <TouchableOpacity
                    style={[
                      m.confirmBtn,
                      manualGeocoding && m.confirmBtnDisabled,
                    ]}
                    onPress={confirmManualAddress}
                    disabled={manualGeocoding}
                    activeOpacity={0.8}
                  >
                    {manualGeocoding ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={m.confirmBtnText}>
                        {t("donate.manualConfirmBtn")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Bottom padding for keyboard */}
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Screen styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4FBF7" },

  scroll: { flex: 1, backgroundColor: "#F4FBF7" },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 12,
  },

  // Photo
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbOverlayError: {
    backgroundColor: "rgba(180,30,30,0.65)",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  photoUpload: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#a8d5b5",
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f6fcf8",
  },
  photoUploadCompact: { paddingVertical: 12 },
  cameraIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
  },
  photoText: {
    fontSize: 13,
    color: "#6b9e80",
    textAlign: "center",
    lineHeight: 19,
  },

  // Form
  label: {
    fontSize: 13,
    color: "#327023",
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f2419",
    backgroundColor: "#fafffe",
  },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  quantityInput: { width: 90 },
  unitChip: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f6fcf8",
  },
  unitChipText: { fontSize: 13, color: "#6b9e80" },

  dietaryRow: { flexDirection: "row", gap: 8 },
  dietBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6ede0",
    backgroundColor: "#fafffe",
  },
  dietBtnActive: { backgroundColor: "#e8f5ee", borderColor: Brand.main },
  dietBtnIcon: { fontSize: 14 },
  dietBtnIconActive: {},
  dietBtnText: { fontSize: 13, color: "#6b9e80", fontWeight: "500" },
  dietBtnTextActive: { color: Brand.main, fontWeight: "700" },

  dropdown: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fafffe",
  },
  dropdownText: { fontSize: 14, color: "#0f2419" },
  dropdownArrow: { fontSize: 14, color: "#6b9e80" },
  dropdownOptions: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f7f2",
  },
  dropdownOptionActive: { backgroundColor: "#e8f5ee" },
  dropdownOptionText: { fontSize: 14, color: "#0f2419" },
  dropdownOptionTextActive: { color: Brand.main, fontWeight: "600" },

  // Location card
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  locationLoadingText: { fontSize: 13, color: "#6b9e80" },
  locationErrorText: {
    fontSize: 13,
    color: "#c0392b",
    marginBottom: 8,
    lineHeight: 18,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  pinEmoji: { fontSize: 18, marginTop: 1 },
  addressInfo: { flex: 1 },
  addressMain: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
    lineHeight: 20,
  },
  addressSub: { fontSize: 12, color: "#6b9e80", marginTop: 2, lineHeight: 17 },

  locationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  changeLocationBtn: { flexDirection: "row", alignItems: "center" },
  changeLocationText: { fontSize: 13, color: Brand.main, fontWeight: "600" },
  changeLocationArrow: {
    fontSize: 16,
    color: Brand.main,
    fontWeight: "700",
    lineHeight: 20,
  },

  saveLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6ede0",
    backgroundColor: "#f6fcf8",
  },
  saveLocationText: { fontSize: 12, color: Brand.main, fontWeight: "600" },

  saveNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  saveNameInput: { flex: 1, marginTop: 0 },
  saveNameBtn: {
    backgroundColor: Brand.main,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  saveNameBtnDisabled: { opacity: 0.6 },
  saveNameBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  saveNameCancel: { padding: 4 },

  // Submit
  postBtn: {
    backgroundColor: Brand.main,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    elevation: 3,
    minHeight: 54,
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  postBtnPressed: { opacity: 0.85 },
  postBtnDisabled: { opacity: 0.7 },
  postBtnIcon: { fontSize: 16, color: "#fff" },
  postBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});

// ── Modal styles ──────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 8,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f7f2",
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#0f2419" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f7f2",
    alignItems: "center",
    justifyContent: "center",
  },

  // Option rows (GPS + manual toggle)
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: { flex: 1 },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
    marginBottom: 2,
  },
  optionSub: { fontSize: 12, color: "#6b9e80", lineHeight: 17 },

  divider: { height: 1, backgroundColor: "#f0f7f2", marginVertical: 4 },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  loadingText: { fontSize: 13, color: "#6b9e80" },

  // Saved locations
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ab8a4",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  savedRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  savedLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f2419",
    marginBottom: 2,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },

  // Manual entry
  manualWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: "#d6ede0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0f2419",
    backgroundColor: "#fafffe",
    minHeight: 72,
    textAlignVertical: "top",
  },
  manualError: { fontSize: 12, color: "#c0392b", lineHeight: 17 },
  confirmBtn: {
    backgroundColor: Brand.main,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  confirmBtnDisabled: { opacity: 0.65 },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
