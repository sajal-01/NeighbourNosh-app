import { Tabs, useRouter, useSegments } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColorScheme } from "react-native";
import { useEffect, useRef } from "react";
import { Colors, Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { useTabBarMetrics } from "@/hooks/use-tab-bar-metrics";
import { useTranslation } from "react-i18next";

// ── Main Tab Component ────────────────────────────────────────────────────────

const RECEIVER_SCREENS = [
  "receiver-home",
  "receiver-claims",
  "receiver-reports",
];
const VOLUNTEER_SCREENS = ["volunteer-home", "volunteer-rewards"];

interface AppTabsProps {
  /**
   * Whether the volunteer currently has an active delivery task, i.e.
   * whether (tabs)/_layout.tsx is rendering the ActiveDeliveryBanner.
   * Only in that case should the tab bar reserve DELIVERY_BANNER_H of
   * extra space — otherwise every volunteer screen (even with no active
   * delivery) ends up with a tall tab bar and a big empty gap above it.
   */
  hasActiveDelivery?: boolean;
}

export default function AppTabs({ hasActiveDelivery = false }: AppTabsProps) {
  const scheme = useColorScheme() ?? "light";
  const theme = Colors[scheme === "dark" ? "dark" : "light"];
  const { role, roleLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const prevRoleRef = useRef<string | null>(null);

  const isReceiver = role === "receiver";
  const isVolunteer = role === "volunteer";
  // Donor is the default role — anything that isn't receiver or volunteer
  const isDonor = !isReceiver && !isVolunteer;

  // Redirect to the correct home whenever role changes (including initial load).
  // The extra seg check covers stale navigation history — if the user navigates
  // back to a screen that doesn't belong to their current role, they get
  // immediately redirected.
  useEffect(() => {
    if (roleLoading || !role) return;

    const seg = segments as string[];
    const currentScreen = seg[seg.length - 1] ?? "";
    const DONOR_SCREENS = ["index", "donate", "track", "rewards"];

    // Determine if the current screen belongs to a different role
    const onReceiverScreen = RECEIVER_SCREENS.includes(currentScreen);
    const onVolunteerScreen = VOLUNTEER_SCREENS.includes(currentScreen);
    const onDonorScreen = DONOR_SCREENS.includes(currentScreen);

    const wrongScreen =
      (role === "donor" && (onReceiverScreen || onVolunteerScreen)) ||
      (role === "receiver" && (onDonorScreen || onVolunteerScreen)) ||
      (role === "volunteer" && (onDonorScreen || onReceiverScreen));

    // Only redirect if the screen is definitely wrong, or this is the first
    // render after a role change.
    const roleChanged = prevRoleRef.current !== role;
    prevRoleRef.current = role;

    if (!roleChanged && !wrongScreen) return;

    if (role === "receiver" && !onReceiverScreen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)/receiver-home" as any);
    } else if (role === "volunteer" && !onVolunteerScreen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)/volunteer-home" as any);
    } else if (role === "donor" && (onReceiverScreen || onVolunteerScreen)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)" as any);
    }
  }, [role, roleLoading, segments]);

  // Tab bar sizing accounts for the live safe-area inset (Android edge-to-edge
  // nav bar / iOS home indicator) so the tab labels never sit under — or get
  // covered by — the system navigation bar. The banner reservation (extra
  // height + paddingTop) is only added when a delivery is actually active —
  // being a volunteer isn't enough on its own, or every volunteer screen
  // would get a tall tab bar with an empty gap above it even with no
  // active delivery.
  const { t } = useTranslation();
  const reserveBannerSpace = isVolunteer && hasActiveDelivery;
  const { tabBarHeight, paddingBottom, paddingTop } =
    useTabBarMetrics(reserveBannerSpace);

  const tabBarStyle = {
    backgroundColor: theme.background,
    borderTopColor: theme.backgroundElement,
    borderTopWidth: 1,
    height: tabBarHeight,
    paddingBottom,
    paddingTop,
  } as const;

  const tabBarLabelStyle = {
    fontSize: 10,
    fontWeight: "600" as const,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.main,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle,
        tabBarLabelStyle,
      }}
      // The delivery banner for volunteers is rendered as an absolute overlay
      // in (tabs)/_layout.tsx — no custom tabBar prop needed here.
    >
      {/* ── Donor tabs (hidden for receiver / volunteer) ───────────────────── */}

      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          href: isDonor ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home-sharp" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="donate"
        options={{
          title: t("nav.donate"),
          href: isDonor ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "add-circle-sharp" : "add-circle-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="track"
        options={{
          title: t("nav.track"),
          href: isDonor ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "location-sharp" : "location-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="rewards"
        options={{
          title: t("nav.reward"),
          href: isDonor ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "star-sharp" : "star-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* ── Receiver-only tabs ─────────────────────────────────────────────── */}

      <Tabs.Screen
        name="receiver-home"
        options={{
          title: t("nav.home"),
          href: isReceiver ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home-sharp" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="receiver-request"
        options={{
          title: "Request",
          href: null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "add-circle-sharp" : "add-circle-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="receiver-claims"
        options={{
          title: t("nav.claims"),
          href: isReceiver ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "document-text-sharp" : "document-text-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="receiver-reports"
        options={{
          title: t("nav.reports"),
          href: isReceiver ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "bar-chart" : "bar-chart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* ── Volunteer-only tabs ────────────────────────────────────────────── */}

      <Tabs.Screen
        name="volunteer-home"
        options={{
          title: t("nav.home"),
          href: isVolunteer ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home-sharp" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="volunteer-rewards"
        options={{
          title: t("nav.rewards"),
          href: isVolunteer ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "star-sharp" : "star-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* ── Shared across all roles ────────────────────────────────────────── */}

      <Tabs.Screen
        name="profile"
        options={{
          title: t("nav.profile"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person-sharp" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
