import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { color } from "./theme";

// 24 px line icons, 2 px stroke, rounded ends (DESIGN.md). Every icon is
// decorative: the word beside it carries the meaning, so none is read out.

type IconProps = { size?: number; color?: string };

/** Hides an icon from screen readers on iOS and the web alike. */
function Decorative({ children }: { children: ReactNode }) {
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

function Line({
  size = 24,
  color: stroke = color.text,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Decorative>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </Svg>
    </Decorative>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z" />
    </Line>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
      <Path d="M9 8h6M9 12h6M9 16h4" />
    </Line>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </Line>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 3.5 2.5 20h19z" />
      <Path d="M12 10v4.5M12 17.2v.3" />
    </Line>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="m8 12.5 2.7 2.7L16 9.8" />
    </Line>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M14 4h5v16h-5" />
      <Path d="M10 8l-4 4 4 4M6 12h9" />
    </Line>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="m15 5-7 7 7 7" />
    </Line>
  );
}

/** The kefe scale-pan mark, from docs/design/logo/mark.svg. */
export function Mark({ size = 48 }: { size?: number }) {
  return (
    <Decorative>
      <Svg width={size} height={(size * 95) / 100} viewBox="0 0 100 95">
        <Path
          fill={color.text}
          d="M35.2 4.5c.4-.9 1.2-1.3 2.1-1.3h4.2c1 0 1.6 1 1.2 1.9C36.9 18.4 29 33 17.6 47.2c-.9 1.1-2.1 1.7-3.5 1.7h-4.4c-.8 0-1.3-.9-.8-1.6C20 33.6 29.1 18.6 35.2 4.5z"
        />
        <Path
          fill={color.text}
          d="M64.8 4.5c-.4-.9-1.2-1.3-2.1-1.3h-4.2c-1 0-1.6 1-1.2 1.9 5.8 13.3 13.7 27.9 25.1 42.1.9 1.1 2.1 1.7 3.5 1.7h4.4c.8 0 1.3-.9.8-1.6C80 33.6 70.9 18.6 64.8 4.5z"
        />
        <Path
          fill={color.primary}
          d="M5 52h90c3 0 5.2 2.9 4.3 5.8C94.2 77.4 74.4 92 50 92S5.8 77.4.7 57.8C-.2 54.9 2 52 5 52z"
        />
      </Svg>
    </Decorative>
  );
}
