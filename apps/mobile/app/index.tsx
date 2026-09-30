import { StyleSheet, Text, View } from "react-native";

// Walking skeleton step 1: an app that boots. Sign-in and the three
// sections arrive in step 4.
export default function Home() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        kefe
      </Text>
      <Text style={styles.body}>Uygulama hazırlanıyor.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 32, fontWeight: "700", color: "#111111" },
  body: { marginTop: 12, fontSize: 20, color: "#333333" },
});
