import AppTabs from "@/components/app-tabs";
import { useAuth } from "@/context/auth";
import { Brand } from "@/constants/theme";
import { haversineKm, type DeliveryTaskDoc } from "@/lib/donation-service";
import {
  subscribeToDeliveryLocation,
  type ActiveDeliveryLocation,
} from "@/lib/delivery-service";
import {
  useTabBarMetrics,
  DELIVERY_BANNER_H,
} from "@/hooks/use-tab-bar-metrics";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from "@react-native-firebase/firestore";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const db = getFirestore();

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Delivery task statuses that count as "actively in progress".
 * "assigned"  — volunteer accepted, heading to pickup.
 * "in_transit" — food picked up, heading to drop-off.
 * (We filter client-side so no composite Firestore index is needed.)
 */
const ACTIVE_STATUSES = new Set(["assigned", "in_transit", "picked_up"]);

// ── Active Delivery Banner ─────────────────────────────────────────────────────
//
// Shown between screen content and the tab bar while a volunteer has an active
// delivery. Reads live data from the delivery_tasks Firestore document and the
// RTDB active_deliveries entry. "View Live Map" reopens volunteer-delivery.tsx
// with the correct donationId + taskId.

interface BannerProps {
  task: DeliveryTaskDoc;
  agentLocation: ActiveDeliveryLocation | null;
  onPress: () => void;
}

function ActiveDeliveryBanner({ task, agentLocation, onPress }: BannerProps) {
  const isStageB = task.status === "in_transit" || task.status === "picked_up";

  // ── Derive display strings ────────────────────────────────────────────────

  const titleText = isStageB
    ? `Delivering · ${task.foodDescription}`
    : `Picking Up · ${task.foodDescription}`;

  const subText = isStageB ? "En Route to Drop-off" : "En Route to Pickup";

  // Distance from volunteer's live position to current target
  let metaText = "🟢 Tracking active";
  if (agentLocation) {
    const targetLat = isStageB
      ? (task.dropOffLocation?.latitude ?? task.pickupLocation.latitude)
      : task.pickupLocation.latitude;
    const targetLng = isStageB
      ? (task.dropOffLocation?.longitude ?? task.pickupLocation.longitude)
      : task.pickupLocation.longitude;

    const dist = haversineKm(
      agentLocation.latitude,
      agentLocation.longitude,
      targetLat,
      targetLng,
    );
    metaText = `📍 ${dist.toFixed(1)} km remaining`;
  }

  return (
    <TouchableOpacity
      style={adb.bar}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="Active delivery — tap to view live map"
    >
      {/* Scooter icon circle */}
      <View style={adb.iconWrap}>
        <Text style={adb.icon}>{isStageB ? "🚴" : "🛵"}</Text>
      </View>

      {/* Delivery meta */}
      <View style={adb.info}>
        <View style={adb.titleRow}>
          <Text style={adb.title} numberOfLines={1}>
            {titleText}
          </Text>
          <View style={adb.liveDot} />
        </View>
        <Text style={adb.sub} numberOfLines={1}>
          {subText}
        </Text>
        {/*<Text style={adb.meta}>{metaText}</Text>*/}
      </View>

      {/* CTA button */}
      <View style={adb.viewBtn}>
        <Text style={adb.viewBtnText}>View Live Map</Text>
        <Ionicons name="chevron-forward" size={13} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

const adb = StyleSheet.create({
  bar: {
    height: DELIVERY_BANNER_H,
    backgroundColor: Brand.main,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  icon: { fontSize: 22 },
  info: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  title: { fontSize: 13, fontWeight: "700", color: "#fff", flexShrink: 1 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
    flexShrink: 0,
  },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
  },
  viewBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
});

// ── Tabs Group Layout ─────────────────────────────────────────────────────────

/**
 * Tabs group layout.
 *
 * For volunteer users an active-delivery banner is absolutely positioned
 * directly above the tab bar's icon row, using the shared useTabBarMetrics
 * hook (also used by app-tabs.tsx) so the two stay in sync automatically —
 * including the device's actual safe-area inset, which varies between
 * 3-button nav, gesture nav, etc.
 *
 * The banner is only shown when the volunteer has an active delivery task
 * (status: "assigned" | "in_transit"). It displays live data and provides a
 * one-tap route back to the delivery screen when the screen is closed.
 */
export default function TabsLayout() {
  const { role, user } = useAuth();
  const router = useRouter();
  const isVolunteer = role === "volunteer";

  const { tabRowBottomOffset } = useTabBarMetrics(isVolunteer);

  // ── Active delivery task ─────────────────────────────────────────────────

  const [activeTask, setActiveTask] = useState<DeliveryTaskDoc | null>(null);
  const [agentLocation, setAgentLocation] =
    useState<ActiveDeliveryLocation | null>(null);

  // Subscribe to delivery_tasks assigned to this volunteer.
  // We query on assignedVolunteerId only (single-field equality → no composite
  // index required) and filter on status client-side.
  useEffect(() => {
    if (!isVolunteer || !user?.uid) {
      setActiveTask(null);
      return;
    }

    const q = query(
      collection(db, "delivery_tasks"),
      where("assignedVolunteerId", "==", user.uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        // Pick the first document whose status is "active"
        const activeDocs = snap.docs.filter((d) =>
          ACTIVE_STATUSES.has(d.data().status as string),
        );

        if (activeDocs.length > 0) {
          setActiveTask({
            id: activeDocs[0].id,
            ...(activeDocs[0].data() as Omit<DeliveryTaskDoc, "id">),
          });
        } else {
          setActiveTask(null);
        }
      },
      () => setActiveTask(null),
    );

    return unsub;
  }, [isVolunteer, user?.uid]);

  // Subscribe to the volunteer's live RTDB location for distance calculation.
  useEffect(() => {
    if (!activeTask?.donationId) {
      setAgentLocation(null);
      return;
    }
    const unsub = subscribeToDeliveryLocation(
      activeTask.donationId,
      setAgentLocation,
    );
    return unsub;
  }, [activeTask?.donationId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <AppTabs hasActiveDelivery={isVolunteer && !!activeTask} />

      {/* Banner is only rendered when there is an active task */}
      {isVolunteer && activeTask && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            bottom: tabRowBottomOffset,
            left: 0,
            right: 0,
            height: DELIVERY_BANNER_H,
          }}
        >
          <ActiveDeliveryBanner
            task={activeTask}
            agentLocation={agentLocation}
            onPress={() =>
              router.push(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                `/volunteer-delivery?donationId=${activeTask.donationId}&taskId=${activeTask.id}` as any,
              )
            }
          />
        </View>
      )}
    </View>
  );
}
