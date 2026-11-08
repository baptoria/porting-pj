import type { DosSettings } from "./model";
export const PRESETS: Record<
  string,
  { name: string; settings: Omit<DosSettings, "prelude"> }
> = {
  balanced: {
    name: "범용 시작점 (ED4 미검증)",
    settings: { cycles: 12000, memory: 16, sound: "sb16" },
  },
  low: {
    name: "낮은 CPU 부하 실험 (미측정)",
    settings: { cycles: 6000, memory: 16, sound: "sbpro2" },
  },
  diagnostic: {
    name: "무음 진단 (ED4 미검증)",
    settings: { cycles: 12000, memory: 16, sound: "none" },
  },
};
