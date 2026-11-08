// Timings contain counters only: never game bytes, host paths or file contents.
export const stageLabels = {
  index: 'ZIP 목록 분석', read: '파일 읽기', inflate: '압축 해제', crc: 'CRC 검증',
  fileSha: '파일 SHA-256', zipSha: 'ZIP SHA-256', opfs: 'OPFS 저장',
  space: '저장 공간 확인', finalize: '파일 목록 확정', musicDb: '음악 IndexedDB 확정',
  profileDb: '게임·프로필 IndexedDB 확정',
} as const;
export type ImportStage = keyof typeof stageLabels;
export interface StageMetric { calls: number; bytes: number; ms: number; maxMs: number }
export interface ImportTraceData {
  source: 'zip' | 'folder'; startedAt: string; elapsedMs: number;
  stage?: ImportStage; pending: boolean; fileIndex: number;
  completedBytes: number; totalBytes: number;
  stages: Partial<Record<ImportStage, StageMetric>>;
  status: 'working' | 'staged' | 'committed' | 'failed' | 'cancelled';
  maxResponseGapMs: number; error?: string; visibility?: string;
  maxProgressGapMs?: number;
  visibilityChanges?: {state:string;elapsedMs:number}[];
  failure?: 'timeout'|'quota'|'crc'|'cancelled'|'other';
  buffers?: { coreBytes:number; maxConsumeChunk:number; maxInflateOutput:number };
}
export class ImportMeter {
  readonly data: ImportTraceData;
  private start = performance.now();
  private lastPost = -Infinity;
  constructor(source: 'zip' | 'folder', private emit: (data: ImportTraceData) => void,
    private operation?: (stage:ImportStage)=>void) {
    this.data = {source, startedAt:new Date().toISOString(), elapsedMs:0, pending:false, fileIndex:0,
      completedBytes:0,totalBytes:0,stages:{},status:'working',maxResponseGapMs:0};
  }
  publish(force=false) {
    const now=performance.now();
    if (!force && now-this.lastPost<200) return;
    this.data.elapsedMs=now-this.start; this.lastPost=now;
    this.emit(structuredClone(this.data));
  }
  begin(stage: ImportStage) { this.data.stage=stage; this.data.pending=true; this.operation?.(stage);this.publish(); return performance.now(); }
  end(stage: ImportStage, start: number, bytes=0) {
    const ms=performance.now()-start;
    const m=this.data.stages[stage] ??= {calls:0,bytes:0,ms:0,maxMs:0};
    m.calls++;m.bytes+=bytes;m.ms+=ms;m.maxMs=Math.max(m.maxMs,ms);
    this.data.stage=stage;this.data.pending=false;this.publish();
  }
  sync<T>(stage: ImportStage, bytes: number, action:()=>T):T {
    const t=this.begin(stage); const value=action(); this.end(stage,t,bytes);return value;
  }
  async async<T>(stage: ImportStage, bytes: number, action:()=>Promise<T>):Promise<T> {
    const t=this.begin(stage);
    // One pending-operation report, not a periodic fake liveness heartbeat.
    const timer=setTimeout(()=>this.publish(true),250);
    try { const value=await action();this.end(stage,t,bytes);return value; }
    finally { clearTimeout(timer); }
  }
}
export const IMPORT_SILENCE_MS=60000; // unchanged; actual work messages only, no heartbeat resets
let latest: ImportTraceData | undefined;
let lastPersist=0;
export function rememberImport(data: ImportTraceData, force=false) {
  latest=structuredClone(data);
  if(force || performance.now()-lastPersist>1000) {
    lastPersist=performance.now();
    try { localStorage.setItem('ed4-import-trace-v1',JSON.stringify(latest)); } catch { /* diagnostics cannot break an import */ }
  }
}
export function importTrace() {
  if(latest) return structuredClone(latest);
  try { return JSON.parse(localStorage.getItem('ed4-import-trace-v1') ?? 'null') as ImportTraceData | null; } catch { return null; }
}
export function failImport(error:unknown) {
  const d=importTrace();if(!d)return;
  d.status=error instanceof DOMException && error.name==='AbortError'?'cancelled':'failed';
  // Caller error messages may contain a local filename; exported diagnostic uses category only.
  d.error=error instanceof Error?error.name:'Error';rememberImport(d,true);
  const message=error instanceof Error?error.message:'';
  d.failure=d.status==='cancelled'?'cancelled':/시간 초과/.test(message)?'timeout':/CRC/.test(message)?'crc':error instanceof DOMException && error.name==='QuotaExceededError'?'quota':'other';
  rememberImport(d,true);
}
export function importOperation(stage:ImportStage,fileIndex?:number) {
  if(latest){latest.stage=stage;latest.pending=true;if(fileIndex!==undefined)latest.fileIndex=fileIndex;}
}
export async function importCommit<T>(stage:'musicDb'|'profileDb',action:()=>Promise<T>):Promise<T> {
  const d=importTrace(), start=performance.now();
  if(d){d.stage=stage;d.pending=true;rememberImport(d,true);}
  try {
    const value=await action();
    if(d){const ms=performance.now()-start;d.stages[stage]={calls:1,bytes:0,ms,maxMs:ms};d.pending=false;d.elapsedMs+=ms;
      d.status=stage==='profileDb'?'committed':'staged';rememberImport(d,true);}
    return value;
  }catch(error){failImport(error);throw error;}
}
export function timeoutMessage(d:ImportTraceData | null | undefined) {
  return `파일 등록 응답 시간 초과: ${d?.stage?stageLabels[d.stage]:'Worker 시작'} (${d?.pending?'완료 응답 없음':'마지막 관측 단계'}). 기존 데이터는 유지됩니다. 등록 진단 JSON을 저장하고 폴더 등록을 사용하세요.`;
}
