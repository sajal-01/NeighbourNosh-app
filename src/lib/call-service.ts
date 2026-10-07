import { Linking } from "react-native";

export const callService = {
  async call(phoneNumber: string) {
    Linking.openURL(`tel:${phoneNumber}`).catch((err) =>
      console.error("An error occurred", err),
    );
  },
};
