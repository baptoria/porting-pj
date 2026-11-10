import { DEVELOPER_TOOLS } from "./build-policy";

// Public names are a compatibility contract. No discovery, migration or
// fallback to public storage is permitted in the developer build.
export function storageNames(developer: boolean) {
  return {
    database: developer ? "ed4-mobile-dev-v1" : "ed4-mobile-v1",
    musicDatabase: developer ? "ed4-music-dev-v1" : "ed4-music-v1",
    musicRoot: developer ? "ed4-dev-music" : "ed4-music",
    writerLock: developer ? "ed4-mobile-dev-writer" : "ed4-mobile-writer",
    key: (publicKey: string) =>
      developer ? "ed4-dev:" + publicKey : publicKey,
  };
}
export const APP_STORAGE = storageNames(DEVELOPER_TOOLS);
export const storageKey = APP_STORAGE.key;
