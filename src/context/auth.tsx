import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import type { FirebaseAuthTypes } from "@react-native-firebase/auth";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { signOut as firebaseSignOut } from "@/lib/auth-service";
import {
  registerForPushNotificationsAsync,
  savePushTokenToFirestore,
} from "@/lib/notifications-service";

const auth = getAuth();
const db = getFirestore();

export type UserRole = "donor" | "receiver" | "volunteer";

type AuthContextType = {
  /** The currently authenticated Firebase user, or null when signed out. */
  user: FirebaseAuthTypes.User | null;
  /** Convenience boolean — true while a user session is active. */
  isLoggedIn: boolean;
  /**
   * True until the first Firebase auth-state event fires.
   * RouteGuard should wait for this to settle before redirecting.
   */
  loading: boolean;
  /**
   * The user's role from the Firestore `users/{uid}` document.
   * Updated in real-time via an onSnapshot listener — so role changes
   * made in EditProfile are reflected immediately without signing out.
   */
  role: UserRole | null;
  /** True while the Firestore role document is being fetched for the first time. */
  roleLoading: boolean;
  /**
   * True for new Google Sign-In users who haven't completed their profile yet.
   * RouteGuard redirects them to /complete-profile until this is false.
   */
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  loading: true,
  role: null,
  roleLoading: false,
  needsOnboarding: false,
  signOut: async () => {},
});

/**
 * Subscribes to Firebase Auth state changes AND the user's Firestore document
 * (for real-time role updates) and exposes both to all descendants via context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Track the active Firestore unsubscribe so we can clean it up when uid changes
  const roleUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Tear down any existing role listener
      if (roleUnsubRef.current) {
        roleUnsubRef.current();
        roleUnsubRef.current = null;
      }

      if (!firebaseUser) {
        setRole(null);
        setNeedsOnboarding(false);
        setRoleLoading(false);
        return;
      }

      // Register for push notifications and persist the token — non-blocking.
      registerForPushNotificationsAsync()
        .then((token) => {
          if (token) savePushTokenToFirestore(firebaseUser.uid, token);
        })
        .catch((err) => console.warn("Push token registration failed:", err));

      // Open a live Firestore listener for the user doc so role changes
      // made in EditProfile propagate here instantly.
      setRoleLoading(true);
      const unsubRole = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (snap) => {
          if (snap.exists()) {
            setRole((snap.data()?.role as UserRole) ?? "donor");
            setNeedsOnboarding(snap.data()?.needsOnboarding === true);
          } else {
            setRole("donor");
            setNeedsOnboarding(false);
          }
          setRoleLoading(false);
        },
        () => {
          // Fail silently — fall back to donor
          setRole("donor");
          setNeedsOnboarding(false);
          setRoleLoading(false);
        },
      );
      roleUnsubRef.current = unsubRole;
    });

    return () => {
      unsubscribeAuth();
      roleUnsubRef.current?.();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: user !== null,
        loading,
        role,
        roleLoading,
        needsOnboarding,
        signOut: firebaseSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
