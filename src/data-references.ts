import type { Profile, Archive } from "./model";
export const archiveReferences = (p: Profile) => [
  ...new Set([
    p.baseId,
    ...p.patchIds,
    ...(p.music
      ? [p.music, ...(p.music.overlays ?? [])].flatMap((r) =>
          r.sourceArchiveId ? [r.sourceArchiveId] : [],
        )
      : []),
  ]),
];
export const packReferences = (p: Profile) =>
  p.music ? [p.music, ...(p.music.overlays ?? [])].map((r) => r.packId) : [];
export function referencedMusic(
  id: string,
  profiles: Profile[],
  archives: Archive[],
) {
  return (
    profiles.some((p) => packReferences(p).includes(id)) ||
    archives.some((a) => a.musicPackId === id)
  );
}
