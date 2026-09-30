import { StyleSheet, Text, View } from "react-native";
import { Card, Screen, Title } from "../../src/ui/components";
import { Mark } from "../../src/ui/icons";
import { type } from "../../src/ui/theme";

// Ana Sayfa shell. The month total and "Fiş ekle" arrive in skeleton step 5.
export default function Home() {
  return (
    <Screen>
      <View style={styles.header}>
        <Title>Ana Sayfa</Title>
        <Mark size={56} />
      </View>
      <Card>
        <Text style={type.body}>
          Fişlerinizi ekledikçe bu ay ne harcadığınız burada görünecek.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
