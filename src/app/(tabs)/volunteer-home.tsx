/**
 * volunteer-home.tsx
 *
 * Volunteer home screen — availability toggle + live delivery task feed.
 *
 * Key behaviours:
 *  - Availability toggle reads/writes `users/{uid}` in Firestore.
 *  - Turning ON requests foreground location and stores a GeoPoint + geohash.
 *  - Uses `listenToDeliveryTasks` (delivery_tasks collection, status="available").
 *  - Each card shows real driving distance + ETA (pickup → drop-off) via
 *    Google's Distance Matrix API, once a receiver has claimed the donation.
 *  - Accept → Alert confirm → acceptDeliveryTask → navigate to volunteer-delivery.
 *  - Fire-and-forget pickup-assigned notification after each accept.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import {
  acceptDeliveryTask,
  encodeGeohash,
  listenToDeliveryTasks,
  timeAgo,
  type DeliveryTaskDoc,
} from "@/lib/donation-service";
import { triggerPickupAssigned } from "@/lib/notifications-api";
import { useTranslation } from "react-i18next";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  GeoPoint,
  query,
  serverTimestamp,
  updateDoc,
  onSnapshot,
  where,
} from "@react-native-firebase/firestore";

const db = getFirestore();

// Distance Matrix API key — set EXPO_PUBLIC_GOOGLE_MAPS in your .env.
// (Same key as your Directions/Maps SDK key, with the Distance Matrix API enabled.)
const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS ?? "";

// ── Helpers ────────────────────────────────────────────────────────────────────

function dietaryEmoji(type: string): string {
  if (type === "NonVeg") return "🍗";
  if (type === "Both") return "🍱";
  return "🥗";
}

function dietaryThumbColor(type: string): string {
  if (type === "NonVeg") return "#fce4ec";
  if (type === "Both") return "#fef9e7";
  return "#e8f5e9";
}

// Real driving distance + ETA between the pickup and drop-off addresses, via
// Google's Distance Matrix API (it geocodes the address strings itself, so no
// lat/lng is needed for the drop-off side).
interface RouteInfo {
  distanceKm: number;
  distanceText: string;
  durationText: string;
}

async function fetchRouteInfo(
  originAddress: string,
  destinationAddress: string,
): Promise<RouteInfo | null> {
  if (!GOOGLE_MAPS_APIKEY || !originAddress || !destinationAddress) {
    return null;
  }
  try {
    const url =
      "https://maps.googleapis.com/maps/api/distancematrix/json" +
      `?origins=${encodeURIComponent(originAddress)}` +
      `&destinations=${encodeURIComponent(destinationAddress)}` +
      `&units=metric&key=${GOOGLE_MAPS_APIKEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;
    return {
      distanceKm: element.distance.value / 1000,
      distanceText: element.distance.text,
      durationText: element.duration.text,
    };
  } catch {
    return null;
  }
}

// ── DeliveryCard ───────────────────────────────────────────────────────────────

interface DeliveryCardProps {
  task: DeliveryTaskDoc;
  volunteerUid: string;
  isAvailable: boolean;
  onAccepted: (donationId: string, taskId: string) => void;
}

function DeliveryCard({
  task,
  volunteerUid,
  isAvailable,
  onAccepted,
}: DeliveryCardProps) {
  const { t } = useTranslation();
  const [accepting, setAccepting] = useState(false);

  // ── Route distance + ETA between pickup and drop-off (Google Distance Matrix) ──
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    if (!task.dropOffAddress) {
      setRouteInfo(null);
      setRouteLoading(false);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    fetchRouteInfo(task.pickupAddress, task.dropOffAddress)
      .then((info) => {
        if (!cancelled) setRouteInfo(info);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.pickupAddress, task.dropOffAddress]);

  const handleAccept = () => {
    if (!isAvailable) {
      Alert.alert(
        t("volunteer.availabilityRequired"),
        t("volunteer.availabilityRequiredMsg"),
      );
      return;
    }
    Alert.alert(
      t("volunteer.acceptAlert"),
      t("volunteer.acceptAlertMsg", {
        food: task.foodDescription,
        qty: task.quantity,
        address: task.pickupAddress,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("volunteer.accept"),
          onPress: async () => {
            setAccepting(true);
            try {
              await acceptDeliveryTask(task.id, task.donationId, volunteerUid);
              // Fire-and-forget: notify donor + receiver that a volunteer is on the way.
              void triggerPickupAssigned(
                [task.donorId, task.receiverId],
                "Volunteer On The Way! 🛵",
                `A volunteer has accepted the delivery of ${task.foodDescription}.`,
              );
              onAccepted(task.donationId, task.id);
            } catch (err: unknown) {
              const msg =
                err instanceof Error ? err.message : "Something went wrong.";
              const isAlreadyClaimed =
                msg.toLowerCase().includes("already") ||
                msg.toLowerCase().includes("claimed") ||
                msg.toLowerCase().includes("assigned");
              Alert.alert(
                isAlreadyClaimed
                  ? t("volunteer.alreadyClaimed")
                  : t("common.error"),
                isAlreadyClaimed ? t("volunteer.alreadyClaimedMsg") : msg,
              );
            } finally {
              setAccepting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[s.card, CARD_SHADOW]}>
      {/* ── Top row: thumbnail + name block ── */}
      <View style={s.cardTop}>
        <View
          style={[
            s.foodThumb,
            { backgroundColor: dietaryThumbColor(task.dietaryType) },
          ]}
        >
          <Text style={s.foodEmoji}>{dietaryEmoji(task.dietaryType)}</Text>
        </View>

        <View style={s.cardNameBlock}>
          <View style={s.cardNameRow}>
            <Text style={s.cardFoodName} numberOfLines={2}>
              {task.foodDescription} – {task.quantity} Servings
            </Text>
            <View style={s.vegChip}>
              <Text style={s.vegChipText}>{task.dietaryType}</Text>
            </View>
          </View>
          <Text style={s.cardPosted}>
            {t("volunteer.postedTime", { time: timeAgo(task.createdAt) })}
          </Text>
        </View>
      </View>

      {/* ── Pickup / Drop-off addresses ── */}
      <View style={s.locationRow}>
        <View style={s.locationCol}>
          <Text style={s.locationLabelPickup}>{t("volunteer.pickup")}</Text>
          <View style={s.locationDetail}>
            <Text style={s.locationPin}>📍</Text>
            <View style={s.locationText}>
              <Text style={s.locationName} numberOfLines={2}>
                {task.pickupAddress}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.locationDivider} />

        <View style={s.locationCol}>
          <Text style={s.locationLabelDropoff}>{t("volunteer.dropoff")}</Text>
          {task.dropOffAddress ? (
            <View style={s.locationDetail}>
              <Text style={s.locationPin}>📍</Text>
              <View style={s.locationText}>
                <Text style={s.locationName} numberOfLines={2}>
                  {task.dropOffAddress}
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.awaitingPill}>
              <Text style={s.awaitingPillText}>
                {t("volunteer.awaitingReceiver")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Distance + ETA row (pickup → drop-off, via Google Distance Matrix) ── */}
      <View style={s.distanceRow}>
        {!task.dropOffAddress ? (
          <Text style={s.distanceText}>
            🚗 {t("volunteer.routeAvailableOnceClaimed", "Route distance available once claimed")}
          </Text>
        ) : routeLoading ? (
          <Text style={s.distanceText}>
            🚗 {t("volunteer.calculatingRoute", "Calculating route…")}
          </Text>
        ) : routeInfo ? (
          <>
            <Text style={s.distanceText}>🚗 {routeInfo.distanceText}</Text>
            <Text style={s.distanceDot}>·</Text>
            <Text style={s.distanceText}>🕐 {routeInfo.durationText}</Text>
          </>
        ) : (
          <Text style={s.distanceText}>🚗 — km</Text>
        )}
      </View>

      {/* ── Accept button ── */}
      <TouchableOpacity
        style={[s.acceptBtn, accepting && s.acceptBtnDisabled]}
        activeOpacity={0.82}
        onPress={handleAccept}
        disabled={accepting}
      >
        {accepting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={s.acceptBtnText}>{t("volunteer.acceptDelivery")}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function VolunteerHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [isAvailable, setIsAvailable] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [lastKnownLocation, setLastKnownLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [tasks, setTasks] = useState<DeliveryTaskDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Volunteer's own delivery stats (totalDeliveries / mealsTransported) ──
  const [volunteerRole, setVolunteerRole] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalDeliveries: 0, mealsTransported: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Initialise availability from Firestore on mount ─────────────────────
  useEffect(() => {
    if (!user?.uid) {
      setProfileLoaded(true);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfileName(snap.data()?.name ?? "");
          const data = snap.data();
          setIsAvailable(data?.isAvailable === true);
          setVolunteerRole(data?.role ?? null);
          const loc = data?.lastKnownLocation;
          if (loc) {
            setLastKnownLocation({
              latitude: loc.latitude,
              longitude: loc.longitude,
            });
          }
        }
        setProfileLoaded(true);
      },
      () => {
        setProfileLoaded(false);
      },
    );
    return unsub;
  }, [user?.uid]);

  // ── Live totalDeliveries / mealsTransported for this volunteer ──────────
  // Only counts donation documents where:
  //   - assignedVolunteerId === the logged-in user's uid (users/{uid} doc with role "volunteer")
  //   - deliveryMode === "volunteer"
  //   - status === "delivered"
  // mealsTransported is the sum of the "quantity" field across those documents.
  useEffect(() => {
    if (!user?.uid || volunteerRole !== "volunteer") {
      setStatsLoading(false);
      return;
    }

    const deliveredDonationsQuery = query(
      collection(db, "donations"),
      where("assignedVolunteerId", "==", user.uid),
      where("deliveryMode", "==", "volunteer"),
      where("status", "==", "delivered"),
    );

    const unsub = onSnapshot(
      deliveredDonationsQuery,
      (snap) => {
        let totalDeliveries = 0;
        let mealsTransported = 0;
        snap.forEach((docSnap) => {
          totalDeliveries += 1;
          const qty = docSnap.data()?.quantity;
          if (typeof qty === "number") {
            mealsTransported += qty;
          }
        });
        setStats({ totalDeliveries, mealsTransported });
        setStatsLoading(false);
      },
      () => {
        setStatsLoading(false);
      },
    );
    return unsub;
  }, [user?.uid, volunteerRole]);

  // ── Subscribe to delivery tasks ─────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = listenToDeliveryTasks((incoming) => {
      setTasks(incoming);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Toggle availability ─────────────────────────────────────────────────
  const handleToggleAvailability = async () => {
    if (!user?.uid || availabilityLoading) return;
    setAvailabilityLoading(true);
    try {
      const userDocRef = doc(db, "users", user.uid);

      if (!isAvailable) {
        // Turning ON — request location permission and capture position.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("volunteer.locationRequired"),
            t("volunteer.locationRequiredMsg"),
          );
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = pos.coords;
        await updateDoc(userDocRef, {
          isAvailable: true,
          lastKnownLocation: new GeoPoint(latitude, longitude),
          geohash: encodeGeohash(latitude, longitude),
          lastUpdatedAt: serverTimestamp(),
        });
        setLastKnownLocation({ latitude, longitude });
        setIsAvailable(true);
      } else {
        // Turning OFF.
        await updateDoc(userDocRef, { isAvailable: false });
        setIsAvailable(false);
      }
    } catch (err: unknown) {
      Alert.alert(
        t("common.error"),
        err instanceof Error ? err.message : t("volunteer.errorAvailability"),
      );
    } finally {
      setAvailabilityLoading(false);
    }
  };

  // ── Navigate to delivery screen after a successful accept ───────────────
  const handleAccepted = useCallback(
    (donationId: string, taskId: string) => {
      Alert.alert(t("volunteer.acceptedTitle"), t("volunteer.acceptedMsg"), [
        {
          text: t("volunteer.goToDelivery"),
          onPress: () =>
            router.push({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pathname: "/volunteer-delivery" as any,
              params: { donationId, taskId },
            }),
        },
      ]);
    },
    [router],
  );

  // ── Greeting ─────────────────────────────────────────────────────────────

  const greeting = !profileLoaded
    ? t("donor.greeting")
    : (() => {
        const name = profileName?.trim() || user?.displayName?.trim();
        return name
          ? t("donor.greetingNamed", { name: name.split(" ")[0] })
          : t("donor.greeting");
      })();
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Green header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>{greeting}</Text>
          <Text style={s.headerSub}>{t("volunteer.subTitle")}</Text>
        </View>

        {/* Availability toggle pill */}
        <TouchableOpacity
          style={[
            s.availToggle,
            isAvailable ? s.availToggleOn : s.availToggleOff,
          ]}
          activeOpacity={0.78}
          onPress={handleToggleAvailability}
          disabled={availabilityLoading}
        >
          {availabilityLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <View
                style={[s.availDot, isAvailable ? s.availDotOn : s.availDotOff]}
              />
              <Text style={s.availToggleText}>
                {isAvailable
                  ? t("volunteer.available")
                  : t("volunteer.available")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Stats card ──────────────────────────────────────────────────── */}
        <View style={[s.statsCard, CARD_SHADOW]}>
          <View style={s.statCol}>
            <View style={s.statIconCircle}>
              <Text style={s.statIconEmoji}>🛵</Text>
            </View>
            {statsLoading ? (
              <ActivityIndicator size="small" color={Brand.main} />
            ) : (
              <Text style={s.statNumber}>{stats.totalDeliveries}</Text>
            )}
            <Text style={s.statLabel}>{t("volunteer.totalDeliveries")}</Text>
            <Text style={s.statHint}>{t("volunteer.keepGoing")}</Text>
          </View>

          <View style={s.statDivider} />

          <View style={s.statCol}>
            <View style={s.statIconCircle}>
              <Text style={s.statIconEmoji}>🍽️</Text>
            </View>
            {statsLoading ? (
              <ActivityIndicator size="small" color={Brand.main} />
            ) : (
              <Text style={s.statNumber}>{stats.mealsTransported}</Text>
            )}
            <Text style={s.statLabel}>{t("volunteer.mealsTransported")}</Text>
            <Text style={s.statHint}>{t("volunteer.makingImpact")}</Text>
          </View>
        </View>

        {/* ── Section header ──────────────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            {t("volunteer.availableDeliveries")}
          </Text>
          {tasks.length > 0 && (
            <Text style={s.taskCount}>
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {/* ── Delivery task cards ──────────────────────────────────────────── */}
        {loading ? (
          <ActivityIndicator
            size="large"
            color={Brand.main}
            style={s.loadingIndicator}
          />
        ) : tasks.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyStateEmoji}>🛵</Text>
            <Text style={s.emptyStateTitle}>{t("volunteer.noDeliveries")}</Text>
            <Text style={s.emptyStateSubText}>
              {isAvailable
                ? t("volunteer.noDeliveriesAvailable")
                : t("volunteer.goOnline")}
            </Text>
          </View>
        ) : (
          tasks.map((task) => (
            <DeliveryCard
              key={task.id}
              task={task}
              volunteerUid={user?.uid ?? ""}
              isAvailable={isAvailable}
              onAccepted={handleAccepted}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
} as const;

const s = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────────────────
  safe: {
    flex: 1,
    // Green background on the SafeAreaView itself so the status-bar inset
    // area (added by edges=["top"]) is also green.
    backgroundColor: Brand.main,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Brand.main,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerLeft: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.80)",
    marginTop: 3,
  },

  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 2,
  },
  // ── Availability toggle ────────────────────────────────────────────────
  availToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minWidth: 84,
    justifyContent: "center",
    borderWidth: 1.5,
  },
  availToggleOn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.55)",
  },
  availToggleOff: {
    backgroundColor: "rgba(0,0,0,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  availDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  availDotOn: {
    backgroundColor: "#4ade80",
  },
  availDotOff: {
    backgroundColor: "#9ca3af",
  },
  availToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },

  // ── ScrollView ────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Stats card ────────────────────────────────────────────────────────────
  statsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#d4edda",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statIconEmoji: {
    fontSize: 22,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: Brand.main,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a2e1e",
    textAlign: "center",
  },
  statHint: {
    fontSize: 11,
    color: "#888",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    height: 80,
    backgroundColor: "#e4ede7",
    marginHorizontal: 10,
  },

  // ── Section header ────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a2e1e",
  },
  taskCount: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  },

  // ── Delivery task card ────────────────────────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    gap: 12,
  },

  // top row
  cardTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  foodThumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  foodEmoji: {
    fontSize: 32,
  },
  cardNameBlock: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 6,
  },
  cardFoodName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a2e1e",
    flex: 1,
  },
  vegChip: {
    borderWidth: 1.2,
    borderColor: Brand.main,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  vegChipText: {
    fontSize: 11,
    color: Brand.main,
    fontWeight: "600",
  },
  cardPosted: {
    fontSize: 12,
    color: "#888",
  },

  // pickup / dropoff row
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f6faf7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationCol: {
    flex: 1,
    gap: 4,
  },
  locationDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#d4e8da",
    marginHorizontal: 8,
  },
  locationLabelPickup: {
    fontSize: 10,
    fontWeight: "700",
    color: Brand.main,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationLabelDropoff: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3b82f6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationDetail: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 3,
  },
  locationPin: {
    fontSize: 12,
    marginTop: 1,
  },
  locationText: {
    flex: 1,
  },
  locationName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1a2e1e",
  },

  // distance row
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  distanceText: {
    fontSize: 13,
    color: "#666",
  },
  distanceDot: {
    fontSize: 13,
    color: "#bbb",
  },

  // ── Accept button ──────────────────────────────────────────────────────────
  acceptBtn: {
    backgroundColor: Brand.main,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnDisabled: {
    opacity: 0.55,
  },
  acceptBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // ── Awaiting-receiver pill ──────────────────────────────────────────────────
  awaitingPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  awaitingPillText: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
  },

  // ── Loading indicator ──────────────────────────────────────────────────────
  loadingIndicator: {
    marginTop: 48,
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    marginTop: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyStateEmoji: {
    fontSize: 48,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a2e1e",
    textAlign: "center",
  },
  emptyStateSubText: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
});
