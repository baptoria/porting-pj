export type Files = Record<string, Uint8Array>;
export interface Archive {
  id: string;
  name: string;
  files: Files;
  size: number;
  createdAt: number;
  sha256?: string;
  manifestSha256?: string;
  versionId?: string;
  fileCount?: number;
  analysis?: ArchiveAnalysis;
  sourceKind?: "zip" | "folder";
  musicPackId?: string;
  /** Original relative names/case; DOS lookup keys remain case-insensitive. */
  originalPaths?: Record<string, string>;
}
export interface ArchiveAnalysis {
  files: number;
  bytes: number;
  executables: string[];
  batFiles: string[];
  roots: string[];
  longPaths: string[];
  warnings: string[];
}
export interface Identity {
  sha256?: string;
  manifestSha256?: string;
  versionId: string;
}
export interface Measurement {
  stage: string;
  elapsedMs: number;
  logicalBytes: number;
  jsHeapBytes?: number;
  wasmHeapBytes?: number;
  note: string;
}
export type ProfileKind = "vanilla" | "patch" | "standalone";
export interface DosSettings {
  cycles: number;
  memory: number;
  sound: "sb16" | "sbpro2" | "none";
  prelude: string;
}
export interface MusicReference {
  packId: string;
  prefix: string;
  sourceArchiveId?: string;
}
export interface Profile {
  id: string;
  gameId: "ed4";
  engineId: "js-dos-v7";
  name: string;
  kind: ProfileKind;
  baseId: string;
  patchIds: string[];
  executable: string;
  settings: DosSettings;
  createdAt: number;
  schemaVersion?: 2;
  archiveIdentities?: Record<string, Identity>;
  requiredBaseVersion?: string;
  savePaths?: string[];
  music?: MusicReference & { overlays?: MusicReference[] };
  launch?: {
    source: "analyzed-batch" | "single-file" | "user-choice";
    presetId: string;
    experimental: true;
    initialization: string[];
  };
}
export interface Save {
  tempSaveObservation?: { sessionId: string; absentAfterPresent: string[] };
  profileId: string;
  files: Files;
  updatedAt: number;
  profile?: Profile;
  schemaVersion?: 2;
  tombstones?: string[];
  resources?: Files;
  resourceTombstones?: string[];
}
export interface Snapshot {
  files: Files;
  presentPaths: string[];
  measurement?: Measurement;
}
export const DEFAULT_SETTINGS: DosSettings = {
  cycles: 12000,
  memory: 16,
  sound: "sb16",
  prelude: "",
};
export const GAME = {
  id: "ed4",
  name: "구영웅전설4",
  platform: "DOS",
  verified: false,
} as const;
export const id = () => crypto.randomUUID();
