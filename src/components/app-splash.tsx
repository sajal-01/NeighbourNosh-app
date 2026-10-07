import { View, Text, Image, ActivityIndicator } from "react-native";

export default function AppSplash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#50b070",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 28,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("@/assets/splash-icon.png")}
          style={{
            width: "100%",
            height: "100%",
          }}
          resizeMode="cover"
        />
      </View>

      <Text
        style={{
          marginTop: 20,
          fontSize: 28,
          fontWeight: "700",
          color: "#ffffff",
          letterSpacing: 0.4,
        }}
      >
        Neighbour Nosh
      </Text>

      <ActivityIndicator
        size="large"
        color="#ffffff"
        style={{
          marginTop: 28,
        }}
      />
    </View>
  );
}
