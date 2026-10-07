/**
 * notifications.tsx
 *
 * Displays the latest 10 in-app notifications for the current user.
 * Reads from the `notifications` Firestore collection, filtered by
 * `recipientId` and sorted newest-first client-side.
 *
 * Accessible from any screen via the bell icon in ScreenHeader.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from "@react-native-firebase/firestore";
import type { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Brand } from "@/constants/theme";
import { useAuth } from "@/context/auth";
import { timeAgo } from "@/lib/donation-service";

const db = getFirestore();

// ── Document type ─────────────────────────────────────────────────────────────

interface NotificationDoc {
  id: string;
  recipientId: string;
  title: string;
  body: string;
  timestamp: FirebaseFirestoreTypes.Timestamp | null;
}

// ── Notification Card ─────────────────────────────────────────────────────────

function NotificationCard({ doc }: { doc: NotificationDoc }) {
  return (
    <View style={c.card}>
      {/* Icon */}
      <View style={c.iconWrap}>
        <Ionicons name="notifications" size={20} color={Brand.main} />
      </View>

      {/* Content */}
      <View style={c.content}>
        <Text style={c.title}>{doc.title}</Text>
        <Text style={c.body}>{doc.body}</Text>
        <Text style={c.time}>{timeAgo(doc.timestamp)}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      limit(10),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationDoc, "id">),
          }))
          .sort(
            (a, b) =>
              (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0),
          );
        setNotifications(docs);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsub;
  }, [user?.uid]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0f2419" />
        </TouchableOpacity>

        <Text style={s.headerTitle}>{t("notifications.screenTitle")}</Text>

        {/* Right spacer keeps title centred */}
        <View style={s.headerRight} />
      </View>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={Brand.main}
            style={{ marginTop: 56 }}
          />
        ) : notifications.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color={Brand.main}
              />
            </View>
            <Text style={s.emptyTitle}>{t("notifications.empty")}</Text>
            <Text style={s.emptySub}>{t("notifications.emptySubtitle")}</Text>
          </View>
        ) : (
          notifications.map((n) => <NotificationCard key={n.id} doc={n} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Card styles ───────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f2419",
    marginBottom: 3,
    lineHeight: 19,
  },
  body: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
    marginBottom: 6,
  },
  time: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "500",
  },
});

// ── Screen styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4FBF7",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#e8f0eb",
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: Brand.main,
  },
  headerRight: {
    width: 30, // mirrors backBtn width to keep title centred
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e8f5ee",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f2419",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
  },
});
