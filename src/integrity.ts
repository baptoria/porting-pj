import type { Archive, Files, Identity, Profile } from "./model";
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function identity(
  a: Pick<Archive, "id" | "sha256" | "versionId" | "manifestSha256">,
): Identity {
  return {
    sha256: a.sha256,
    manifestSha256: a.manifestSha256,
    versionId:
      a.versionId ?? (a.sha256 ? `sha256:${a.sha256}` : `legacy:${a.id}`),
  };
}
export function migrateProfile(profile: Profile, archives: Archive[]): Profile {
  const identities = { ...profile.archiveIdentities };
  for (const key of [profile.baseId, ...profile.patchIds]) {
    if (!identities[key])
      identities[key] = identity(
        archives.find((a) => a.id === key) ?? { id: key },
      );
  }
  return { ...profile, schemaVersion: 2, archiveIdentities: identities };
}
export function checkIdentity(
  expected: Identity | undefined,
  actual: Archive,
): "matched" | "unverified" {
  if (
    expected?.manifestSha256 &&
    expected.manifestSha256 !== actual.manifestSha256
  )
    throw new Error(
      "원본 폴더 manifest SHA-256 해시 불일치. 기존 연결을 보존합니다.",
    );
  if (expected?.sha256 && expected.sha256 !== actual.sha256)
    throw new Error(
      `원본 ZIP SHA-256 해시 불일치: ${actual.name}. 기존 연결을 보존합니다. 다른 ZIP은 별도 프로필로 등록하세요.`,
    );
  return expected?.sha256 || expected?.manifestSha256
    ? "matched"
    : "unverified";
}
export function checkRequirements(p: Profile, archives: Archive[]) {
  for (const a of archives) checkIdentity(p.archiveIdentities?.[a.id], a);
  const base = archives.find((a) => a.id === p.baseId);
  if (!base) throw new Error("원본 ZIP이 없습니다.");
  if (
    p.requiredBaseVersion &&
    p.requiredBaseVersion !== identity(base).versionId
  )
    throw new Error(
      `모드 요구 원본 버전 불일치: 요구 ${p.requiredBaseVersion}, 현재 ${identity(base).versionId}`,
    );
}
export function validateIdentities(
  value: unknown,
): Record<string, Identity> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("백업 원본 식별자가 잘못되었습니다.");
  const result: Record<string, Identity> = Object.create(null);
  for (const [key, v] of Object.entries(value)) {
    if (
      !/^[a-zA-Z0-9-]{1,80}$/.test(key) ||
      !v ||
      typeof v.versionId !== "string" ||
      v.versionId.length > 100 ||
      (v.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(v.sha256)) ||
      (v.manifestSha256 !== undefined &&
        !/^[a-f0-9]{64}$/.test(v.manifestSha256))
    )
      throw new Error("백업 원본 해시 형식이 잘못되었습니다.");
    result[key] = {
      versionId: v.versionId,
      sha256: v.sha256,
      manifestSha256: v.manifestSha256,
    };
  }
  return result;
}
