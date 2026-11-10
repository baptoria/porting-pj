export type IsoFixtureFiles = Record<
  string,
  Uint8Array | { size: number; head: Uint8Array }
>;
export function rawTone(hz?: number, seconds?: number): Uint8Array<ArrayBuffer>;
export function isoParts(files: IsoFixtureFiles): {
  size: number;
  parts: { offset: number; bytes: Uint8Array<ArrayBuffer> }[];
  entries: { path: string; offset: number; size: number }[];
};
export function isoBlob(files: IsoFixtureFiles): Blob;
export function writeIsoFixture(
  path: string,
  files: IsoFixtureFiles,
): Promise<ReturnType<typeof isoParts>>;
