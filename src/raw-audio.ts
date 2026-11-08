// Diagnostic assumption from supplied notes, NOT an identified ED4 header format.
export const RAW = { rate: 22050, channels: 2, header: 8, frameBytes: 4 };
export function rawInfo(size: number, header: Uint8Array) {
  if (size < 12 || (size - 8) % 4)
    throw Error(
      "RAW 후보는 8바이트 헤더 + 16비트 스테레오 프레임이어야 합니다. 형식 확인이 필요합니다.",
    );
  return {
    bytes: size,
    seconds: (size - 8) / 88200,
    headerHex: Array.from(header.slice(0, 8), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join(""),
    assumption:
      "22050 Hz / signed PCM16 little-endian / stereo / skip 8 bytes; actual ED4 unverified",
  };
}
export function pcm16(bytes: Uint8Array) {
  if (bytes.length % 4) throw Error("불완전한 PCM 프레임");
  const frames = bytes.length / 4,
    channels = [new Float32Array(frames), new Float32Array(frames)];
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++)
      channels[c][i] = d.getInt16(i * 4 + c * 2, true) / 32768;
  return channels;
}
export class RawPreview {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private token = 0;
  state = "stopped";
  samples = 0;
  get audioState() {
    return this.context?.state ?? "closed";
  }
  async play(file: Blob) {
    this.stop();
    const token = this.token;
    const ctx = (this.context = new AudioContext());
    await ctx.resume();
    rawInfo(file.size, new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    this.state = "playing";
    let at = 8;
    let time = ctx.currentTime + 0.05;
    const next = async () => {
      if (token !== this.token) return;
      if (at >= file.size) {
        this.stop();
        return;
      }
      const data = pcm16(
        new Uint8Array(
          await file.slice(at, Math.min(file.size, at + 88200)).arrayBuffer(),
        ),
      );
      if (token !== this.token) return;
      at += data[0].length * 4;
      const b = ctx.createBuffer(2, data[0].length, 22050);
      data.forEach((v, i) =>
        b.copyToChannel(v as Float32Array<ArrayBuffer>, i),
      );
      const s = (this.source = ctx.createBufferSource());
      s.buffer = b;
      s.connect(ctx.destination);
      s.onended = () => void next().catch(() => this.stop());
      s.start(Math.max(time, ctx.currentTime));
      time += b.duration;
      this.samples += data[0].length;
    };
    await next();
  }
  stop() {
    this.token++;
    this.source?.stop();
    this.source = undefined;
    void this.context?.close();
    this.context = undefined;
    this.state = "stopped";
  }
}
