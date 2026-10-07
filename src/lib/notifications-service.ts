import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getFirestore, doc, updateDoc } from "@react-native-firebase/firestore";

const db = getFirestore();

/**
 * Configure how expo-notifications presents notifications, and ensure
 * delivery works in every app state — foreground, background, and killed —
 * without @react-native-firebase/messaging.
 *
 * On Android, expo-notifications registers its OWN native Firebase Cloud
 * Messaging listener service during prebuild. That native service handles
 * background/killed delivery automatically:
 *   - Foreground: the incoming push is routed to the handler below, which
 *     decides how to present it (banner/sound/badge).
 *   - Background / killed: Android's system tray displays the notification
 *     automatically — driven entirely natively, no JS code required.
 *
 * Call once at module level before the navigator mounts.
 */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Optional: react in-app when a notification arrives while the app is in the
 * foreground (e.g. to refresh a badge count or in-app banner). This does NOT
 * need to manually schedule a local notification — the handler above already
 * displays it. This is purely for side-effects you want to run alongside.
 *
 * Call inside a useEffect in the root layout; return the unsubscribe for
 * cleanup.
 */
export function setupForegroundNotificationListener(
  onReceive?: (notification: Notifications.Notification) => void,
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      onReceive?.(notification);
    },
  );
  return () => subscription.remove();
}

/**
 * Requests notification permissions and returns the Expo Push Token string,
 * or null if the device is a simulator or the user denies permission.
 */
export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  if (!Device.isDevice) {
    console.warn("Push notifications only work on physical devices.");
    return null;
  }

  // Android 8+ requires a notification channel before showing notifications.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#50b070",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Push notification permission was not granted.");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.error(
      "Missing EAS project ID. Ensure extra.eas.projectId is set in app.json.",
    );
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

/**
 * Persists the Expo Push Token to the user's Firestore `users/{uid}` document.
 */
export async function savePushTokenToFirestore(
  uid: string,
  token: string,
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    expoPushToken: token,
  });
}
