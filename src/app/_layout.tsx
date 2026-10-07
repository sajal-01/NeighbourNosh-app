import {
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from "expo-router";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/context/auth";
import { setupNotificationHandler } from "@/lib/notifications-service";
import { initI18n } from "@/i18n";
import AppSplash from "@/components/app-splash";

// Keep the splash screen visible until initI18n resolves so the correct
// language is applied before the user sees any text.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore — splash may already be hidden in some environments */
});

// Configures how notifications are presented. expo-notifications handles
// background/killed delivery on Android natively — no Firebase background
// handler registration needed.
setupNotificationHandler();

/**
 * Listens to auth state + current route segment and redirects accordingly:
 *   - Not logged in + not in (auth) group → go to login
 *   - Logged in     + still in (auth) group → go to tabs
 *
 * Must be rendered *inside* AuthProvider so it can call useAuth().
 */
function RouteGuard() {
  const { isLoggedIn, loading, roleLoading, needsOnboarding } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Wait for both Firebase auth AND Firestore user-doc to settle before redirecting.
    if (loading || roleLoading) return;

    // Cast needed until Metro regenerates expo-router typed routes
    const seg = segments as string[];
    const inAuthGroup = seg[0] === "(auth)";
    const onCompleteProfile = seg[0] === "complete-profile";

    if (!isLoggedIn && !inAuthGroup && !onCompleteProfile) {
      // Not signed in — send to login
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(auth)/login" as any);
    } else if (isLoggedIn && needsOnboarding && !onCompleteProfile) {
      // New Google user who hasn't selected a role yet — send to profile completion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/complete-profile" as any);
    } else if (isLoggedIn && !needsOnboarding && inAuthGroup) {
      // Signed in with a complete profile — send to main app
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)" as any);
    }
  }, [isLoggedIn, loading, roleLoading, needsOnboarding, segments]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    // Load stored language preference, then reveal the app.
    initI18n()
      .catch(() => {
        /* fail silently — device language already set synchronously */
      })
      .finally(async () => {
          await SplashScreen.hideAsync();
          setI18nReady(true);
      });
  }, []);

  // Hold render until i18n is ready so no text flickers in the wrong language.
  if (!i18nReady) {
    return <AppSplash />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={DefaultTheme}>
        <AuthProvider>
          {/* Redirect guard (no UI, just side-effects) */}
          <RouteGuard />

          {/* Root navigator: manages transitions between auth and tabs groups */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="track-delivery"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="edit-profile"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="organization-details"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="add-organization"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="saved-locations"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="add-location"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="volunteer-delivery"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="self-pickup"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="notifications"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="verification-documents"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="emergency-request"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="complete-profile"
              options={{ animation: "fade", gestureEnabled: false }}
            />
          </Stack>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
