import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Height reserved for the persistent "active delivery" banner shown above
 * the tab bar for volunteers with an in-progress delivery
 * (see app/(tabs)/_layout.tsx).
 */
export const DELIVERY_BANNER_H = 68;

/**
 * Height of just the tappable icon + label row, NOT including the safe-area
 * inset. This is a fixed visual size — the variable part is insets.bottom,
 * which differs by device: 3-button nav bar (~48dp), gesture nav (~24dp),
 * or none at all.
 */
const TAB_ROW_H = Platform.OS === "ios" ? 50 : 56;

/**
 * Centralised tab bar sizing so app-tabs.tsx (the actual navigator) and
 * (tabs)/_layout.tsx (the delivery banner overlay) always agree on
 * measurements, instead of two separately hardcoded constants that can
 * silently drift out of sync.
 *
 * insets.bottom is the live measurement of the system nav bar / gesture
 * area for the current device — this is what was missing before, causing
 * the nav bar to overlap the tab labels on devices using 3-button
 * navigation.
 */
export function useTabBarMetrics(isVolunteer: boolean) {
  const insets = useSafeAreaInsets();
  const bannerH = isVolunteer ? DELIVERY_BANNER_H : 0;

  return {
    /** Total height for tabBarStyle.height */
    tabBarHeight: TAB_ROW_H + insets.bottom + bannerH,
    /** tabBarStyle.paddingBottom — clears the system nav bar */
    paddingBottom: insets.bottom,
    /** tabBarStyle.paddingTop — reserves space above the icon row for the banner */
    paddingTop: bannerH,
    /** Distance from the screen bottom to where the icon row begins — used
     *  by (tabs)/_layout.tsx to position the banner directly above it */
    tabRowBottomOffset: insets.bottom + TAB_ROW_H,
  };
}
