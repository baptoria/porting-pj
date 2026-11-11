import { DEVELOPER_TOOLS } from "./build-policy";
import { storageKey } from "./app-storage";
import type { DookyDecision } from "./dooky-auto";
import { DOOKY_CD_PRESET, DOOKY_CD_PRELUDE } from "./dooky-auto";
import type { Profile } from "./model";
const key = storageKey("ed4-dooky-registration-v1");
type Record = { profileId: string; at: string; decision: DookyDecision };
let memory: Record[] = [];
let attempt: DookyDecision | undefined;
export function rememberDookyAttempt(d: DookyDecision) {
  if (DEVELOPER_TOOLS) attempt = structuredClone(d);
}
export function latestDookyAttempt() {
  return DEVELOPER_TOOLS && attempt ? structuredClone(attempt) : undefined;
}
export function rememberDookyDecision(
  profileId: string,
  decision: DookyDecision,
) {
  if (!DEVELOPER_TOOLS) return;
  memory = [
    {
      profileId,
      at: new Date().toISOString(),
      decision: structuredClone(decision),
    },
    ...records().filter((r) => r.profileId !== profileId),
  ].slice(0, 8);
  try {
    localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    /* Nonessential diagnostics never roll back a successful registration. */
  }
}
function records(): Record[] {
  if (memory.length) return memory;
  try {
    const text = localStorage.getItem(key);
    if (text && text.length < 64000) {
      const r = JSON.parse(text);
      if (Array.isArray(r))
        return r
          .filter(
            (r) =>
              r && typeof r.profileId === "string" && r.decision?.version === 1,
          )
          .slice(0, 8);
    }
  } catch {}
  return [];
}
let launch:
  | {
      profileId: string;
      at: string;
      checks: ReturnType<typeof environmentChecks>;
    }
  | undefined;
export function environmentChecks(p: Profile, paths?: readonly string[]) {
  return {
    preset: p.launch?.presetId === DOOKY_CD_PRESET,
    entry: p.executable === "GAME.BAT",
    prelude: p.settings.prelude === DOOKY_CD_PRELUDE,
    musicPrefix: p.music?.prefix ?? null,
    musicPath: paths
      ? paths.some((p) => /^ED4\/EFFECT\/[^/]+\.RAW$/i.test(p))
      : null,
  };
}
export function observeDookyLaunch(p: Profile, paths: readonly string[]) {
  if (DEVELOPER_TOOLS)
    launch = {
      profileId: p.id,
      at: new Date().toISOString(),
      checks: environmentChecks(p, paths),
    };
}
export function dookyDecisionReport(p?: Profile) {
  if (!DEVELOPER_TOOLS || !p) return undefined;
  return {
    registration: records().find((r) => r.profileId === p.id) ?? null,
    registrationNote:
      "Bounded developer metadata; absent means not recorded, not detection failure.",
    current: environmentChecks(p),
    beforeLaunch: launch?.profileId === p.id ? launch : null,
  };
}
