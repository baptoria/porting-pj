import { RateWindows } from "./rate-windows";
import { PCM_WORKLET as K_WORKLET } from "./generated/phase9-8k-worklet";
import { PCM_WORKLET } from "./generated/phase9-8i-worklet";
import type { Speed } from "./speed-control";
/** I only. Existing H/9-7 audio remains available; unsupported worklet fails explicitly. */
export class WorkletAudio {
  readonly inputPort: MessagePort;
  rate: Speed = 1;
  private confirmedRate:Speed=1;
  get confirmedSpeed(){return this.confirmedRate;}
  private state: any = {
    rate: 1,
    queueAheadMs: 0,
    queuedBuffers: 0,
    droppedFrames: 0,
    overlaps: 0,
    underruns: 0,
  };
  private sequence = 0;
  private rates=new RateWindows();
  private closed = false;
  private fault:string|null=null;
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
    private descriptor: {file:string;sha256:string}=PCM_WORKLET,
  ) {
    const channel = new MessageChannel();
    this.inputPort = channel.port2;
    node.port.postMessage({ kind: "attach", port: channel.port1 }, [
      channel.port1,
    ]);
    node.port.onmessage = (e) => {
      if(this.closed)return;
      const p = e.data;
      if (p.kind === "stats") {this.rates.accept(p.stats.rateWindows);this.state = {...p.stats, observedAtMs:performance.now()};}
      else if (p.kind === "error") {this.fault=p.message;issue(p.message);}
      else if (p.kind === "ack") {
        const r = this.pending.get(p.id);
        if (r) {
          clearTimeout(r.timer);
          this.pending.delete(p.id);
          if (p.rate !== this.rate) r.reject(Error("Worklet 배속 불일치"));
          else {this.confirmedRate=p.rate;r.resolve();}
        }
      }
    };
    node.onprocessorerror = () => {this.fault="AudioWorklet 처리 오류: 렌더링 지속을 확인할 수 없습니다.";issue(this.fault);};
  }
  static async create(
    ctx: AudioContext,
    output: AudioNode,
    issue: (s: string) => void,
    engine: string="phase9-8i",
  ) {
    const descriptor=engine==="phase9-8k"?K_WORKLET:PCM_WORKLET;
    if (
      !isSecureContext ||
      !ctx.audioWorklet ||
      typeof AudioWorkletNode === "undefined"
    )
      throw Error(
        "9-8I는 HTTPS/AudioWorklet 지원이 필요합니다. 기존9-7/H는 유지됩니다.",
      );
    const r = await fetch(import.meta.env.BASE_URL + descriptor.file, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("AudioWorklet 파일 로딩 실패");
    const b = await r.arrayBuffer();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== descriptor.sha256) throw Error("AudioWorklet 무결성 불일치");
    const url = URL.createObjectURL(new Blob([b], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, engine==="phase9-8k"?"ed4-pcm-k":"ed4-pcm-i", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const result = new WorkletAudio(node, issue,descriptor);
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
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('새 Worklet 속도 요청으로 이전 요청을 취소했습니다.'));}this.pending.clear();
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
    if(this.fault)return this.fault;
    if (this.state.overflows > 0) return "AudioWorklet 큐 용량 초과";
    if (this.state.queueAheadMs > 500) return "AudioWorklet 예약 큐 500ms 초과";
    if (this.descriptor!==K_WORKLET && this.state.windowGapMs > 24)
      return "최근2초 실제 오디오 렌더 공백이24ms를 초과했습니다. 원인 구간은 공급 통계를 확인하세요.";
    return null;
  }
  report() {
    return {
      ...this.state,
      rateWindows:this.state.rateWindows?this.rates.report():undefined,
      rate: this.descriptor===K_WORKLET?this.confirmedRate:this.rate,
      requestedRate:this.rate,
      fault:this.fault,
      adapter: "worklet-ring-v1",
      worklet: this.descriptor,
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
