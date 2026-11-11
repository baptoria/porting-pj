/** NE target 5 is BOSS, not Windows. Admit only a bounded, executable MZ stub.
 * This recognizes a DOS loading route, never promises that its DPMI payload works.
 * RBIL tables 01594/01596. No game hash, name or machine-code pattern matching. */
export function dosNeStub(b: Uint8Array) {
  if (b.length < 64 || b[0] !== 77 || b[1] !== 90) return false;
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength),
    n = d.getUint32(60, true);
  if (
    n < 64 ||
    n + 64 > b.length ||
    b[n] !== 78 ||
    b[n + 1] !== 69 ||
    b[n + 0x36] !== 5
  )
    return false;
  const pages = d.getUint16(4, true),
    last = d.getUint16(2, true),
    header = d.getUint16(8, true) * 16;
  const end = pages * 512 - (last ? 512 - last : 0),
    entry = header + d.getUint16(22, true) * 16 + d.getUint16(20, true);
  const reloc = d.getUint16(24, true),
    count = d.getUint16(6, true);
  return (
    pages > 0 &&
    last < 512 &&
    header >= 64 &&
    header < end &&
    end <= n &&
    entry >= header &&
    entry < end &&
    (!count || (reloc >= 28 && reloc + count * 4 <= header))
  );
}
