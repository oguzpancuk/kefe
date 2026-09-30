import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { color } from "../../src/ui/theme";

// Sign-in and sign-up: only for people who are signed out.
export default function AuthLayout() {
  const auth = useAuth();
  if (auth.status === "loading") {
    return <View style={{ flex: 1, backgroundColor: color.background }} />;
  }
  if (auth.status === "signedIn") return <Redirect href="/" />;
  return <Slot />;
}
