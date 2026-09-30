import { describe, expect, it } from "vitest";
import tokens from "../../../../docs/design/tokens.json";
import {
  border,
  color,
  icon,
  minHeight,
  radius,
  screenPadding,
  space,
  textToken,
} from "./theme";

// The app's theme is a hand-written subset of the design tokens; every
// value it carries must be the design's value.
describe("theme mirrors docs/design/tokens.json", () => {
  it("colours", () => {
    expect(tokens.color).toMatchObject(color);
  });

  it("text styles", () => {
    expect(tokens.text).toMatchObject(textToken);
  });

  it("space, padding, radius, heights, icons and borders", () => {
    expect(tokens.space).toMatchObject(space);
    expect(tokens.screenPadding).toBe(screenPadding);
    expect(tokens.radius).toMatchObject(radius);
    expect(tokens.minHeight).toMatchObject(minHeight);
    expect(tokens.icon).toMatchObject(icon);
    expect(tokens.border).toMatchObject(border);
  });
});
