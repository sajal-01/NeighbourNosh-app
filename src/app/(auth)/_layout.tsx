import { Stack } from 'expo-router';

/**
 * Auth group layout — renders a header-less Stack so login and signup
 * can navigate between each other (and swipe-back works on iOS).
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
