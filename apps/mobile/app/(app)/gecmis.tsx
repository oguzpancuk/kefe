import { Text } from "react-native";
import { Card, Screen, Title } from "../../src/ui/components";
import { type } from "../../src/ui/theme";

// Geçmiş shell. The list, search and detail arrive in v1 item 4.
export default function History() {
  return (
    <Screen>
      <Title>Geçmiş</Title>
      <Card>
        <Text style={type.body}>Kaydettiğiniz fişler burada görünecek.</Text>
      </Card>
    </Screen>
  );
}
