import { router } from "expo-router";
import { useState } from "react";
import { signUp, type AuthFailure } from "../../src/auth/auth";
import { supabase } from "../../src/supabase";
import {
  Alert,
  BackButton,
  Button,
  Screen,
  TextField,
  Title,
} from "../../src/ui/components";

// Hesap aç: not drawn yet (DESIGN.md "Not drawn yet"), so it reuses the
// sign-in screen's components. Email + password is the placeholder method
// until PRD open question 2 is answered.
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const toSignIn = () =>
    router.canGoBack() ? router.back() : router.replace("/giris");

  async function submit() {
    if (!supabase || busy) return;
    setBusy(true);
    const result = await signUp(supabase.auth, email, password);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    // Signed in at once: the layout moves on. Otherwise the email must be
    // confirmed first.
    if (!result.signedIn) {
      setFailure(null);
      setConfirmSent(true);
    }
  }

  if (confirmSent) {
    return (
      <Screen>
        <Title>Hesap aç</Title>
        <Alert
          tone="success"
          title="Hesabınız açıldı."
          detail="E-postanıza gelen bağlantıya tıklayın, sonra giriş yapın."
        />
        <Button label="Giriş yap" onPress={toSignIn} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton to="Giriş" onPress={toSignIn} />
      <Title>Hesap aç</Title>
      {failure ? (
        <Alert tone="danger" title={failure.title} detail={failure.detail} />
      ) : null}
      <TextField
        label="E-posta"
        value={email}
        onChangeText={setEmail}
        invalid={failure?.field === "email"}
        placeholder="E-posta adresinizi yazın"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
      />
      <TextField
        label="Şifre"
        hint="En az 6 karakter."
        value={password}
        onChangeText={setPassword}
        secret
        invalid={failure?.field === "password"}
        placeholder="Bir şifre seçin"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Hesap aç" onPress={submit} busy={busy} />
    </Screen>
  );
}
