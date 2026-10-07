/**
 * ScreenHeader — the standard white top-bar used by all non-home tab screens.
 *
 * Structure:
 *   [left flex-1 — empty space]  [centered title]  [right flex-1 — bell icon]
 *
 * Usage:
 *   <ScreenHeader title="Donate Food" badgeCount={2} />
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Brand } from "@/constants/theme";

interface ScreenHeaderProps {
  title: string;
  /** Optional red badge on the bell icon. Omit or pass 0 to hide. */
  badgeCount?: number;
  /** Defaults to navigating to "/notifications". */
  onBellPress?: () => void;
}

export default function ScreenHeader({
  title,
  badgeCount,
  onBellPress,
}: ScreenHeaderProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const showBadge = !!badgeCount && badgeCount > 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBellPress =
    onBellPress ?? (() => router.push("/notifications" as any));

  return (
    <View style={h.bar}>
      <View style={h.side}>
        {/*<TouchableOpacity
          style={h.profileWrap}
          onPress={handleProfilePress}
          accessibilityLabel="Profile"
          activeOpacity={0.7}
        >
          <Ionicons name="person-circle-outline" size={24} color="#0f2419" />
        </TouchableOpacity>*/}
      </View>

      <Text style={h.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[h.side, h.sideRight]}>
        <TouchableOpacity
          style={h.bellWrap}
          onPress={handleBellPress}
          accessibilityLabel={t("notifications.screenTitle")}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={24} color="#0f2419" />
          {showBadge && (
            <View style={h.badge}>
              <Text style={h.badgeTxt}>
                {badgeCount! > 9 ? "9+" : badgeCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const h = StyleSheet.create({
  bar: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
  },
  side: {
    flex: 1,
  },
  sideRight: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Brand.main,
    textAlign: "center",
  },
  profileWrap: {
    padding: 4,
    alignSelf: "flex-start",
  },
  bellWrap: {
    padding: 4,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#e53935",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    paddingHorizontal: 2,
  },
  badgeTxt: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});
