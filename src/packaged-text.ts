/** Bounded configuration text. BOMs are explicit evidence, not guessed OEM paths. */
export async function packagedText(blob: Blob, signal: AbortSignal) {
  if (blob.size > 16384) throw Error("config-size");
  const b = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  const encoding =
    b[0] === 255 && b[1] === 254
      ? "utf-16le"
      : b[0] === 254 && b[1] === 255
        ? "utf-16be"
        : b[0] === 239 && b[1] === 187 && b[2] === 191
          ? "utf-8"
          : "latin1";
  const text = new TextDecoder(encoding, { fatal: true }).decode(b);
  if (text.includes("\0")) throw Error("unmarked-or-invalid-encoding");
  return { text, encoding };
}
export function startupCommands(text: string) {
  const sections = text.split(/\[NEW\]/i).slice(1);
  if (!sections.length || sections.length > 8) return false;
  return sections.every(
    (s) =>
      s
        .split(/\r\n|\n|\r/)
        .map((s) => s.trim())
        .filter((s) => s && !/^(TITLE|EXECUTER|CFGFILE):/i.test(s))
        .map((s) =>
          s
            .replace(/^@/, "")
            .trim()
            .replace(/[ \t]+/g, " ")
            .toUpperCase(),
        )
        .join("\n") === "CD ED4\nLOADER.COM\nGAME.BAT",
  );
}
