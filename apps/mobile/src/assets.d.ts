// Metro resolves image and font files to asset references. expo-env.d.ts
// is generated and git-ignored, so these are declared here for the
// typecheck to see in CI too.
declare module "*.png" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}

declare module "*.ttf" {
  const font: import("expo-font").FontSource;
  export default font;
}
