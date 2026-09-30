import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { color } from "../../src/ui/theme";

// The receipt flow: full screens without the tab bar, only for a
// signed-in person.
export default function FlowLayout() {
  const auth = useAuth();
  if (auth.status === "loading") {
    return <View style={{ flex: 1, backgroundColor: color.background }} />;
  }
  if (auth.status === "signedOut") return <Redirect href="/giris" />;
  return <Slot />;
}
