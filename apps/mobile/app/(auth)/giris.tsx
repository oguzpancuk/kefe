import { router } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import wordmark from "../../assets/images/wordmark.png";
import { signIn, type AuthFailure } from "../../src/auth/auth";
import { supabase } from "../../src/supabase";
import { Alert, Button, Screen, TextField } from "../../src/ui/components";
import { Mark } from "../../src/ui/icons";
import { space, type } from "../../src/ui/theme";

// Giriş (docs/design/screens/01-Giris.png, 02-Giris-hata.png).
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase || busy) return;
    setBusy(true);
    const result = await signIn(supabase.auth, email, password);
    setBusy(false);
    if (result.ok) return; // The layout moves on once the session exists.
    setFailure(result.failure);
    setPassword("");
  }

  return (
    <Screen center>
      <View style={styles.brand}>
        <Mark size={96} />
        <Image
          source={wordmark}
          style={styles.wordmark}
          resizeMode="contain"
          accessibilityRole="header"
          accessibilityLabel="kefe"
        />
        <Text style={[type.caption, styles.tagline]}>
          Fişini çek, ne harcadığını gör.
        </Text>
      </View>

      {failure ? (
        <Alert tone="danger" title={failure.title} detail={failure.detail} />
      ) : null}

      <TextField
        label="E-posta"
        value={email}
        onChangeText={setEmail}
        placeholder="E-posta adresinizi yazın"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="Şifre"
        value={password}
        onChangeText={setPassword}
        secret
        invalid={failure !== null}
        placeholder="Şifrenizi yazın"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Giriş yap" onPress={submit} busy={busy} />

      <View style={styles.other}>
        <Text style={[type.caption, styles.center]}>Hesabın yok mu?</Text>
        <Button
          label="Hesap aç"
          variant="secondary"
          onPress={() => router.push("/hesap-ac")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", gap: space.sm, marginBottom: space.sm },
  // The wordmark image is 555 × 225.
  wordmark: { width: 125, height: 51 },
  tagline: { textAlign: "center", fontSize: 18, lineHeight: 26 },
  other: { gap: space.sm, marginTop: space.lg },
  center: { textAlign: "center" },
});
