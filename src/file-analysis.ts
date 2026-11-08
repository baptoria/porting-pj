import type { Files } from "./model";
export function inspectGame(files: Files) {
  const paths = Object.keys(files),
    batches = paths
      .filter((p) => p.endsWith(".BAT"))
      .map((path) => ({
        path,
        text: new TextDecoder("utf-8").decode(files[path].subarray(0, 16384)),
        truncated: files[path].length > 16384,
      }));
  const windowsExecutables = paths.filter((p) => {
    const b = files[p];
    if (!p.endsWith(".EXE") || b.length < 64 || b[0] !== 77 || b[1] !== 90)
      return false;
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength),
      o = d.getUint32(60, true);
    return (
      o + 2 <= b.length &&
      ["PE", "NE"].includes(String.fromCharCode(b[o], b[o + 1]))
    );
  });
  const drivers = paths.filter((p) =>
    /DRIVER|SOUND|EFFECT|HANGUL|HAN\.COM|HGC|KOREAN/i.test(p),
  );
  const missingCandidates = batches.flatMap(({ path, text }) => {
    const dir = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/") + 1)
      : "";
    return [
      ...text.matchAll(
        /(?:^|\s)([A-Z0-9_./\\-]+\.(?:EXE|COM|BAT|RAW|SYS))(?=\s|$)/gim,
      ),
    ]
      .map((m) => m[1].replace(/\\/g, "/").toUpperCase())
      .filter((p) => !files[dir + p] && !files[p])
      .map((p) => ({ batch: path, reference: p }));
  });
  return {
    batches,
    drivers,
    windowsExecutables,
    missingCandidates,
    note: "정적 후보 분석입니다. BAT 변수·PATH·드라이버 의미·음악 명령은 해석하지 않으며 누락은 후보입니다. NE/LE/LX는 별도 호환성 확인이 필요합니다.",
  };
}
