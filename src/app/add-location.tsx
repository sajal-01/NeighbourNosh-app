import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import type { Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  GeoPoint,
} from "@react-native-firebase/firestore";
import { encodeGeohash } from "@/lib/donation-service";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/context/auth";
import { Brand } from "@/constants/theme";
import { Screen } from "@/components/screen";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

// ── Google Maps API Key ───────────────────────────────────────────────────────
// Replace with your key (Geocoding + Places APIs must be enabled)
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS;

if (__DEV__ && !GOOGLE_MAPS_API_KEY) {
  console.warn(
    "[AddLocation] EXPO_PUBLIC_GOOGLE_MAPS is empty/undefined — every Geocoding " +
      "and Places request below will fail with REQUEST_DENIED. Expo only inlines " +
      "EXPO_PUBLIC_ env vars at bundler start time, so if you just added/changed " +
      "it in your .env file you need to fully restart Metro (not just reload).",
  );
}

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

// ── Types ─────────────────────────────────────────────────────────────────────
interface SavedAddress {
  id: string;
  fullAddress: string;
  houseNo: string;
  building: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
  lat: number;
  lng: number;
  /** Firestore GeoPoint — mirrors lat/lng for geo-queries */
  gpsLocation: GeoPoint;
  /** Geohash of lat/lng for proximity queries */
  geohash: string;
  isPrimary?: boolean;
}

interface PlaceSuggestion {
  place_id: string;
  description: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; status: string }> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`,
    );
    const data = await res.json();
    if (data.status === "OK" && data.results?.[0]) {
      return {
        address: data.results[0].formatted_address as string,
        status: "OK",
      };
    }
    if (__DEV__ && data.status !== "OK") {
      console.warn(
        "[AddLocation] Geocoding API returned:",
        data.status,
        data.error_message ?? "(no error_message)",
      );
    }
    return { address: "", status: data.status ?? "UNKNOWN" };
  } catch (err) {
    if (__DEV__) console.warn("[AddLocation] Geocoding fetch threw:", err);
    return { address: "", status: "NETWORK_ERROR" };
  }
}

async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string,
): Promise<{ results: PlaceSuggestion[]; status: string }> {
  if (!input.trim() || input.trim().length < 3)
    return { results: [], status: "TOO_SHORT" };
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input,
      )}&key=${GOOGLE_MAPS_API_KEY}&language=en&sessiontoken=${sessionToken}`,
    );
    const data = await res.json();
    if (data.status === "OK") {
      return {
        results: (data.predictions ?? []) as PlaceSuggestion[],
        status: "OK",
      };
    }
    if (__DEV__ && data.status !== "ZERO_RESULTS") {
      console.warn(
        "[AddLocation] Places Autocomplete returned:",
        data.status,
        data.error_message ?? "(no error_message)",
      );
    }
    return { results: [], status: data.status ?? "UNKNOWN" };
  } catch (err) {
    if (__DEV__) console.warn("[AddLocation] Autocomplete fetch threw:", err);
    return { results: [], status: "NETWORK_ERROR" };
  }
}

async function fetchPlaceLatLng(
  placeId: string,
  sessionToken: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}&sessiontoken=${sessionToken}`,
    );
    const data = await res.json();
    const loc = data.result?.geometry?.location;
    if (loc) return { lat: loc.lat as number, lng: loc.lng as number };
  } catch {
    /* ignore */
  }
  return null;
}

// ── Default region (India) ────────────────────────────────────────────────────
const DEFAULT_REGION: Region = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AddLocationScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditing = Boolean(editId);

  // ── Form state ──
  const [houseNo, setHouseNo] = useState("");
  const [building, setBuilding] = useState("");
  const [landmark, setLandmark] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);

  // ── Autocomplete state ──
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Invalidates stale in-flight autocomplete requests (out-of-order resolution guard)
  const autocompleteReqIdRef = useRef(0);
  // Google bills Places Autocomplete + Details per "session" rather than per keystroke
  const sessionTokenRef = useRef<string>(generateId());

  // ── Reverse geocoding (map pin drop) state ──
  const regionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reverseGeocodeReqIdRef = useRef(0);

  // ── UI state ──
  const [geocoding, setGeocoding] = useState(false);
  const [currentLocLoading, setCurrentLocLoading] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugApiNote, setDebugApiNote] = useState<string | null>(null);

  // ── Refs ──
  const mapRef = useRef<MapView>(null);
  const lastGeocodedRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Load existing address when editing ──
  useEffect(() => {
    if (!isEditing || !user?.uid || !editId) return;

    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const addresses: SavedAddress[] = snap.data()?.savedAddresses ?? [];
          const existing = addresses.find((a) => a.id === editId);
          if (existing) {
            setHouseNo(existing.houseNo);
            setBuilding(existing.building);
            setLandmark(existing.landmark);
            setContactName(existing.contactName ?? "");
            setContactPhone(existing.contactPhone ?? "");
            setFullAddress(existing.fullAddress);
            const newRegion: Region = {
              latitude: existing.lat,
              longitude: existing.lng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            };
            setRegion(newRegion);
            lastGeocodedRef.current = { lat: existing.lat, lng: existing.lng };
          }
        }
      })
      .finally(() => setLoading(false));
  }, [isEditing, user?.uid, editId]);

  // ── Cleanup any pending timers on unmount ──
  useEffect(() => {
    return () => {
      if (autocompleteTimerRef.current)
        clearTimeout(autocompleteTimerRef.current);
      if (regionChangeTimerRef.current)
        clearTimeout(regionChangeTimerRef.current);
    };
  }, []);

  // ── Map region change (pin drop) → debounced reverse geocode ──
  function handleRegionChange(r: Region) {
    setRegion(r);
    // Dismiss autocomplete while user is interacting with the map
    if (autocompleteTimerRef.current)
      clearTimeout(autocompleteTimerRef.current);
    setSuggestions([]);

    const last = lastGeocodedRef.current;
    const moved =
      !last ||
      Math.abs(r.latitude - last.lat) > 0.0001 ||
      Math.abs(r.longitude - last.lng) > 0.0001;

    if (!moved) return;

    lastGeocodedRef.current = { lat: r.latitude, lng: r.longitude };

    // Debounce so a flurry of onRegionChangeComplete events (common during
    // fast pans / momentum scroll on Android) doesn't fire a burst of
    // Geocoding API calls or let an older response overwrite a newer one.
    if (regionChangeTimerRef.current)
      clearTimeout(regionChangeTimerRef.current);
    regionChangeTimerRef.current = setTimeout(() => {
      void runReverseGeocode(r.latitude, r.longitude);
    }, 350);
  }

  async function runReverseGeocode(lat: number, lng: number) {
    const reqId = ++reverseGeocodeReqIdRef.current;
    setGeocoding(true);
    const { address, status } = await reverseGeocode(lat, lng);
    // If the map moved again (or a newer request started) while we were
    // waiting, this response is stale — drop it instead of overwriting
    // whatever the textbox should now show.
    if (reqId !== reverseGeocodeReqIdRef.current) return;
    if (address) {
      setFullAddress(address);
      setDebugApiNote(null);
    } else if (__DEV__) {
      setDebugApiNote(`Geocoding API: ${status}`);
    }
    setGeocoding(false);
  }

  // ── Address text input → autocomplete ──
  function handleAddressInputChange(text: string) {
    setFullAddress(text);
    setError(null);

    if (autocompleteTimerRef.current)
      clearTimeout(autocompleteTimerRef.current);

    if (text.trim().length >= 3) {
      autocompleteTimerRef.current = setTimeout(() => {
        void runAutocomplete(text);
      }, 300);
    } else {
      autocompleteReqIdRef.current++; // invalidate any in-flight request
      setSuggestions([]);
    }
  }

  async function runAutocomplete(text: string) {
    const reqId = ++autocompleteReqIdRef.current;
    const { results, status } = await fetchPlaceSuggestions(
      text,
      sessionTokenRef.current,
    );
    // Drop out-of-order responses — without this, a slow response for an
    // earlier keystroke can land after a faster one and show stale results.
    if (reqId !== autocompleteReqIdRef.current) return;
    setSuggestions(results.slice(0, 5));
    if (status === "OK" || status === "ZERO_RESULTS") {
      setDebugApiNote(null);
    } else if (__DEV__) {
      setDebugApiNote(`Places Autocomplete: ${status}`);
    }
  }

  // ── Select an autocomplete suggestion ──
  async function handleSelectSuggestion(suggestion: PlaceSuggestion) {
    if (autocompleteTimerRef.current)
      clearTimeout(autocompleteTimerRef.current);
    autocompleteReqIdRef.current++; // invalidate any in-flight autocomplete fetch
    setSuggestions([]);
    setFullAddress(suggestion.description);

    const coords = await fetchPlaceLatLng(
      suggestion.place_id,
      sessionTokenRef.current,
    );
    // Start a fresh session token now that this session's autocomplete flow
    // has ended (Google bills per session, not per keystroke).
    sessionTokenRef.current = generateId();

    if (coords) {
      const newRegion: Region = {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      setRegion(newRegion);
      lastGeocodedRef.current = { lat: coords.lat, lng: coords.lng };
      mapRef.current?.animateToRegion(newRegion, 500);
    }
  }

  // ── Current location button ──
  async function goToCurrentLocation() {
    setCurrentLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("addLocation.permissionDenied"));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const newRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      mapRef.current?.animateToRegion(newRegion, 600);
      setRegion(newRegion);
      // Force re-geocode on next region change
      lastGeocodedRef.current = null;
    } catch {
      setError("Could not get current location. Please try again.");
    } finally {
      setCurrentLocLoading(false);
    }
  }

  // ── Save handler ──
  async function handleSave() {
    if (!fullAddress.trim()) {
      setError(t("addLocation.pleaseWait"));
      return;
    }
    if (!houseNo.trim()) {
      setError("Please enter house number and floor.");
      return;
    }
    if (!user?.uid) return;

    setError(null);
    setSaving(true);
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const current: SavedAddress[] = snap.exists()
        ? (snap.data()?.savedAddresses ?? [])
        : [];

      const originalEntry = isEditing
        ? current.find((a) => a.id === editId)
        : undefined;

      const gpsLocation = new GeoPoint(region.latitude, region.longitude);
      const geohash = encodeGeohash(region.latitude, region.longitude);

      const newEntry: SavedAddress = {
        id: isEditing && editId ? editId : generateId(),
        fullAddress: fullAddress.trim(),
        houseNo: houseNo.trim(),
        building: building.trim(),
        landmark: landmark.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        lat: region.latitude,
        lng: region.longitude,
        gpsLocation,
        geohash,
        isPrimary: originalEntry?.isPrimary ?? false,
      };

      const newArray = isEditing
        ? current.map((a) => (a.id === editId ? newEntry : a))
        : [...current, newEntry];

      // Top-level gpsLocation/geohash (used by proximity queries such as
      // emergency_food_request) should only mirror ONE address. Only sync
      // them here when this address is explicitly primary, or when it's the
      // only saved address there is — otherwise leave the existing top-level
      // fields untouched.
      const shouldSyncTopLevel =
        newEntry.isPrimary === true || newArray.length === 1;

      await updateDoc(doc(db, "users", user.uid), {
        savedAddresses: newArray,
        ...(shouldSyncTopLevel ? { gpsLocation, geohash } : {}),
      });
      router.back();
    } catch {
      setError("Failed to save address. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={[styles.header, { borderBottomColor: P.border }]}>
          <Pressable
            style={styles.headerBack}
            onPress={() => router.back()}
            accessibilityRole="button"
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
            {t("addLocation.screenTitle")}
          </Text>
          <View style={styles.headerBack} />
        </View>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Brand.main} />
        </View>
      </SafeAreaView>
    );
  }

  return (
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
              android: "arrow_back",
            }}
            size={20}
            tintColor={Brand.main}
          />
          <Text style={[styles.headerBackText, { color: Brand.main }]}>
            {t("common.back")}
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: P.textPrimary }]}>
          {t("addLocation.screenTitle")}
        </Text>
        <View style={styles.headerBack} />
      </View>

      {/* ── Scrollable body ── */}

      <KeyboardAwareScrollView
        style={styles.scroll}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardOpeningTime={0}
      >
        {/* ════════════════════ Map section ════════════════════ */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            onRegionChangeComplete={handleRegionChange}
            showsUserLocation
            showsMyLocationButton={false}
          />

          {/* Centre-pin overlay (pointer-events none so touches pass through) */}
          <View style={styles.pinOverlay} pointerEvents="none">
            <Text style={styles.pinEmoji}>📍</Text>
          </View>

          {/* Current location button */}
          <Pressable
            style={({ pressed }) => [
              styles.currentLocBtn,
              { backgroundColor: P.cardBg, borderColor: P.border },
              pressed && styles.pressed,
            ]}
            onPress={goToCurrentLocation}
            accessibilityRole="button"
            accessibilityLabel="Use current location"
          >
            {currentLocLoading ? (
              <ActivityIndicator size="small" color={Brand.main} />
            ) : (
              <Text style={styles.currentLocEmoji}>
                <MaterialIcons
                  name="my-location"
                  size={24}
                  color={Brand.main}
                />
              </Text>
            )}
          </Pressable>
        </View>

        {/* ── Dev-only diagnostic banner: shows the raw Google API status when
              reverse geocoding or autocomplete fails, so the failure reason is
              visible even without a connected JS debugger ── */}
        {__DEV__ && debugApiNote && (
          <View style={styles.debugBanner}>
            <Text style={styles.debugBannerText}>⚠ {debugApiNote}</Text>
          </View>
        )}

        {/* ════════════════════ Address input card ════════════════════ */}
        <View
          style={[
            styles.addressCard,
            { backgroundColor: P.cardBg, borderColor: P.border },
          ]}
        >
          <Text
            style={[
              styles.addressInput,
              {
                color: P.placeholder,
                fontSize: 12,
              },
            ]}
          >
            {t("addLocation.mapHint")}
          </Text>
          <View style={styles.addressRow}>
            {/* Pin icon — top-aligned */}
            <View style={styles.addressIconWrapper}>
              <Text style={styles.addressIcon}>
                <MaterialIcons
                  name="location-on"
                  size={24}
                  color={Brand.main}
                />
              </Text>
            </View>

            {/* Editable address input — always visible so it never
                  "disappears" while reverse geocoding runs in the background */}
            <View style={styles.addressInputBlock}>
              <TextInput
                style={[styles.addressInput, { color: P.textPrimary }]}
                // placeholder={t("addLocation.mapHint")}
                placeholderTextColor={P.placeholder}
                value={fullAddress}
                onChangeText={handleAddressInputChange}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {/* Small inline spinner while the pin-drop reverse geocode is running */}
            {geocoding && (
              <ActivityIndicator
                size="small"
                color={Brand.main}
                style={styles.addressLoadingIndicator}
              />
            )}
          </View>

          {/* Dashed divider */}
          <View style={[styles.dashedDivider, { borderColor: P.border }]} />
        </View>

        {/* ── Autocomplete suggestions ── */}
        {suggestions.length > 0 && (
          <View
            style={[
              styles.suggestionsContainer,
              { backgroundColor: P.cardBg, borderColor: P.border },
            ]}
          >
            {suggestions.map((item, idx) => (
              <Pressable
                key={item.place_id}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  idx < suggestions.length - 1 && [
                    styles.suggestionSeparator,
                    { borderBottomColor: P.border },
                  ],
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelectSuggestion(item)}
                accessibilityRole="button"
              >
                <Text style={styles.suggestionIcon}>🔍</Text>
                <Text
                  style={[styles.suggestionText, { color: P.textPrimary }]}
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ════════════════════ Add address form ════════════════════ */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: P.textPrimary }]}>
            {t("addLocation.address")}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                borderColor:
                  error === t("addLocation.addressErr") ? P.error : P.border,
                color: P.textPrimary,
                backgroundColor: P.inputBg,
              },
            ]}
            placeholder={t("addLocation.placeHolderHouse")}
            placeholderTextColor={P.placeholder}
            value={houseNo}
            onChangeText={(t) => {
              setHouseNo(t);
              setError(null);
            }}
            returnKeyType="next"
          />

          <TextInput
            style={[
              styles.input,
              {
                borderColor: P.border,
                color: P.textPrimary,
                backgroundColor: P.inputBg,
              },
            ]}
            placeholder={t("addLocation.placeHolderBuilding")}
            placeholderTextColor={P.placeholder}
            value={building}
            onChangeText={setBuilding}
            returnKeyType="next"
          />

          <TextInput
            style={[
              styles.input,
              {
                borderColor: P.border,
                color: P.textPrimary,
                backgroundColor: P.inputBg,
              },
            ]}
            placeholder={t("addLocation.placeHolderLandmark")}
            placeholderTextColor={P.placeholder}
            value={landmark}
            onChangeText={setLandmark}
            returnKeyType="next"
          />
        </View>

        {/* ════════════════════ Contact section ════════════════════ */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: P.textPrimary }]}>
            {t("addLocation.contactDetails")}
          </Text>

          <View
            style={[
              styles.inputRow,
              { borderColor: P.border, backgroundColor: P.inputBg },
            ]}
          >
            <SymbolView
              name={{ ios: "person", android: "person", web: "person" }}
              size={18}
              tintColor={P.placeholder}
            />
            <TextInput
              style={[styles.inputRowText, { color: P.textPrimary }]}
              placeholder={t("addLocation.contactName")}
              placeholderTextColor={P.placeholder}
              value={contactName}
              onChangeText={setContactName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View
            style={[
              styles.inputRow,
              { borderColor: P.border, backgroundColor: P.inputBg },
            ]}
          >
            <SymbolView
              name={{ ios: "phone", android: "phone", web: "phone" }}
              size={18}
              tintColor={P.placeholder}
            />
            <TextInput
              style={[styles.inputRowText, { color: P.textPrimary }]}
              placeholder={t("addLocation.contactPhone")}
              placeholderTextColor={P.placeholder}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>
        </View>

        {/* ── Error ── */}
        {error ? (
          <Text style={[styles.errorText, { color: P.error }]}>{error}</Text>
        ) : null}

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
          accessibilityLabel="Save address"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>{t("addLocation.saveBtn")}</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
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
  headerBackText: { fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.2 },

  // ── Loader ──
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  // ── Scroll ──
  scroll: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },
  scrollContent: {
    paddingBottom: 60,
    gap: 14,
  },

  // ── Map ──
  mapContainer: {
    height: 220,
    position: "relative",
  },
  pinOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pinEmoji: {
    fontSize: 32,
    marginBottom: 24, // shifts pin tip to map center
  },

  // ── Current location button ──
  currentLocBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  currentLocEmoji: {
    fontSize: 20,
    color: Brand.main,
    fontWeight: "700",
  },

  // ── Address card ──
  addressCard: {
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 0,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 12,
  },
  addressIconWrapper: {
    paddingTop: 2,
  },
  addressIcon: {
    fontSize: 18,
  },
  addressInputBlock: {
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  addressInput: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    padding: 0,
  },
  addressLoadingIndicator: {
    paddingTop: 4,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    marginHorizontal: -14,
  },

  // ── Dev diagnostic banner ──
  debugBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff3e0",
    borderWidth: 1,
    borderColor: "#ffb74d",
  },
  debugBannerText: {
    fontSize: 12,
    color: "#8a5300",
    fontWeight: "600",
  },

  // ── Autocomplete suggestions ──
  suggestionsContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  suggestionIcon: { fontSize: 14 },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 18 },
  suggestionSeparator: { borderBottomWidth: 1 },

  // ── Form sections ──
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  // Plain text input (House No., Building, Landmark)
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  // Icon + text input row (Contact fields)
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  inputRowText: {
    flex: 1,
    fontSize: 15,
  },

  // ── Error ──
  errorText: {
    fontSize: 13,
    textAlign: "center",
    marginHorizontal: 16,
    marginTop: 8,
  },

  // ── Save button ──
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Brand.main,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
});
