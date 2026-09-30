import { Redirect, Slot } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { TabBar } from "../../src/ui/TabBar";
import { color } from "../../src/ui/theme";

// The three sections, only for a signed-in person: a signed-out visit to
// any of them lands on sign-in.
export default function AppLayout() {
  const auth = useAuth();
  if (auth.status === "loading") return <View style={styles.page} />;
  if (auth.status === "signedOut") return <Redirect href="/giris" />;
  return (
    <View style={styles.page}>
      <View style={styles.content}>
        <Slot />
      </View>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.background },
  content: { flex: 1 },
});
