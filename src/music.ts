import { openDB } from "idb";
import { canonicalPath, validateTree } from "./archive";
import type { Files, Profile, Save } from "./model";
export interface Track {
  path: string;
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
  openDB("ed4-music-v1", 1, {
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
    await root.getDirectoryHandle("ed4-music", { create })
  ).getDirectoryHandle(id, { create });
}
export async function removeMusic(id: string) {
  try {
    const root = await navigator.storage.getDirectory();
    await (
      await root.getDirectoryHandle("ed4-music")
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
export async function musicMounts(
  p: Profile,
  core: Files,
  save?: Save,
): Promise<MusicMount[]> {
  if (!p.music?.packId) return [];
  const pack = (await (await musicDB()).get("packs", p.music.packId)) as
    MusicPack | undefined;
  if (!pack)
    throw Error(
      "연결된 음악 데이터가 없습니다. 음악을 다시 등록·연결하거나 음악 없음을 선택하세요.",
    );
  const tracks = mountPaths(pack, p.music.prefix),
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
  const dir = await musicDirectory(pack.id);
  return Promise.all(
    tracks.map(async (t) => {
      const file = await (await dir.getFileHandle(t.key)).getFile();
      if (file.size !== t.size) throw Error("음악 파일 크기 불일치: " + t.path);
      return { path: t.path, file };
    }),
  );
}
