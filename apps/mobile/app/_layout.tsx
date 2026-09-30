import { useFonts } from "expo-font";
import atkinson400 from "../assets/fonts/AtkinsonHyperlegibleNext-400.ttf";
import atkinson600 from "../assets/fonts/AtkinsonHyperlegibleNext-600.ttf";
import atkinson700 from "../assets/fonts/AtkinsonHyperlegibleNext-700.ttf";
import atkinson800 from "../assets/fonts/AtkinsonHyperlegibleNext-800.ttf";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth/AuthProvider";
import { supabase } from "../src/supabase";
import { Alert, Screen } from "../src/ui/components";
import { color, fontFamily } from "../src/ui/theme";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fontFamily.regular]: atkinson400,
    [fontFamily.semibold]: atkinson600,
    [fontFamily.bold]: atkinson700,
    [fontFamily.heavy]: atkinson800,
  });

  useEffect(() => {
    // Screen readers and hyphenation read the page as Turkish.
    if (Platform.OS === "web") document.documentElement.lang = "tr";
  }, []);

  // A font that fails to load falls back to the system font rather than
  // keeping the app blank.
  const ready = fontsLoaded || fontError !== null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View style={styles.blank} />
      ) : supabase ? (
        <AuthProvider client={supabase}>
          <Slot />
        </AuthProvider>
      ) : (
        <Screen center>
          <Alert
            tone="danger"
            title="Uygulama açılamadı."
            detail="Uygulamanın ayarları eksik. Lütfen daha sonra tekrar deneyin."
          />
        </Screen>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: color.background },
});
