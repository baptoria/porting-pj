import { canonicalPath, LIMITS } from "./archive";
const MAX = 768 * 1024 * 1024;
interface Entry {
  path: string;
  originalPath: string;
  size: number;
  compressed: number;
  offset: number;
  method: number;
  crc: number;
  directory: boolean;
}
export async function zipEntries(file: Blob, read: (blob:Blob)=>Promise<Uint8Array> = async blob=>new Uint8Array(await blob.arrayBuffer())): Promise<Entry[]> {
  const tail = await read(file.slice(Math.max(0, file.size - 65557))),
    v = new DataView(tail.buffer);
  let at = tail.length - 22;
  for (; at >= 0; at--)
    if (
      v.getUint32(at, true) === 0x06054b50 &&
      at + 22 + v.getUint16(at + 20, true) === tail.length
    )
      break;
  if (at < 0) throw Error("ZIP 종료 레코드가 없습니다.");
  const count = v.getUint16(at + 10, true),
    len = v.getUint32(at + 12, true),
    offset = v.getUint32(at + 16, true);
  if (
    v.getUint16(at + 4, true) ||
    v.getUint16(at + 6, true) ||
    count === 65535 ||
    len > 4 * 1024 * 1024 ||
    offset + len > file.size ||
    count > LIMITS.entries
  )
    throw Error(
      "분할/ZIP64 또는 과다 항목 ZIP은 지원하지 않습니다. 폴더로 등록하세요.",
    );
  const central = await read(file.slice(offset, offset + len)),
    d = new DataView(central.buffer),
    result: Entry[] = [];
  let pos = 0,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > central.length || d.getUint32(pos, true) !== 0x02014b50)
      throw Error("ZIP 목록 손상");
    const flags = d.getUint16(pos + 8, true),
      method = d.getUint16(pos + 10, true),
      compressed = d.getUint32(pos + 20, true),
      size = d.getUint32(pos + 24, true),
      nl = d.getUint16(pos + 28, true),
      ex = d.getUint16(pos + 30, true),
      comment = d.getUint16(pos + 32, true),
      start = d.getUint32(pos + 42, true);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      start === 0xffffffff ||
      size === 0xffffffff ||
      pos + 46 + nl + ex + comment > central.length
    )
      throw Error("암호화/ZIP64/지원하지 않는 ZIP 압축 방식");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(
      central.subarray(pos + 46, pos + 46 + nl),
    );
    if (((d.getUint32(pos + 38, true) >>> 16) & 0xf000) === 0xa000)
      throw Error("ZIP 심볼릭 링크는 지원하지 않습니다.");
    const path = canonicalPath(raw);
    total += size;
    if (
      total > MAX ||
      size > (path.endsWith(".RAW") ? 128 * 1024 * 1024 : LIMITS.file)
    )
      throw Error("ZIP 압축 해제 크기가 제한을 초과합니다.");
    result.push({
      path,
      originalPath: raw.replace(/\\/g, "/").replace(/\/$/, ""),
      size,
      compressed,
      offset: start,
      method,
      crc: d.getUint32(pos + 16, true),
      directory: raw.endsWith("/"),
    });
    pos += 46 + nl + ex + comment;
  }
  if (pos !== central.length) throw Error("ZIP 목록 길이 오류");
  return result;
}
