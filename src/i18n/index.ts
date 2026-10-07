/**
 * i18n/index.ts
 *
 * Initialises i18next for the app.
 *
 * Language priority on startup (handled by initI18n):
 *   1. AsyncStorage "app_language"  — previously saved preference
 *   2. Device locale (expo-localization)
 *   3. Fallback → English
 *
 * When the user picks a language from the Profile screen, profile.tsx calls
 * i18next.changeLanguage() and saves the code to AsyncStorage directly.
 */

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import kn from "@/locales/kn.json";
import ta from "@/locales/ta.json";
import te from "@/locales/te.json";
import ml from "@/locales/ml.json";

// ── Constants ─────────────────────────────────────────────────────────────────

/** AsyncStorage key used to persist the user's chosen language. */
export const STORAGE_KEY = "app_language";

export const SUPPORTED_LANGUAGES = [
  "en",
  "hi",
  "kn",
  "ta",
  "te",
  "ml",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Map from human-readable names (used in the UI picker) to locale codes */
export const LANGUAGE_NAME_TO_CODE: Record<string, SupportedLanguage> = {
  English: "en",
  Hindi: "hi",
  Kannada: "kn",
  Tamil: "ta",
  Telugu: "te",
  Malayalam: "ml",
};

/** Map from locale code back to display name */
export const LANGUAGE_CODE_TO_NAME: Record<SupportedLanguage, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect the device language and return a supported locale code.
 * Falls back to "en" when the device language is not supported.
 */
export function detectDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const tag = locales[0]?.languageTag ?? "en"; // e.g. "kn-IN", "hi-IN"
  const code = tag.split("-")[0].toLowerCase(); // "kn", "hi", …
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : "en";
}

// ── Synchronous initialisation ────────────────────────────────────────────────
// i18next is initialised synchronously with the device language so the very
// first render never falls back to an empty string. initI18n() will then
// override this with the stored preference before the splash screen hides.

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      kn: { translation: kn },
      ta: { translation: ta },
      te: { translation: te },
      ml: { translation: ml },
    },
    lng: detectDeviceLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: "v4",
  });
}

// ── Async startup loader ──────────────────────────────────────────────────────

/**
 * Call once at app startup (before the splash screen hides).
 *
 * Reads the stored language from AsyncStorage. If a valid language code is
 * found it immediately switches i18next to that language. Otherwise the
 * device-detected language set during synchronous init is kept.
 */
export async function initI18n(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      await i18next.changeLanguage(stored);
    }
    // No stored preference → keep device language already set synchronously
  } catch {
    // AsyncStorage unavailable — silently keep current language
  }
}

export default i18next;
