import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { signOut, type AuthFailure } from "../../src/auth/auth";
import { useAuth } from "../../src/auth/AuthProvider";
import { supabase } from "../../src/supabase";
import { Alert, Button, Card, Screen, Title } from "../../src/ui/components";
import { SignOutIcon, UserIcon } from "../../src/ui/icons";
import { color, radius, space, type } from "../../src/ui/theme";

// Hesabım (docs/design/screens/15-Hesabim.png): the account and sign-out.
// Privacy text, consent and delete account arrive in v1 item 9.
export default function Account() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const email = auth.status === "signedIn" ? auth.session.user.email : null;

  async function leave() {
    if (!supabase || busy) return;
    setBusy(true);
    setFailure(null);
    // Once the session is gone the layout sends the person to sign-in.
    const result = await signOut(supabase.auth);
    if (!result.ok) {
      setBusy(false);
      setFailure(result.failure);
    }
  }

  return (
    <Screen>
      <Title>Hesabım</Title>
      <Card>
        <View style={styles.account}>
          <View style={styles.avatar}>
            <UserIcon color={color.primary} size={32} />
          </View>
          <View style={styles.accountText}>
            <Text style={type.caption}>E-posta</Text>
            <Text style={type.bodyStrong}>{email ?? ""}</Text>
          </View>
        </View>
      </Card>
      {failure ? (
        <Alert tone="danger" title={failure.title} detail={failure.detail} />
      ) : null}
      <Button
        label="Çıkış yap"
        variant="secondary"
        icon={SignOutIcon}
        busy={busy}
        onPress={leave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: color.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  accountText: { flex: 1, gap: space.xxs },
});
