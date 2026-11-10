import {SpeedControl,type Speed} from './speed-control';
import {SpeedAudio} from './speed-audio';
import {PHASE98H_WORKER} from './generated/phase9-8h-worker';
import { PHASE98F_WORKER } from './generated/phase9-8f-worker';
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
import { bgmDiagnostics } from './bgm-diagnostics';
import { AudioStartup,audioSchedule } from "./audio-startup";
import { PHASE98D_WORKER } from "./generated/phase9-8d-worker";
import { PHASE98C_WORKER } from './generated/phase9-8c-worker';
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
  private speed?:SpeedControl;
  private speedAudio?:SpeedAudio;
  private speedTimer?:ReturnType<typeof setInterval>;
  private speedFault:string|null=null;
  private speedRecovery=false;
  private speedRecoveryCount=0;
  private lastNativeUnderflows=0;
  private stopping=false;
  private audioResuming=false;
  private audioResumeEpoch=0;
  speedState(){return {supported:this.artifact.id==='phase9-8h'&&this.engineReady&&!this.stopping,rate:this.speed?.rate??1,verified:this.speed?.verified??false,pending:!!this.speed?.busy||this.speedRecovery||this.audioResuming,fault:this.speedFault,recoveries:this.speedRecoveryCount};}
  async setSpeed(rate:Speed){
    if(!this.speedState().supported||!this.speed||this.speedFault||this.paused)throw Error('Phase 9-8H 실행 중에만 속도를 바꿀 수 있습니다.');
    if(this.speed.busy||this.speedRecovery)throw Error('속도 응답 대기 중입니다.');
    try{const ack=await this.speed.request('set',rate);if(ack.rate!==rate)throw Error('요청/확인 배속 불일치');this.speedAudio?.setRate(ack.rate);this.speedAudio?.resetHealth();this.speedChanged?.();}
    catch(e){await this.recoverSpeed(String(e));throw e;}
  }
  private async recoverSpeed(reason:string,fatal=false){
    if(!this.speed||this.stopping||this.speedRecovery||this.speedFault)return;
    this.speedRecovery=true;this.speedRecoveryCount++;this.speedChanged?.();
    this.speed.cancel('1× 복구를 위해 이전 요청을 취소했습니다.');
    this.log('배속 실험 문제: '+reason+' · native 1× 복구를 확인합니다.');
    try{const ack=await this.speed.request('set',1);if(ack.rate!==1)throw Error('1× 복구 불일치');this.speedAudio?.setRate(1);this.speedAudio?.resetHealth();
      // Drain existing audio without dropping samples; do not run the guest ahead
      // while a long queue returns to 1x. Never substitute silence or another engine.
      if(!fatal&&this.speedAudio&&this.speedAudio.report().queueAheadMs>150){
        this.ci?.pause();
        await new Promise(r=>setTimeout(r,Math.min(1000,this.speedAudio!.report().queueAheadMs)));
        if(this.speedAudio.report().queueAheadMs>150)throw Error('오디오 큐 복구 미확인');
        if(!this.paused&&!this.stopping)this.ci?.resume();
      }
      this.log('native 1× 복구 확인. '+(fatal?'게임 오류는 복구되지 않았습니다. 진단을 종료하세요.':'이 세션에서는 2×를 다시 켜지 말고 진단을 확인하세요.'));
      this.speedFault=reason+' · 1× 복구 확인'+(fatal?' · 실험 사용을 중단하고 진단 종료하세요.':' · 배속 전환 제한');
    }catch(e){this.speedFault=reason+' · 1× 복구 확인 실패: '+String(e)+' · 실험 사용을 중단하고 진단 종료하세요.';this.log(this.speedFault);this.speed.verified=false;}
    finally{this.speedRecovery=false;this.speedChanged?.();}
  }
  private async pollSpeed(){
    if(!this.speed||this.speed.busy||this.speedRecovery||this.stopping||this.paused||this.speedFault)return;
    try{const ack=await this.speed.request('status');
      if(ack.rate!==this.speedAudio?.rate)throw Error('native/WebAudio 배속 불일치');
      const issue=this.speedAudio?.problem(),nativeIssue=ack.audioUnderflows>this.lastNativeUnderflows+2||ack.audioClamps>0;this.lastNativeUnderflows=ack.audioUnderflows;
      if(issue||nativeIssue)await this.recoverSpeed(issue??'native 오디오 버퍼 부족/상한 초과');
    }catch(e){await this.recoverSpeed(String(e));}
  }
  private ci?: CommandInterface;
  private audio?: AudioContext;
  private gain?: GainNode;
  private nextAudio = 0;
  private audioOutput={sourceRate:0,blocks:0,inputFrames:0,scheduledFrames:0,resyncs:0};
  private rawObservation={source:'not-sampled',capturedAtMs:null as number|null};
  private audioStartup=new AudioStartup();
  private bgmReport:any={source:'not-sampled',ownership:'unknown'};
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
      identity:{requestedEngine:this.artifact.id,actualEngine:this.engineReady?this.artifact.id:null,status:this.engineReady?'verified':'not-ready',basis:this.artifact.worker?'verified WASM and pinned Worker bootstrap, backend ready':'fixed stable backend ready; release hash is pinned, not runtime measurement'},
      ...this.metrics,
      integratedSpeed:this.speed?{...this.speedState(),control:this.speed.report(),audio:this.speedAudio?.report()}:undefined,
      performanceWindow:this.performanceWindow?.report(),
      averageFps:
        this.metrics.frames /
        Math.max(1, (performance.now() - this.startedAt) / 1000),
      audioState: this.audio?.state ?? "closed",
      audioStartup:(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))?this.audioStartup.report():undefined,
      audioOutput:{...this.audioOutput,contextRate:this.audio?.sampleRate??null,
        adapter:(this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))))?'mono-v1':'legacy-interleaved-stereo',
        sourceChannels:1,outputBufferChannels:(this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))))?1:2,
        runtimeEngine:this.artifact.id==='phase9-7'?'phase9-6':this.artifact.id,
        deviceUsage:'unobserved: mixed stream cannot distinguish OPL/PCM',
        baseLatency:this.audio?.baseLatency??null,outputLatency:this.audio?.outputLatency??null},
      paused: this.paused,
      music: this.musicMetrics,
      musicObservation:{...this.rawObservation},
      bgmCommands:(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h')))?this.bgmReport:undefined,
      execution: this.observation.report(),
      runtimeErrors:this.runtimeErrors.report(),
      artifact:{...this.artifact},
      reboot:this.reboot.report(),
      cpuHistory:(this.artifact.id==='phase9-6'||(this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h')))))?{enabled:false,reason:'Instruction history compiled out; rare reboot/EXEC events retained.'}:(this.artifact.id==='phase9-4'||this.artifact.id==='phase9-5b')?this.firstAnomaly.report():this.cpuHistory.report(),
      resolution: {width:this.canvas.width,height:this.canvas.height},
      note: "FPS is callback count / session wall time, including pauses; not a GPU timing measurement",
    };
  }
  private engineReady=false;
  constructor(
    private canvas: HTMLCanvasElement,
    private log: (text: string) => void,
    private stdout?: (text:string)=>void,
    private speedChanged?:()=>void,
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
    this.stopping=false;this.speedFault=null;this.speedRecovery=false;this.speedRecoveryCount=0;
    this.startedAt = performance.now();
    this.audioStartup=new AudioStartup();
    this.audioStartup.state(0,this.audio?.state??"closed");
    if(this.audio)this.audio.onstatechange=()=>this.audioStartup.state(performance.now()-this.startedAt,this.audio?.state??"closed");
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
      if(!['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6','phase9-7','phase9-8c','phase9-8d','phase9-8f','phase9-8h'].includes(experiment.id)||experiment.discardWrites!==true)throw Error('실험 엔진은 저장하지 않는 일회성 진단에서만 사용할 수 있습니다.');
      this.experimental=true;
      this.artifact={...this.artifact,id:experiment.id,wasmSha256:undefined,expectedSha256:experimentalEngine(experiment.id).wasmSha256,verification:'not-yet-verified'};
      try{verified=await prepareRebootEngine(experiment.id);}
      catch(e){this.runtimeErrors.record('experimental-engine-load',{name:'Error',message:String(e)});throw e;}
      this.artifact={...this.artifact,wasmSha256:verified.sha256,verification:'sha256-of-compiled-module'};
    }
    this.rawObservation={source:'not-sampled',capturedAtMs:null};
    this.bgmReport={source:'not-sampled',ownership:'unknown'};
    this.musicMetrics={reads:0,bytes:0,largestRead:0,mounted:music.length};
    await loadEmulator();
    const pinnedWorker=experiment?.id==='phase9-8h'?PHASE98H_WORKER:experiment?.id==='phase9-8f'?PHASE98F_WORKER:experiment?.id==='phase9-8d'?PHASE98D_WORKER:experiment?.id==='phase9-8c'?PHASE98C_WORKER:experiment?.id==='phase9-7'?PHASE97_WORKER:experiment?.id==='phase9-6'?PHASE96_WORKER:experiment?.id==='phase9-5b'?PHASE95B_WORKER:experiment?.id==='phase9-4'?PHASE94_WORKER:experiment?.id==='phase9-3'?PHASE93_WORKER:undefined;
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
      if(event.data?.name==='ed4-speed-response'){this.speed?.accept(event.data.props);return;}
      if(event.data?.name==='ed4-audio-status'){
        const p=event.data.props;
        if((this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))))&&this.rawReply&&p?.id===this.rawRequest&&['reads','bytes','largestRead','mounted'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)){
          this.musicMetrics={reads:p.reads,bytes:p.bytes,largestRead:p.largestRead,mounted:p.mounted};
          if((this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))))this.bgmReport=bgmDiagnostics(p.bgm);
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
        if(this.engineReady)void this.recoverSpeed(message,true);
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
        if(this.engineReady)void this.recoverSpeed(message,true);
        reject(new Error(message));
      };
    });
    const ci = (this.ci = await Promise.race([
      window.emulators.backend([bundle], transport),
      failed,
    ]).finally(() => clearTimeout(startupTimer)));
    if(pinnedWorker&&this.artifact.worker?.bootstrap!=='ready')throw Error('선택 엔진의 Worker 무결성 확인이 완료되지 않았습니다. 안정 엔진으로 대체하지 않습니다.');
    this.engineReady=true;
    if(experiment?.id==='phase9-8h'){
      if(!this.audio||!this.gain)throw Error('오디오 활성화 후 H 실험을 시작하세요.');
      this.speedAudio=new SpeedAudio(this.audio,this.gain);
      this.speed=new SpeedControl(message=>worker.postMessage(message),()=>this.speedChanged?.());
      const ack=await this.speed.request('set',1);if(ack.rate!==1)throw Error('초기1× 확인 실패');
      this.speedTimer=setInterval(()=>void this.pollSpeed(),1000);
    }
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
      const observeAudio=(scheduledAt:number|null,queueEnd:number)=>{if((this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h')))this.audioStartup.observe(samples,{atMs:performance.now()-this.startedAt,contextTime:audio?.currentTime??0,rate:ci.soundFrequency(),scheduledAt,queueEnd,state:audio?.state??"closed",program:this.observation.latestProgram()});};
      if (
        !audio ||
        (!this.speedAudio&&(audio.state !== "running"||this.paused)) ||
        samples.length < 2
      ){observeAudio(null,this.nextAudio);return;}
      const buffer=emulatorAudioBuffer(audio,samples,ci.soundFrequency(),(this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h')))));
      this.audioOutput.sourceRate=ci.soundFrequency();this.audioOutput.blocks++;
      this.audioOutput.inputFrames+=samples.length;this.audioOutput.scheduledFrames+=buffer.length;
      if(this.speedAudio){
        if(audio.state!=="running"&&!this.paused)void this.recoverSpeed("오디오 시계가 중단되었습니다. 오디오 재개 상태를 확인하세요.");
        const schedule=this.speedAudio.push(buffer);this.nextAudio=schedule.next;observeAudio(schedule.at,schedule.previous);
        if(schedule.audibleStarved&&this.speedAudio.rate===2&&!this.paused)void this.recoverSpeed('2× 오디오 공급 지연 관측: 현재 CPU 부하에서 연속 재생을 유지하지 못했습니다.');
        return;
      }
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      const queueEnd=this.nextAudio;
      if((this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))){
        // Never schedule over audio already queued. Only repair a late queue.
        const schedule=audioSchedule(this.nextAudio,audio.currentTime,buffer.duration);
        if(schedule.resync)this.audioOutput.resyncs++;
        observeAudio(schedule.at,queueEnd);source.start(schedule.at);this.nextAudio=schedule.next;
      }else{
        if(this.nextAudio<audio.currentTime||this.nextAudio>audio.currentTime+.25){this.nextAudio=audio.currentTime+.025;this.audioOutput.resyncs++;}
        source.start(this.nextAudio);this.nextAudio+=buffer.duration;
      }
      } catch(e){if(this.speedAudio)void this.recoverSpeed(String(e),true);else throw e;} finally {sample?.audio(performance.now()-audioStart,samples.length);}
    });
    // The first text frame can precede onFrame registration.
    const initial = await ci.screenshot();
    context.putImageData(initial, 0, 0);
    this.log("DOS 엔진 연결 완료");
  }
  async refreshAudioDiagnostics(){
    if(!['phase9-7','phase9-8c','phase9-8d','phase9-8f','phase9-8h'].includes(this.artifact.id)||!this.worker)return;
    if(this.rawPending)return this.rawPending;
    this.rawPending=new Promise<void>(resolve=>{
      const id=++this.rawRequest;
      const finish=()=>{clearTimeout(timer);this.rawReply=undefined;this.rawPending=undefined;resolve();};
      const timer=setTimeout(()=>{if((this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))))this.bgmReport={...this.bgmReport,source:'query-timeout-not-current'};this.rawObservation={source:'query-timeout-not-current',capturedAtMs:this.rawObservation.capturedAtMs};finish();},1500);
      this.rawReply=finish;this.worker!.postMessage({name:'ed4-audio-status',id});
    });
    return this.rawPending;
  }
  async measurePerformance() {
    if(!this.ci)throw Error('게임 메뉴에 진입한 뒤 측정하세요.');
    if(this.performanceWindow?.active)throw Error('성능 측정이 진행 중입니다.');
    const sample=this.performanceWindow=new PerformanceWindow(),id=++this.performanceId;
    const native=this.artifact.id==='phase9-6'||(this.artifact.id==='phase9-7'||(this.artifact.id==='phase9-8c'||(this.artifact.id==='phase9-8d'||(this.artifact.id==='phase9-8f'||this.artifact.id==='phase9-8h'))));
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
    const epoch=++this.audioResumeEpoch;
    if(this.speedAudio&&!value){
      // AudioContext.resume is asynchronous. Keep guest paused until its clock runs.
      this.audioResuming=true;this.speedChanged?.();
      void this.audio?.resume().then(()=>{
        if(this.stopping||epoch!==this.audioResumeEpoch)return;
        this.paused=false;this.audioResuming=false;this.ci?.resume();this.speedChanged?.();
      }).catch(e=>{this.audioResuming=false;void this.recoverSpeed('오디오 재개 실패: '+String(e),true);});
      return;
    }
    this.audioResuming=false;
    this.paused = value;
    if (value) {
      this.ci?.pause();
      void this.audio?.suspend();
    } else {
      this.ci?.resume();
      void this.audio?.resume();
    }
    if(!this.speedAudio)this.nextAudio = 0;
    this.speedChanged?.();
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
    this.stopping=true;this.speedChanged?.();
    clearInterval(this.speedTimer);this.speedTimer=undefined;
    if(this.speed&&!this.speed.closed){this.speed.cancel('진단 종료');try{const ack=await this.speed.request('set',1);this.speedAudio?.setRate(ack.rate);}catch(e){this.log('종료 전1× 확인 실패: '+String(e)+' · Worker 폐기 후 다음 실행은 새1×로 시작합니다.');}}
    this.stopping=true;this.engineReady=false;this.speed?.close();this.speedAudio?.dispose();this.speedChanged?.();
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
