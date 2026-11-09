// Read-only observations from the existing js-dos protocol. No debugger, DOS
// commands, filesystem reads or patches to the emulator/game are injected.
interface LogEvent { sequence:number; atMs:number; channel:string; tag:string; message:string }
interface ExecRequest { sequence:number; atMs:number; program:string; mode:number; framesAtRequest:number; audioPacketsAtRequest:number }
const safeText=(text:string)=>text.replace(/[A-Z]:[\\/]Users[\\/][^\s"']+/gi,'[host-path]').slice(0,1024);
export class DosObservation {
  private start=performance.now();
  private sequence=0;
  private logs:LogEvent[]=[];
  private stdout:LogEvent[]=[];
  private requests:ExecRequest[]=[];
  private frames=0;
  private audioPackets=0;
  private lastMessageAtMs:number|null=null;
  private lastFrameAtMs:number|null=null;
  private lastAudioAtMs:number|null=null;
  private lastStdoutAtMs:number|null=null;
  private state:'starting'|'running'|'exited'|'worker-error'|'stopped'='starting';
  private workerError?:string;
  private droppedLogs=0;
  private droppedRequests=0;
  observe(name:string,props:{tag?:unknown;message?:unknown}={}) {
    const atMs=performance.now()-this.start,sequence=++this.sequence;
    this.lastMessageAtMs=atMs;
    if(name==='ws-update-lines'){this.frames++;this.lastFrameAtMs=atMs;}
    if(name==='ws-sound-push'){this.audioPackets++;this.lastAudioAtMs=atMs;}
    if(name==='ws-ready')this.state='running';
    if(name==='ws-exit')this.state='exited';
    if(!['ws-log','ws-warn','ws-err','ws-stdout'].includes(name)||typeof props.message!=='string')return;
    const tag=typeof props.tag==='string'?safeText(props.tag):'';
    const event={sequence,atMs,channel:name,tag,message:safeText(props.message)};
    if(name==='ws-stdout'){
      this.lastStdoutAtMs=atMs;this.stdout.push(event);if(this.stdout.length>32)this.stdout.shift();
      return; // Never mistake text printed by a DOS program for engine evidence.
    }
    this.logs.push(event);if(this.logs.length>128){this.logs.shift();this.droppedLogs++;}
    // emulators 0.73.8 dos.cpp INT 21h/4Bh logs BEFORE DOS_Execute. This is
    // an EXEC request, including nested requests; it is NOT a successful load.
    const match=tag==='LOG_EXEC'?props.message.match(/^Execute ([^\r\n]+) (\d+)\s*$/):null;
    if(match){
      this.requests.push({sequence,atMs,program:safeText(match[1]),mode:Number(match[2]),framesAtRequest:this.frames,audioPacketsAtRequest:this.audioPackets});
      if(this.requests.length>128){this.requests.shift();this.droppedRequests++;}
    }
  }
  error(message:string){this.workerError=safeText(message);this.state='worker-error';}
  stopped(){this.state='stopped';}
  latestProgram(){return this.requests.at(-1)?.program;}
  report(){
    const now=performance.now()-this.start,latest=this.requests.at(-1);
    return {state:this.state,workerError:this.workerError,capturedAtMs:now,
      requests:[...this.requests],latestRequest:latest,
      sinceLatestRequest:latest?{elapsedMs:now-latest.atMs,framePackets:this.frames-latest.framesAtRequest,audioPackets:this.audioPackets-latest.audioPacketsAtRequest,
        logs:this.logs.filter(e=>e.sequence>latest.sequence),stdout:this.stdout.filter(e=>e.sequence>latest.sequence)}:undefined,
      recentLogs:[...this.logs],recentStdout:[...this.stdout],droppedLogs:this.droppedLogs,droppedRequests:this.droppedRequests,
      lastMessageAtMs:this.lastMessageAtMs,lastFrameAtMs:this.lastFrameAtMs,lastAudioAtMs:this.lastAudioAtMs,lastStdoutAtMs:this.lastStdoutAtMs,
      messageSilenceMs:this.lastMessageAtMs===null?null:now-this.lastMessageAtMs,
      note:'LOG_EXEC Execute는 DOS 실행 요청 관측이며 로딩 성공·자식 관계·게임 정상 실행을 증명하지 않습니다. mode 0=load/execute, 1=load only, 3=overlay. LOG_EXEC의 ws-err도 실행 요청 로그일 수 있습니다. ws-stdout은 NUL 쓰기 전에도 전달되어 화면에 없는 출력이 포함될 수 있습니다. 프레임/오디오 패킷은 게임 진행 또는 실제 소리의 증거가 아닙니다. 로그 부재도 실행 안 됨의 증거가 아닙니다.'};
  }
}
