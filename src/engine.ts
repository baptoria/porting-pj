import type { CommandInterface, Emulators } from "emulators";
import type {
  MessageHandler,
  TransportLayer,
} from "emulators/dist/types/protocol/protocol";
import type { Snapshot } from "./model";
import { readZip } from "./archive";
import type { MusicMount } from "./music";
import { DosObservation } from './dos-observation';
import { RuntimeErrors, diagnosticText } from './runtime-errors';
import { RebootObservation } from './reboot-observation';
import { CpuHistory } from './cpu-history';
import { FirstAnomaly } from './first-anomaly';
import { emulatorAudioBuffer } from "./emulator-audio";
import { PerformanceWindow } from './performance-window';
import { PHASE97_WORKER } from './generated/phase9-7-worker';
import { PHASE96_WORKER } from './generated/phase9-6-worker';
import { PHASE95B_WORKER } from './generated/phase9-5b-worker';
import { PHASE94_WORKER } from './generated/phase9-4-worker';
import { PHASE93_WORKER } from './generated/phase9-3-worker';
import { prepareRebootEngine, experimentalEngine, type ExperimentalEngineId } from './experimental-engine';
declare global {
  interface Window {
    emulators: Emulators;
  }
}
export interface Engine {
  start(bundle: Uint8Array): Promise<void>;
  save(): Promise<Snapshot>;
  stop(): Promise<void>;
  key(code: number, pressed: boolean): void;
  pause(value: boolean): void;
}
let loaded: Promise<void> | undefined;
function loadEmulator() {
  return (loaded ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}vendor/emulators.js`;
    script.onload = () => {
      window.emulators.pathPrefix = `${import.meta.env.BASE_URL}vendor/`;
      resolve();
    };
    script.onerror = () => {
      loaded = undefined;
      script.remove();
      reject(
        new Error(
          "에뮬레이터 파일을 불러오지 못했습니다. 온라인에서 오프라인 준비를 완료하세요.",
        ),
      );
    };
    document.head.append(script);
  }));
}
export class DosEngine implements Engine {
  private ci?: CommandInterface;
  private audio?: AudioContext;
  private gain?: GainNode;
  private nextAudio = 0;
  private audioOutput={sourceRate:0,blocks:0,inputFrames:0,scheduledFrames:0,resyncs:0};
  private rawObservation={source:'not-sampled',capturedAtMs:null as number|null};
  private rawRequest=0;
  private rawReply?:()=>void;
  private rawPending?:Promise<void>;
  private pressed = new Set<number>();
  private frame?: ImageData;
  private paused = false;
  private worker?: Worker;
  private snapshotInfo?: {
    paths: string[];
    bytes: number;
    elapsedMs: number;
    wasmHeapBytes: number;
  };
  private snapshotError?: string;
  readonly metrics = { frames: 0, audioSamples: 0 };
  private startedAt = performance.now();
  private observation=new DosObservation();
  private runtimeErrors=new RuntimeErrors();
  private reboot=new RebootObservation();
  private cpuHistory=new CpuHistory();
  private firstAnomaly=new FirstAnomaly();
  private experimental=false;
  private performanceWindow?:PerformanceWindow;
  private performanceId=0;
  private performanceEnd?:()=>void;
  private frameSentAt?:number;
  private paintPending=false;
  private artifact:{id:string;emulators:string;wasmSha256?:string;expectedSha256?:string;verification:string;sourceCommit:string;worker?:{entry:string;common:string;expectedSha256:string;revision:string;bootstrap:'pending'|'ready'|'failed'}}={id:'stable',emulators:'0.73.8',wasmSha256:'5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf',verification:'pinned-release-hash',sourceCommit:'aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5'};
  musicMetrics?: {
    reads: number;
    bytes: number;
    largestRead: number;
    mounted: number;
  };
  diagnostics() {
    return {
      ...this.metrics,
      performanceWindow:this.performanceWindow?.report(),
      averageFps:
        this.metrics.frames /
        Math.max(1, (performance.now() - this.startedAt) / 1000),
      audioState: this.audio?.state ?? "closed",
      audioOutput:{...this.audioOutput,contextRate:this.audio?.sampleRate??null,
        adapter:this.artifact.id==='phase9-7'?'mono-v1':'legacy-interleaved-stereo',
        sourceChannels:1,outputBufferChannels:this.artifact.id==='phase9-7'?1:2,
        runtimeEngine:this.artifact.id==='phase9-7'?'phase9-6':this.artifact.id,
        deviceUsage:'unobserved: mixed stream cannot distinguish OPL/PCM',
        baseLatency:this.audio?.baseLatency??null,outputLatency:this.audio?.outputLatency??null},
      paused: this.paused,
      music: this.musicMetrics,
      musicObservation:{...this.rawObservation},
      execution: this.observation.report(),
      runtimeErrors:this.runtimeErrors.report(),
      artifact:{...this.artifact},
      reboot:this.reboot.report(),
      cpuHistory:(this.artifact.id==='phase9-6'||this.artifact.id==='phase9-7')?{enabled:false,reason:'Instruction history compiled out; rare reboot/EXEC events retained.'}:(this.artifact.id==='phase9-4'||this.artifact.id==='phase9-5b')?this.firstAnomaly.report():this.cpuHistory.report(),
      resolution: {width:this.canvas.width,height:this.canvas.height},
      note: "FPS is callback count / session wall time, including pauses; not a GPU timing measurement",
    };
  }
  constructor(
    private canvas: HTMLCanvasElement,
    private log: (text: string) => void,
    private stdout?: (text:string)=>void,
  ) {}
  // Call synchronously in the Play click, before IndexedDB/ZIP awaits.
  activateAudio() {
    this.audio ??= new AudioContext();
    this.gain ??= this.audio.createGain();
    this.gain.connect(this.audio.destination);
    void this.audio
      .resume()
      .catch(() => this.log("소리 켜기 버튼을 눌러 오디오를 활성화하세요."));
  }
  setVolume(volume: number) {
    if (this.gain) this.gain.gain.value = volume;
  }
  async start(bundle: Uint8Array, music: MusicMount[] = [], experiment?:{id:ExperimentalEngineId;discardWrites:true}) {
    this.startedAt = performance.now();
    this.audioOutput={sourceRate:0,blocks:0,inputFrames:0,scheduledFrames:0,resyncs:0};
    this.observation=new DosObservation();
    this.runtimeErrors=new RuntimeErrors();
    this.reboot=new RebootObservation();
    this.cpuHistory=new CpuHistory();
    this.firstAnomaly=new FirstAnomaly();
    this.experimental=false;
    this.artifact={id:'stable',emulators:'0.73.8',wasmSha256:'5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf',verification:'pinned-release-hash',sourceCommit:'aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5'};
    let verified:Awaited<ReturnType<typeof prepareRebootEngine>>|undefined;
    if(experiment){
      if(!['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6','phase9-7'].includes(experiment.id)||experiment.discardWrites!==true)throw Error('실험 엔진은 저장하지 않는 일회성 진단에서만 사용할 수 있습니다.');
      this.experimental=true;
      this.artifact={...this.artifact,id:experiment.id,wasmSha256:undefined,expectedSha256:experimentalEngine(experiment.id).wasmSha256,verification:'not-yet-verified'};
      try{verified=await prepareRebootEngine(experiment.id);}
      catch(e){this.runtimeErrors.record('experimental-engine-load',{name:'Error',message:String(e)});throw e;}
      this.artifact={...this.artifact,wasmSha256:verified.sha256,verification:'sha256-of-compiled-module'};
    }
    this.rawObservation={source:'not-sampled',capturedAtMs:null};
    this.musicMetrics={reads:0,bytes:0,largestRead:0,mounted:music.length};
    await loadEmulator();
    const pinnedWorker=experiment?.id==='phase9-7'?PHASE97_WORKER:experiment?.id==='phase9-6'?PHASE96_WORKER:experiment?.id==='phase9-5b'?PHASE95B_WORKER:experiment?.id==='phase9-4'?PHASE94_WORKER:experiment?.id==='phase9-3'?PHASE93_WORKER:undefined;
    if(pinnedWorker)this.artifact.worker={entry:pinnedWorker.entry,common:pinnedWorker.common,expectedSha256:pinnedWorker.sha256,revision:pinnedWorker.revision,bootstrap:'pending'};
    // Own the worker lifecycle. v7 may never acknowledge exit while DOS waits
    // for BIOS input; an already-checkpointed session must still be stoppable.
    const worker = (this.worker = new Worker(
      `${import.meta.env.BASE_URL}${pinnedWorker?pinnedWorker.entry:experiment?`dos-worker-${experiment.id}.js`:'dos-worker.js'}`,
    ));
    const sessionId = crypto.randomUUID();
    let handler: MessageHandler | undefined;
    let rejectStartup: ((error:Error)=>void)|undefined;
    const queue: MessageEvent[] = [];
    worker.onmessage = (event) => {
      if(event.data?.name==='ed4-audio-status'){
        const p=event.data.props;
        if(this.artifact.id==='phase9-7'&&this.rawReply&&p?.id===this.rawRequest&&['reads','bytes','largestRead','mounted'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)){
          this.musicMetrics={reads:p.reads,bytes:p.bytes,largestRead:p.largestRead,mounted:p.mounted};
          this.rawObservation={source:'live-worker-query',capturedAtMs:performance.now()-this.startedAt};this.rawReply();
        }
        return;
      }
      if(event.data?.name==='ed4-performance'){
        if(event.data.props?.id===this.performanceId)this.performanceWindow?.sample(event.data.props);
        return;
      }
      if(event.data?.name==='ws-update-lines')this.frameSentAt=typeof event.data.props?.ed4SentAt==='number'?event.data.props.ed4SentAt:undefined;
      if(event.data?.name==='ed4-worker-bootstrap'){
        if(pinnedWorker&&this.artifact.worker){
          const p=event.data.props;
          if(p?.revision===pinnedWorker.revision&&p?.common===pinnedWorker.common&&p?.sha256===pinnedWorker.sha256)this.artifact.worker.bootstrap='ready';
          else {
            this.artifact.worker.bootstrap='failed';
            const message='실험 Worker 버전 불일치: 온라인에서 실행기 탭/PWA를 모두 닫고 업데이트하세요. 기존 데이터는 유지됩니다.';
            this.runtimeErrors.record('worker-bootstrap',{name:'Error',message,stage:'import-common-worker'});
            this.observation.error(message);this.log(message);worker.terminate();rejectStartup?.(new Error(message));
          }
        }
        return;
      }
      if(event.data?.name==='ed4-cpu-history'){
        if((experiment?.id==='phase9-3'||experiment?.id==='phase9-4'||experiment?.id==='phase9-5b')&&((experiment.id==='phase9-4'||experiment.id==='phase9-5b')?this.firstAnomaly:this.cpuHistory).accept(event.data.props))this.log('재부팅 직전 CPU 실행 이력을 진단 JSON에 기록했습니다. 원인 확정은 이력 분석이 필요합니다.');
        return;
      }
      if(event.data?.name==='ed4-reboot-event'){
        if(this.experimental){const e=this.reboot.accept(event.data.props);if(e?.kind==='reboot-handler')this.log(`BIOS 재부팅 진입: ${e.route} · CPU 상태를 진단 JSON에 기록했습니다. 게임 초기화 성공을 뜻하지 않습니다.`);}
        return;
      }
      if(event.data?.name==='ed4-runtime-error'){
        this.performanceWindow?.invalidate('runtime-error');
        const source=['worker-error','worker-bootstrap','unhandledrejection','factory-rejection','factory-exception','emscripten-abort'].includes(event.data.props?.source)?event.data.props.source:'worker-report';
        if(source==='worker-bootstrap'&&this.artifact.worker)this.artifact.worker.bootstrap='failed';
        const failure=this.runtimeErrors.record(source,event.data.props);
        const message=`DOS Worker 오류 (${source}): ${failure.message}`;
        this.observation.error(message);this.log(message);
        rejectStartup?.(new Error(message));
        return; // Diagnostic side channel is not part of the js-dos protocol.
      }
      this.observation.observe(event.data.name,event.data.props);
      if (event.data.name === "ws-persist") {
        this.snapshotInfo = event.data.props.ed4Snapshot;
        this.snapshotError = event.data.props.ed4SnapshotError;
        this.musicMetrics = event.data.props.ed4Snapshot?.music;
        this.rawObservation={source:'persist-snapshot',capturedAtMs:performance.now()-this.startedAt};
      }
      if (handler) handler(event.data.name, event.data.props);
      else queue.push(event);
    };
    const transport: TransportLayer = {
      sessionId,
      sendMessageToServer: (name, props) => {
        // Bundles come from a disposable IDB read; transfer instead of cloning.
        const transfers =
          name === "wc-run"
            ? (props?.bundles as Uint8Array[] | undefined)?.map(
                (b) => b.buffer as ArrayBuffer,
              )
            : undefined;
        worker.postMessage(
          { name, props },
          transfers ? [...new Set(transfers)] : [],
        );
      },
      initMessageHandler: (next) => {
        handler = next;
        for (const event of queue) next(event.data.name, event.data.props);
        queue.length = 0;
      },
      exit: () => worker.terminate(),
    };
    worker.postMessage({
      name: "wc-install",
      props: { sessionId, ed4Music: music, ...(verified?{module:verified.module}:{}) },
    });
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const failed = new Promise<never>((_, reject) => {
      rejectStartup=reject;
      startupTimer = setTimeout(
        () =>
          reject(
            new Error(
              "DOS 시작 시간이 초과되었습니다. ZIP 구성과 브라우저 메모리를 확인하세요.",
            ),
          ),
        30000,
      );
      worker.onerror = (e) => {
        this.runtimeErrors.record('parent-error',{name:e.error?.name,message:e.message,stack:e.error?.stack,filename:e.filename,lineno:e.lineno,colno:e.colno});
        const message=`DOS Worker 오류: ${diagnosticText(e.message,2048)}`;
        this.observation.error(message);this.log(message);
        reject(new Error(message));
      };
    });
    const ci = (this.ci = await Promise.race([
      window.emulators.backend([bundle], transport),
      failed,
    ]).finally(() => clearTimeout(startupTimer)));
    const context = this.canvas.getContext("2d", { alpha: false })!;
    const resize = (w: number, h: number) => {
      if (w < 1 || h < 1) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.frame = context.createImageData(w, h);
    };
    resize(ci.width(), ci.height());
    ci.events().onFrameSize(resize);
    ci.events().onFrame((rgb, rgba) => {
      if (!this.frame) return;
      const sample=this.performanceWindow?.active?this.performanceWindow:undefined;
      const drawStart=sample?performance.now():0;
      const dst = this.frame.data;
      if (rgba) dst.set(rgba);
      else if (rgb)
        for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
          dst[j] = rgb[i];
          dst[j + 1] = rgb[i + 1];
          dst[j + 2] = rgb[i + 2];
          dst[j + 3] = 255;
        }
      context.putImageData(this.frame, 0, 0);
      this.metrics.frames++;
      if(sample){
        sample.frame(performance.now()-drawStart,this.frameSentAt===undefined?undefined:performance.timeOrigin+performance.now()-this.frameSentAt);
        if(!this.paintPending){this.paintPending=true;requestAnimationFrame(()=>{this.paintPending=false;if(sample===this.performanceWindow)sample.paint();});}
      }
      this.frameSentAt=undefined;
    });
    ci.events().onStdout(message=>{this.stdout?.(message);this.log(message);});
    ci.events().onMessage((type, ...args) => {
      this.log(`${type}: ${args.join(" ")}`);
    });
    ci.events().onSoundPush((samples) => {
      const sample=this.performanceWindow?.active?this.performanceWindow:undefined;
      const audioStart=sample?performance.now():0;
      try {
      this.metrics.audioSamples += samples.length;
      if (samples.some((value) => Math.abs(value) > 0.001))
        this.canvas.dataset.audioSignal = "true";
      this.canvas.dataset.audioState = this.audio?.state ?? "closed";
      const audio = this.audio;
      if (
        !audio ||
        audio.state !== "running" ||
        this.paused ||
        samples.length < 2
      )
        return;
      const buffer=emulatorAudioBuffer(audio,samples,ci.soundFrequency(),this.artifact.id==='phase9-7');
      this.audioOutput.sourceRate=ci.soundFrequency();this.audioOutput.blocks++;
      this.audioOutput.inputFrames+=samples.length;this.audioOutput.scheduledFrames+=buffer.length;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      if (
        this.nextAudio < audio.currentTime ||
        this.nextAudio > audio.currentTime + 0.25
      )
        {this.nextAudio = audio.currentTime + 0.025;this.audioOutput.resyncs++;}
      source.start(this.nextAudio);
      this.nextAudio += buffer.duration;
      } finally {sample?.audio(performance.now()-audioStart,samples.length);}
    });
    // The first text frame can precede onFrame registration.
    const initial = await ci.screenshot();
    context.putImageData(initial, 0, 0);
    this.log("DOS 엔진 연결 완료");
  }
  async refreshAudioDiagnostics(){
    if(this.artifact.id!=='phase9-7'||!this.worker)return;
    if(this.rawPending)return this.rawPending;
    this.rawPending=new Promise<void>(resolve=>{
      const id=++this.rawRequest;
      const finish=()=>{clearTimeout(timer);this.rawReply=undefined;this.rawPending=undefined;resolve();};
      const timer=setTimeout(()=>{this.rawObservation={source:'query-timeout-not-current',capturedAtMs:this.rawObservation.capturedAtMs};finish();},1500);
      this.rawReply=finish;this.worker!.postMessage({name:'ed4-audio-status',id});
    });
    return this.rawPending;
  }
  async measurePerformance() {
    if(!this.ci)throw Error('게임 메뉴에 진입한 뒤 측정하세요.');
    if(this.performanceWindow?.active)throw Error('성능 측정이 진행 중입니다.');
    const sample=this.performanceWindow=new PerformanceWindow(),id=++this.performanceId;
    const native=this.artifact.id==='phase9-6'||this.artifact.id==='phase9-7';
    sample.start(performance.now());this.frameSentAt=undefined;
    const visibility=()=>{if(document.hidden)sample.invalidate('hidden');};visibility();
    document.addEventListener('visibilitychange',visibility);
    if(native)this.worker?.postMessage({name:'ed4-perf-start',id});
    await new Promise<void>(resolve=>{
      const poll=native?setInterval(()=>this.worker?.postMessage({name:'ed4-perf-poll',id}),1000):undefined;
      const finish=(stopped=false)=>{clearTimeout(timer);clearInterval(poll);if(stopped)sample.invalidate('stopped');sample.finish(performance.now());
        if(native)this.worker?.postMessage({name:'ed4-perf-stop',id});document.removeEventListener('visibilitychange',visibility);this.performanceEnd=undefined;resolve();};
      const timer=setTimeout(()=>finish(),30000);this.performanceEnd=()=>finish(true);
    });
    return sample.report();
  }
  key(code: number, pressed: boolean) {
    if (!this.ci || this.paused) return;
    if (pressed) this.pressed.add(code);
    else this.pressed.delete(code);
    this.ci.sendKeyEvent(code, pressed);
  }
  releaseKeys() {
    for (const code of this.pressed) this.ci?.sendKeyEvent(code, false);
    this.pressed.clear();
  }
  pause(value: boolean) {
    if(value)this.performanceWindow?.invalidate('paused');
    this.releaseKeys();
    this.paused = value;
    if (value) {
      this.ci?.pause();
      void this.audio?.suspend();
    } else {
      this.ci?.resume();
      void this.audio?.resume();
    }
    this.nextAudio = 0;
  }
  async save(): Promise<Snapshot> {
    if(this.experimental)throw Error('실험 진단의 변경분은 저장하지 않습니다. 기존 세이브는 유지됩니다.');
    if (!this.ci) throw new Error("실행 중인 DOS 세션이 없습니다.");
    this.snapshotInfo = undefined;
    this.snapshotError = undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const zip = await Promise.race([
      this.ci.persist(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("DOS 저장 응답 시간 초과. 기존 저장을 유지합니다."),
            ),
          15000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    const info = this.snapshotInfo as
      | {
          paths: string[];
          bytes: number;
          elapsedMs: number;
          wasmHeapBytes: number;
        }
      | undefined;
    if (this.snapshotError || !info)
      throw new Error(
        `DOS 파일 목록을 확인할 수 없어 저장을 중단했습니다: ${this.snapshotError ?? "목록 누락"}`,
      );
    const files = zip.length <= 22 ? {} : readZip(zip, true);
    for (const path of Object.keys(files))
      if (path.startsWith(".JSDOS/")) delete files[path];
    return {
      files,
      presentPaths: info.paths,
      measurement: {
        stage: "DOS snapshot",
        elapsedMs: info.elapsedMs,
        logicalBytes: info.bytes,
        wasmHeapBytes: info.wasmHeapBytes,
        note: "실측: 파일 목록의 바이트 합과 WASM 선형 메모리. 브라우저 전체 RSS가 아님.",
      },
    };
  }
  async stop() {
    this.performanceEnd?.();
    this.releaseKeys();
    if (this.ci) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.ci.exit(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.log("종료 응답 지연: 저장 완료된 DOS Worker를 정리했습니다.");
            resolve();
          }, 1200);
        }),
      ]).finally(() => clearTimeout(timer));
    }
    this.worker?.terminate();
    this.observation.stopped();
    this.worker = undefined;
    this.ci = undefined;
    await this.audio?.close();
    this.audio = undefined;
    this.gain = undefined;
  }
}
