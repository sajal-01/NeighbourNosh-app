import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "NeighbourNosh",
  description:
    "NeighborNosh utilizes a seamless, location aware flow to ensure food goes from donor to receiver as quickly as possible.",
  slug: "neighbour_nosh",
  owner: "tectune.in",
  version: "2.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "neighbournosh",
  userInterfaceStyle: "light",
  backgroundColor: "#F4FBF7",
  primaryColor: "#50b070",
  platforms: ["android"],
  android: {
    package: `com.${process.env.EXPO_PACKAGE_NAME}`,
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#50b070",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    [
      "expo-localization",
      {
        locales: ["en", "hi", "kn", "ta", "te", "ml"],
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#50b070",
        android: {
          image: "./assets/splash-icon.png",
          imageWidth: 76,
        },
      },
    ],
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_MAP,
      },
    ],
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-google-signin/google-signin",
    "expo-image",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Neighbour Nosh to access your photos to attach images of the food.",
        cameraPermission:
          "Allow Neighbour Nosh to use the camera to photograph food donations.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow Neighbour Nosh to use your location to set the food pickup point.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#50b070",
      },
    ],
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  updates: {
    url: `https://u.expo.dev/${process.env.EXPO_PROJECT_ID}`,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 3000,
  },
  runtimeVersion: {
    policy: "fingerprint",
  },
  extra: {
    router: {},
    eas: {
      projectId: `${process.env.EXPO_PROJECT_ID}`,
    },
  },
});
