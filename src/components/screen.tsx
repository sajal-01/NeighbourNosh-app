import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export function Screen({ children }: { children: React.ReactNode }) {
  const s = {
    scroll: {
      flex: 1,
      backgroundColor: "#F4FBF7",
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 48,
      gap: 14,
    },
  };

  return (
    <KeyboardAwareScrollView
      style={s.scroll}
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.scrollContent}
      keyboardOpeningTime={0}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
