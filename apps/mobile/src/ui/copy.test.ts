import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PRD #4 / ROADMAP v1 2: the receipt's internal states (yükleniyor,
// sırada, işleniyor, kontrol bekliyor, başarısız) are never shown by
// name; between sending and the draft the person reads only "Fiş
// okunuyor". The screens are checked by screenshot; this keeps any of
// those words out of the app's source, comments included, so none can
// reach a screen later either.

const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const INTERNAL = [
  "yükleniyor",
  "sırada",
  "işleniyor",
  "kontrol bekliyor",
  "başarısız",
];

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the app's words", () => {
  const files = [
    ...sources(join(appRoot, "app")),
    ...sources(join(appRoot, "src")),
  ];

  it("finds the screens to check", () => {
    expect(files.some((file) => file.endsWith("kontrol.tsx"))).toBe(true);
  });

  it.each(INTERNAL)("never say the internal state %s", (word) => {
    const found = files.filter((file) =>
      readFileSync(file, "utf8").toLocaleLowerCase("tr").includes(word),
    );
    expect(found.map((file) => relative(appRoot, file))).toEqual([]);
  });
});
