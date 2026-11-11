import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/build-policy", () => ({ DEVELOPER_TOOLS: true }));
let map: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  map = new Map([["public-marker", "keep"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
});
const decision: any = {
  version: 1,
  detected: false,
  reason: "missing-or-ambiguous-packaged-startup",
  checks: { dosboxConfig: false },
};
const profile: any = {
  id: "p",
  executable: "GAME.BAT",
  settings: { prelude: "" },
};
it("keeps developer decision across reloads, separate from other profiles and public keys", async () => {
  let m = await import("../src/dooky-diagnostics");
  m.rememberDookyDecision("p", decision);
  vi.resetModules();
  m = await import("../src/dooky-diagnostics");
  expect(m.dookyDecisionReport(profile)?.registration?.decision.reason).toBe(
    decision.reason,
  );
  expect(
    m.dookyDecisionReport({ ...profile, id: "other" })?.registration,
  ).toBeNull();
  expect(map.get("public-marker")).toBe("keep");
  expect([...map.keys()]).toEqual([
    "public-marker",
    "ed4-dev:ed4-dooky-registration-v1",
  ]);
  m.observeDookyLaunch(profile, ["EFFECT/SONG.RAW"]);
  expect(m.dookyDecisionReport(profile)?.beforeLaunch?.checks.musicPath).toBe(
    false,
  );
});
it("diagnostic capacity and quota failure never alter profile or stop registration", async () => {
  const m = await import("../src/dooky-diagnostics");
  for (let i = 0; i < 20; i++) m.rememberDookyDecision("p" + i, decision);
  expect(JSON.parse(map.get("ed4-dev:ed4-dooky-registration-v1")!).length).toBe(
    8,
  );
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  });
  expect(() => m.rememberDookyDecision("p", decision)).not.toThrow();
  expect(m.dookyDecisionReport(profile)?.registration?.profileId).toBe("p");
});
it("malformed previous diagnostic metadata is ignored", async () => {
  map.set("ed4-dev:ed4-dooky-registration-v1", "[null,3,{}]");
  const m = await import("../src/dooky-diagnostics");
  expect(() => m.rememberDookyDecision("p", decision)).not.toThrow();
});
