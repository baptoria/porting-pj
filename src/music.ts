import { openDB } from "idb";
import {APP_STORAGE} from './app-storage';
import { canonicalPath, validateTree } from "./archive";
import type { Files, Profile, Save, MusicReference } from "./model";
export interface Track {
  path: string;
  originalPath?: string;
  previewCompatible?: boolean;
  key: string;
  size: number;
  sha256: string;
  header: string;
}
export interface MusicPack {
  id: string;
  name: string;
  tracks: Track[];
  bytes: number;
  createdAt: number;
}
export interface MusicMount {
  path: string;
  file: File;
}
export const musicDB = () =>
  openDB(APP_STORAGE.musicDatabase, 1, {
    upgrade(db) {
      db.createObjectStore("packs", { keyPath: "id" });
    },
  });
export const listMusic = async (): Promise<MusicPack[]> =>
  (await musicDB()).getAll("packs");
export const storeMusic = async (p: MusicPack) =>
  (await musicDB()).put("packs", p);
export async function musicDirectory(id: string, create = false) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw Error("음악 식별자 오류");
  if (!navigator.storage?.getDirectory)
    throw Error(
      "이 브라우저는 OPFS 음악 저장을 지원하지 않습니다. 음악 없이 실행할 수 있습니다.",
    );
  const root = await navigator.storage.getDirectory();
  return (
    await root.getDirectoryHandle(APP_STORAGE.musicRoot, { create })
  ).getDirectoryHandle(id, { create });
}
export async function removeMusic(id: string) {
  try {
    const root = await navigator.storage.getDirectory();
    await (
      await root.getDirectoryHandle(APP_STORAGE.musicRoot)
    ).removeEntry(id, { recursive: true });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e;
  }
  await (await musicDB()).delete("packs", id);
}
export function mountPaths(pack: MusicPack, prefix = "") {
  const normalized = prefix ? canonicalPath(prefix) + "/" : "";
  return pack.tracks.map((t) => ({
    ...t,
    path: canonicalPath(normalized + t.path),
  }));
}
export const musicReferences = (profile: Profile): MusicReference[] => profile.music ? [profile.music, ...(profile.music.overlays ?? [])] : [];
export async function resolvedTracks(profile: Profile) {
  const tracks = new Map<string, Track & { packId: string }>();
  for (const reference of musicReferences(profile)) {
    const pack = await (await musicDB()).get("packs", reference.packId) as MusicPack | undefined;
    if (!pack) throw Error("연결된 음악 데이터가 없습니다. 음악을 다시 등록·연결하거나 음악 없음을 선택하세요.");
    for (const track of mountPaths(pack, reference.prefix)) tracks.set(track.path, { ...track, packId: pack.id });
  }
  return [...tracks.values()];
}
export async function musicMounts(
  p: Profile,
  core: Files,
  save?: Save,
): Promise<MusicMount[]> {
  if (!p.music?.packId) return [];
  const tracks = await resolvedTracks(p),
    paths: Files = { ...core, ...save?.files, ...save?.resources };
  for (const t of tracks) {
    if (
      paths[t.path] ||
      [
        ...(save?.tombstones ?? []),
        ...(save?.resourceTombstones ?? []),
      ].includes(t.path)
    )
      throw Error("음악과 원본/모드/저장 경로 충돌: " + t.path);
    paths[t.path] = new Uint8Array();
  }
  validateTree(paths);
  const dirs = new Map<string, FileSystemDirectoryHandle>();
  for (const packId of new Set(tracks.map(t => t.packId)))
    dirs.set(packId, await musicDirectory(packId));
  return Promise.all(
    tracks.map(async (t) => {
      const file = await (await dirs.get(t.packId)!.getFileHandle(t.key).catch(error => {
        if (error instanceof DOMException && error.name === "NotFoundError")
          throw Error("연결된 음악 파일이 사라졌습니다: " + (t.originalPath ?? t.path) + ". 설정의 음악 보관함에서 다시 등록·연결하세요. 게임과 세이브는 유지됩니다.");
        throw error;
      })).getFile();
      // Registered metadata may describe an earlier user revision. Mount actual
      // readable bytes/size; a canonical music hash/length is not an allowlist.
      return { path: t.path, file };
    }),
  );
}
