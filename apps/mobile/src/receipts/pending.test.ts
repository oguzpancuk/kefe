import { describe, expect, it } from "vitest";
import { sendAgain, sendingOf, trackSending } from "./pending";

// ROADMAP v1 2: "Tekrar dene" must try again. After a reload mid-reading
// Kontrol et first waits for the reading under way; when that ends in a
// failure, trying again must read again, not wait on the failure.

describe("sendAgain", () => {
  it("repeats the send itself when nothing else was given", async () => {
    let sends = 0;
    trackSending("a", () => {
      sends += 1;
      return Promise.resolve({ ok: true });
    });
    expect(sendAgain("a")).toBe(true);
    expect(await sendingOf("a")).toEqual({ ok: true });
    expect(sends).toBe(2);
  });

  it("runs the given retry instead of the first attempt", async () => {
    const calls: string[] = [];
    trackSending(
      "b",
      () => {
        calls.push("wait");
        return Promise.resolve({
          ok: false,
          failure: { title: "Bu fiş okunamadı", detail: "" },
        });
      },
      () => {
        calls.push("read");
        return Promise.resolve({ ok: true });
      },
    );
    expect(sendAgain("b")).toBe(true);
    expect(await sendingOf("b")).toEqual({ ok: true });
    expect(calls).toEqual(["wait", "read"]);
  });

  it("says when this session never sent the receipt", () => {
    expect(sendAgain("never")).toBe(false);
  });
});
