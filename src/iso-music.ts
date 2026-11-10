import { canonicalPath, validateTree } from "./archive";
import type { SourceInput } from "./source-import";

export class IsoMusicError extends Error {}
const fail = (text: string): never => {
  throw new IsoMusicError(text);
};
const SECTOR = 2048;
export interface IsoEntry {
  path: string;
  offset: number;
  size: number;
  directory: boolean;
}
export interface IsoIndex {
  entries: IsoEntry[];
  volumeBytes: number;
  bytesRead: number;
  maxRead: number;
}

/** ECMA-119 primary volume, 2048-byte sectors, ASCII, single contiguous extents.
 * No mounting, decompression, whole-image buffer or interpretation of executable data.
 */
export async function indexIso(
  file: Blob,
  signal?: AbortSignal,
  progress: (text: string) => void = () => {},
): Promise<IsoIndex> {
  let bytesRead = 0,
    maxRead = 0,
    volumeBytes = file.size;
  const read = async (at: number, length: number) => {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(at) ||
      at < 0 ||
      length > SECTOR ||
      at + length > volumeBytes
    )
      fail("ISO 파일의 범위가 맞지 않습니다. 이미지가 잘렸는지 확인하세요.");
    const bytes = new Uint8Array(
      await file.slice(at, at + length).arrayBuffer(),
    );
    signal?.throwIfAborted();
    if (bytes.length !== length) fail("ISO 파일을 끝까지 읽지 못했습니다.");
    bytesRead += length;
    maxRead = Math.max(maxRead, length);
    return bytes;
  };
  const number = (b: Uint8Array, at: number, width: 2 | 4) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const le = width === 2 ? v.getUint16(at, true) : v.getUint32(at, true),
      be =
        width === 2
          ? v.getUint16(at + width, false)
          : v.getUint32(at + width, false);
    if (le !== be) fail("ISO 숫자 필드가 손상되었습니다.");
    return le;
  };
  let primary: Uint8Array | undefined,
    terminated = false,
    descriptorEnd = 0;
  for (let sector = 16; sector < 80; sector++) {
    const b = await read(sector * SECTOR, SECTOR);
    if (String.fromCharCode(...b.subarray(1, 6)) !== "CD001" || b[6] !== 1)
      fail(
        "지원하지 않는 이미지입니다. 2048바이트 ISO 9660 이미지가 필요합니다.",
      );
    if (b[0] === 1) {
      if (
        primary &&
        [80, 120, 124, 128, 156].some(
          (at) =>
            !b
              .subarray(at, at + (at === 156 ? 34 : 8))
              .every((x, i) => x === primary![at + i]),
        )
      )
        fail("ISO 기본 볼륨 정보가 서로 다릅니다.");
      primary ??= b;
    }
    if (b[0] === 255) {
      terminated = true;
      descriptorEnd = (sector + 1) * SECTOR;
      break;
    }
  }
  if (!primary || !terminated) fail("ISO 기본 볼륨 또는 종료 정보가 없습니다.");
  const p = primary!;
  if (
    number(p, 128, 2) !== SECTOR ||
    number(p, 120, 2) !== 1 ||
    number(p, 124, 2) !== 1 ||
    p[881] !== 1
  )
    fail("지원하지 않는 ISO 블록/다중 볼륨 형식입니다.");
  volumeBytes = number(p, 80, 4) * SECTOR;
  if (volumeBytes > file.size || volumeBytes < descriptorEnd)
    fail("ISO 전체 길이가 볼륨 정보와 다릅니다.");
  const record = (b: Uint8Array, path: string): IsoEntry => {
    if (b.length < 34 || b[0] !== b.length || 33 + b[32] > b.length)
      fail("ISO 디렉터리 항목이 손상되었습니다.");
    if (b[1] || b[26] || b[27] || b[25] & ~3 || number(b, 28, 2) !== 1)
      fail("다중 extent·인터리브·확장 속성 ISO는 지원하지 않습니다.");
    const offset = number(b, 2, 4) * SECTOR,
      size = number(b, 10, 4);
    if (offset + size > volumeBytes || (size > 0 && offset < descriptorEnd))
      fail("ISO 파일 위치가 유효하지 않습니다.");
    return { path, offset, size, directory: !!(b[25] & 2) };
  };
  const root = record(p.slice(156, 156 + p[156]), "");
  if (!root.directory || !root.size) fail("ISO 루트 디렉터리가 없습니다.");
  const queue = [{ ...root, depth: 0 }],
    entries: IsoEntry[] = [],
    extents: IsoEntry[] = [root],
    seen = new Set<string>(),
    visited = new Set<number>();
  let directoryBytes = 0;
  while (queue.length) {
    signal?.throwIfAborted();
    const dir = queue.shift()!;
    if (
      dir.depth > 16 ||
      visited.has(dir.offset) ||
      dir.size > 1024 * 1024 ||
      (directoryBytes += dir.size) > 8 * 1024 * 1024
    )
      fail("ISO 디렉터리 순환 또는 크기 제한을 초과했습니다.");
    visited.add(dir.offset);
    progress("ISO 음악 목록을 확인하고 있습니다…");
    for (let at = 0; at < dir.size; at += SECTOR) {
      const block = await read(
        dir.offset + at,
        Math.min(SECTOR, dir.size - at),
      );
      for (let pos = 0; pos < block.length;) {
        const length = block[pos];
        if (!length) break;
        if (length < 34 || pos + length > block.length)
          fail("ISO 디렉터리 항목이 블록을 벗어났습니다.");
        const b = block.slice(pos, pos + length);
        pos += length;
        const e = record(b, "");
        const nameBytes = b.subarray(33, 33 + b[32]);
        if (
          nameBytes.length === 1 &&
          (nameBytes[0] === 0 || nameBytes[0] === 1)
        )
          continue;
        if (!nameBytes.length || !nameBytes.every((c) => c >= 32 && c <= 126))
          fail("비 ASCII ISO 파일 이름은 지원하지 않습니다.");
        let name = String.fromCharCode(...nameBytes);
        if (!e.directory) {
          if (/;/.test(name) && !/^[^;]+;1$/.test(name))
            fail("여러 파일 버전이 있는 ISO는 지원하지 않습니다.");
          name = name.replace(/;1$/, "").replace(/\.$/, "");
        }
        if (/[\\/]/.test(name)) fail("ISO 파일 이름에 경로 구분자가 있습니다.");
        try {
          e.path = canonicalPath((dir.path ? dir.path + "/" : "") + name);
        } catch {
          fail("안전하지 않은 ISO 파일 경로입니다.");
        }
        if (seen.has(e.path)) fail("ISO 파일 경로가 중복됩니다.");
        seen.add(e.path);
        entries.push(e);
        if (entries.length > 12000) fail("ISO 파일 개수 제한을 초과했습니다.");
        if (e.size) extents.push(e);
        if (e.directory) queue.push({ ...e, depth: dir.depth + 1 });
      }
    }
  }
  extents.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < extents.length; i++)
    if (extents[i].offset < extents[i - 1].offset + extents[i - 1].size)
      fail("ISO 파일 데이터 영역이 겹칩니다.");
  const tree = Object.fromEntries(
    entries.filter((e) => !e.directory).map((e) => [e.path, new Uint8Array()]),
  );
  validateTree(tree);
  return { entries, volumeBytes, bytesRead, maxRead };
}

/** Check the observed ED4 8-byte envelope; samples remain opaque, never converted.
 * Format 3 / rate 22050 agrees with the existing PCM16LE stereo preview contract;
 * this is not a universal RAW codec or a guarantee that arbitrary samples are intact.
 */
export function isoRawEnvelope(size: number, header: Uint8Array) {
  if (header.length !== 8 || size <= 8 || size > 128 * 1024 * 1024)
    fail("RAW 헤더 또는 파일 크기를 확인할 수 없습니다.");
  const v = new DataView(header.buffer, header.byteOffset, 8);
  if (
    v.getUint16(0, true) !== 3 ||
    v.getUint16(2, true) !== 22050 ||
    v.getUint32(4, true) !== size - 8 ||
    (size - 8) % 4
  )
    fail(
      "RAW 헤더의 형식·길이가 맞지 않습니다. 기존 RAW 파일은 별도로 연결할 수 있습니다.",
    );
  return {
    format: 3,
    rate: 22050,
    headerBytes: 8,
    frameBytes: 4,
    frames: (size - 8) / 4,
  };
}
export async function isoMusicSources(
  file: Blob,
  signal?: AbortSignal,
  progress: (text: string) => void = () => {},
) {
  const index = await indexIso(file, signal, progress),
    inputs: SourceInput[] = [],
    warnings: string[] = [];
  const tracks = index.entries.filter(
    (e) => !e.directory && e.path.startsWith("ED4/") && e.path.endsWith(".RAW"),
  );
  let total = 0;
  for (const e of tracks) {
    signal?.throwIfAborted();
    progress(
      `ISO 음악 확인 ${inputs.length + warnings.length + 1}/${tracks.length}`,
    );
    try {
      const h = new Uint8Array(
        await file.slice(e.offset, e.offset + 8).arrayBuffer(),
      );
      signal?.throwIfAborted();
      isoRawEnvelope(e.size, h);
      if ((total += e.size) > 768 * 1024 * 1024)
        fail("ISO 음악 전체 크기 제한을 초과했습니다.");
      inputs.push({
        path: e.path.slice(4),
        file: file.slice(e.offset, e.offset + e.size),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!(error instanceof IsoMusicError)) throw error;
      warnings.push(`${e.path}: ${error.message}`);
    }
  }
  if (!tracks.length) warnings.push("ISO에서 ED4 음악 파일을 찾지 못했습니다.");
  return { inputs, warnings, index, found: tracks.length };
}
