import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeIcon, ReceiptIcon, UserIcon } from "./icons";
import {
  border,
  color,
  fontFamily,
  icon,
  minHeight,
  space,
  type,
} from "./theme";

// Exactly three sections with visible Turkish labels (PRD, Core
// interactions). The active tab is blue, heavier and has a top bar, so it
// never depends on colour alone (DESIGN.md: tab bar).
const tabs = [
  { href: "/", label: "Ana Sayfa", Icon: HomeIcon },
  { href: "/gecmis", label: "Geçmiş", Icon: ReceiptIcon },
  { href: "/hesabim", label: "Hesabım", Icon: UserIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: insets.bottom }]}
    >
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href;
        const tint = active ? color.primary : color.textMuted;
        return (
          <Pressable
            key={href}
            onPress={() => router.replace(href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={[styles.indicator, active && styles.indicatorOn]} />
            <Icon color={tint} size={icon.tab} />
            <Text
              style={[
                type.label,
                styles.label,
                { color: tint },
                active && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderTopWidth: border.hairline,
    borderTopColor: color.border,
  },
  tab: {
    flex: 1,
    minHeight: minHeight.tabBar,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    paddingBottom: space.xs,
  },
  pressed: { backgroundColor: color.primaryTint },
  indicator: {
    position: "absolute",
    top: 0,
    width: 56,
    height: 4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  indicatorOn: { backgroundColor: color.primary },
  label: { textAlign: "center", fontFamily: fontFamily.semibold },
  labelActive: { fontFamily: fontFamily.heavy },
});
