import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { signOut } from "../../src/auth/auth";
import { useAuth } from "../../src/auth/AuthProvider";
import { supabase } from "../../src/supabase";
import { Button, Card, Screen, Title } from "../../src/ui/components";
import { SignOutIcon, UserIcon } from "../../src/ui/icons";
import { color, radius, space, type } from "../../src/ui/theme";

// Hesabım (docs/design/screens/15-Hesabim.png): the account and sign-out.
// Privacy text, consent and delete account arrive in v1 item 9.
export default function Account() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const email = auth.status === "signedIn" ? auth.session.user.email : null;

  async function leave() {
    if (!supabase) return;
    setBusy(true);
    // Once the session is gone the layout sends the person to sign-in.
    await signOut(supabase.auth);
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
