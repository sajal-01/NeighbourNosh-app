import { GoogleSignin } from "@react-native-google-signin/google-signin";

/**
 * Module-level side-effect: configure Google Sign-In once when this module
 * is first imported.
 *
 * webClientId = the OAuth 2.0 client with "client_type": 3 from google-services.json.
 *
 * HOW TO GET THIS VALUE:
 *   1. Firebase Console → Authentication → Sign-in method → enable Google
 *   2. Project Settings → Your apps → Android app → add debug SHA-1 fingerprint
 *   3. Download the updated google-services.json
 *   4. Copy the client_id where client_type === 3 from the oauth_client array
 *
 * @react-native-firebase/app auto-initialises from google-services.json so
 * no explicit `initializeApp()` call is required here.
 */
GoogleSignin.configure({
  // Replace this with the client_id (client_type: 3) from your
  // updated google-services.json after registering SHA-1 in Firebase.
  webClientId:
    "316951931490-nnlgdilsd7algus45vjc4vsdgf3b1u8j.apps.googleusercontent.com",
  offlineAccess: true,
});
