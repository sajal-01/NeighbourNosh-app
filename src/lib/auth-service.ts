// Firebase Authentication + Firestore helpers — modular API (RN Firebase v22+).
import "@/lib/firebase"; // side-effect: GoogleSignin.configure()

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signOut as fbSignOut,
  GoogleAuthProvider,
  getAdditionalUserInfo,
} from "@react-native-firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  addDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { OTP_WORKER_URL } from "@/constants/worker";

const auth = getAuth();
const db = getFirestore();

// ─── OTP worker config ──────────────────────────────────────────────────────

if (__DEV__ && !OTP_WORKER_URL) {
  console.warn(
    "EXPO_PUBLIC_OTP_WORKER_URL is not set — the password reset OTP flow will fail.",
  );
}

async function callWorker<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${OTP_WORKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string })?.error ??
        "Something went wrong. Please try again.",
    );
  }
  return data as T;
}

// ─── Email / Password ──────────────────────────────────────────────────────

/** Sign in an existing user with email + password and record the login timestamp. */
export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  // Update (or create-merge) the Firestore profile with the latest login time.
  await setDoc(
    doc(db, "users", credential.user.uid),
    { lastLoginAt: serverTimestamp() },
    { merge: true },
  );
  return credential;
}

export interface SignUpProfile {
  name: string;
  mobileNumber: string;
  /** 'donor' | 'receiver' | 'volunteer' */
  role: string;
  /** One of the recognised org types */
  organizationType?: string;
  /** Display name of the organisation */
  organizationName?: string;
  /** Physical address of the organisation */
  organizationAddress?: string;
}

/**
 * Create a new Firebase Auth account and write the initial Firestore
 * `users` document (and optionally an `organizations` document).
 */
export async function createAccountWithEmail(
  email: string,
  password: string,
  profile: SignUpProfile,
) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const { uid } = credential.user;

  // Write the users document
  await setDoc(doc(db, "users", uid), {
    name: profile.name,
    email,
    mobileNumber: profile.mobileNumber,
    role: profile.role.toLowerCase(),
    gpsLocation: null,
    geohash: "",
    rewardPoints: 0,
    verificationStatus: "pending",
    badges: [],
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  // Write the organizations document when org details are provided
  if (profile.organizationType) {
    await addDoc(collection(db, "organizations"), {
      userId: uid,
      organizationName: profile.organizationName ?? "",
      organizationType: profile.organizationType,
      verificationStatus: "pending",
      address: profile.organizationAddress ?? "",
    });
  }

  return credential;
}

// ─── Google OAuth ──────────────────────────────────────────────────────────

/**
 * Sign in (or sign up) via Google.
 * Creates a `users` document in Firestore for first-time Google users.
 */
export async function signInWithGoogle() {
  // Ensure Google Play Services are available on Android
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();

  // v13+ returns { type: 'success' | 'cancelled', data }
  if (result.type !== "success") {
    throw new Error("Google sign-in was cancelled.");
  }

  const { idToken } = result.data;
  if (!idToken) throw new Error("No ID token returned by Google.");

  const googleCredential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, googleCredential);

  const { user } = userCredential;
  const additionalUserInfo = getAdditionalUserInfo(userCredential);

  if (additionalUserInfo?.isNewUser) {
    // Provision Firestore profile for brand-new Google accounts.
    // needsOnboarding: true → RouteGuard will redirect to /complete-profile
    // before allowing access to the main app.
    await setDoc(doc(db, "users", user.uid), {
      name: user.displayName ?? "",
      email: user.email ?? "",
      mobileNumber: "",
      role: "donor",
      gpsLocation: null,
      geohash: "",
      rewardPoints: 0,
      verificationStatus: "pending",
      badges: [],
      needsOnboarding: true,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    // Returning Google user — update last login timestamp
    await setDoc(
      doc(db, "users", user.uid),
      { lastLoginAt: serverTimestamp() },
      { merge: true },
    );
  }

  return userCredential;
}

// ─── Forgot-password OTP flow (via Cloudflare Worker + Resend) ─────────────

/**
 * Asks the OTP worker to verify the account exists, generate a 5-digit OTP,
 * store it (in the worker's KV, not Firestore), and email it via Resend.
 */
export async function sendPasswordResetOtp(email: string): Promise<void> {
  await callWorker<{ ok: true }>("/send-otp", { email });
}

/**
 * Verifies the OTP against the worker's KV record. On success, the worker
 * returns a short-lived signed `resetToken` that authorizes the subsequent
 * password change — it must be carried through to `updatePasswordAfterReset`.
 */
export async function verifyPasswordResetOtp(
  email: string,
  otp: string,
): Promise<string> {
  const data = await callWorker<{ resetToken: string }>("/verify-otp", {
    email,
    otp,
  });
  return data.resetToken;
}

/**
 * Completes the reset: the worker verifies `resetToken` and then actually
 * sets the new password via the Identity Toolkit admin API (using a Firebase
 * service account), rather than falling back to an email link.
 */
export async function updatePasswordAfterReset(
  email: string,
  resetToken: string,
  newPassword: string,
): Promise<void> {
  await callWorker<{ ok: true }>("/reset-password", {
    email,
    resetToken,
    newPassword,
  });
}

// ─── Sign out ──────────────────────────────────────────────────────────────

export async function signOut() {
  // Sign out from Google as well if the user is a Google-linked account
  try {
    const current = GoogleSignin.getCurrentUser();
    if (current) await GoogleSignin.signOut();
  } catch {
    // Google sign-in may not be active; safe to ignore
  }
  return fbSignOut(auth);
}

// ─── Error messages ────────────────────────────────────────────────────────

/** Converts a Firebase Auth or Google Sign-In error into a human-readable message. */
export function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string | number }).code;

    // ── Google Sign-In status codes ────────────────────────────────────
    if (String(code) === "10" || String(code) === "DEVELOPER_ERROR") {
      return (
        "Google Sign-In is not set up for this device.\n" +
        "Action needed: register your debug SHA-1 in the Firebase Console " +
        "and re-download google-services.json."
      );
    }
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return "Google Sign-In was cancelled.";
    }
    if (code === statusCodes.IN_PROGRESS) {
      return "A sign-in is already in progress. Please wait.";
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return "Google Play Services is not available on this device.";
    }

    // ── Firebase Auth error codes ──────────────────────────────────────
    switch (String(code)) {
      case "auth/invalid-email":
        return "Invalid email address.";
      case "auth/user-not-found":
      case "auth/invalid-credential":
        return "No account found with this email or password.";
      case "auth/wrong-password":
        return "Incorrect password.";
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Network error. Check your connection.";
      default:
        break;
    }
  }
  if (error instanceof Error) return error.message;
  return "An error occurred. Please try again.";
}
