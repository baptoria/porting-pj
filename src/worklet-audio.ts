import { PCM_WORKLET } from "./generated/phase9-8i-worklet";
import type { Speed } from "./speed-control";
/** I only. Existing H/9-7 audio remains available; unsupported worklet fails explicitly. */
export class WorkletAudio {
  readonly inputPort: MessagePort;
  rate: Speed = 1;
  private state: any = {
    rate: 1,
    queueAheadMs: 0,
    queuedBuffers: 0,
    droppedFrames: 0,
    overlaps: 0,
    underruns: 0,
  };
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private constructor(
    private node: AudioWorkletNode,
    private issue: (s: string) => void,
  ) {
    const channel = new MessageChannel();
    this.inputPort = channel.port2;
    node.port.postMessage({ kind: "attach", port: channel.port1 }, [
      channel.port1,
    ]);
    node.port.onmessage = (e) => {
      const p = e.data;
      if (p.kind === "stats") this.state = p.stats;
      else if (p.kind === "error") issue(p.message);
      else if (p.kind === "ack") {
        const r = this.pending.get(p.id);
        if (r) {
          clearTimeout(r.timer);
          this.pending.delete(p.id);
          if (p.rate !== this.rate) r.reject(Error("Worklet 배속 불일치"));
          else r.resolve();
        }
      }
    };
    node.onprocessorerror = () =>
      issue("AudioWorklet 처리 오류: 렌더링 지속을 확인할 수 없습니다.");
  }
  static async create(
    ctx: AudioContext,
    output: AudioNode,
    issue: (s: string) => void,
  ) {
    if (
      !isSecureContext ||
      !ctx.audioWorklet ||
      typeof AudioWorkletNode === "undefined"
    )
      throw Error(
        "9-8I는 HTTPS/AudioWorklet 지원이 필요합니다. 기존9-7/H는 유지됩니다.",
      );
    const r = await fetch(import.meta.env.BASE_URL + PCM_WORKLET.file, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("AudioWorklet 파일 로딩 실패");
    const b = await r.arrayBuffer();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== PCM_WORKLET.sha256) throw Error("AudioWorklet 무결성 불일치");
    const url = URL.createObjectURL(new Blob([b], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, "ed4-pcm-i", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const result = new WorkletAudio(node, issue);
    node.connect(output);
    await result.setRate(1);
    return result;
  }
  pushSamples(samples: Float32Array, sourceRate: number) {
    if (this.closed) return;
    const copy = samples.slice();
    this.node.port.postMessage({ kind: "pcm", samples: copy, sourceRate }, [
      copy.buffer,
    ]);
  }
  async setRate(rate: Speed) {
    if (this.closed) throw Error("AudioWorklet 종료");
    this.rate = rate;
    const id = ++this.sequence;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("AudioWorklet 배속 응답시간 초과"));
      }, 2000);
      this.pending.set(id, { resolve, reject, timer });
      this.node.port.postMessage({ kind: "speed", id, rate });
    });
  }
  resetHealth() {} // Do not erase real render gaps on a switch.
  problem() {
    if (this.state.overflows > 0) return "AudioWorklet 큐 용량 초과";
    if (this.state.queueAheadMs > 500) return "AudioWorklet 예약 큐 500ms 초과";
    if (this.state.windowGapMs > 24)
      return "최근2초 실제 오디오 렌더 공백이24ms를 초과했습니다. 원인 구간은 공급 통계를 확인하세요.";
    return null;
  }
  report() {
    return {
      ...this.state,
      rate: this.rate,
      adapter: "worklet-ring-v1",
      worklet: PCM_WORKLET,
      sourceNodesCreated: 0,
    };
  }
  dispose() {
    this.closed = true;
    for (const r of this.pending.values()) {
      clearTimeout(r.timer);
      r.reject(Error("AudioWorklet 종료"));
    }
    this.pending.clear();
    this.node.port.close();
    this.node.disconnect();
  }
}
