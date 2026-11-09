import {BUILD} from './launcher-update';
export const SCENES=['타이틀','필드','전투','복귀'] as const;
export const SCENE_LIMITS={snapshots:16,events:2048,durationMs:2*60*60*1000,jsonBytes:8*1024*1024,pollMs:10000};
const counter=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
export function sceneCounters(d:any){const b=d?.bgmCommands;return {int66:counter(b?.int66Calls),int69:counter(b?.int69Calls),rawReads:counter(b?.rawReads),rawBytes:counter(d?.music?.bytes),recorded:counter(b?.totalRecorded),...Object.fromEntries(Object.entries(b?.commands??{}).map(([k,v])=>['int66_'+k,counter(v)]))};}
export function counterDelta(now:Record<string,number|null>,previous?:Record<string,number|null>){return Object.fromEntries(Object.entries(now).map(([k,v])=>[k,v===null||previous?.[k]==null||v<previous[k]! ?null:v-previous[k]!]));}
// Inputs come only from the engine's validated metadata reports, never files or PCM.
function select(d:any){return structuredClone(Object.fromEntries(['artifact','identity','audioState','audioOutput','audioStartup','bgmCommands','music','musicObservation','runtimeErrors','resolution','frames','paused'].filter(k=>d?.[k]!==undefined).map(k=>[k,d[k]])));}
export class SceneSession{
 readonly id=crypto.randomUUID();readonly startedAt=new Date().toISOString();readonly started=performance.now();
 readonly snapshots:any[]=[];private first:any[]=[];private tail:any[]=[];private lastSequence=0;private previous?:Record<string,number|null>;
 private latest:any;private startup:any;private endedAt?:string;private gaps=0;private discarded=0;private polls=0;private queryMs=0;private limit=false;
 constructor(readonly requestedEngine:string){}
 get expired(){return performance.now()-this.started>SCENE_LIMITS.durationMs;}
 observe(d:any,queryMs=0){
  if(this.endedAt||this.expired){this.limit=true;return;}
  const value=select(d);this.latest=value;this.polls++;this.queryMs+=queryMs;
  if(value.audioStartup)this.startup=value.audioStartup;
  if(value.bgmCommands?.source!=='live-worker-query')return;
  const events=[...(value.bgmCommands.events??[])].sort((a,b)=>a.sequence-b.sequence);
  for(const event of events){
   if(event.sequence<=this.lastSequence)continue;
   if(event.sequence>this.lastSequence+1)this.gaps+=event.sequence-this.lastSequence-1;
   this.lastSequence=event.sequence;
   if(this.first.length<32)this.first.push(event);else {this.tail.push(event);if(this.tail.length>SCENE_LIMITS.events-32){this.tail.shift();this.discarded++;}}
  }
 }
 capture(scene:string,d:any,queryMs=0){
  if(!SCENES.includes(scene as any))throw Error('지원하지 않는 장면입니다.');
  if(this.endedAt)throw Error('종료된 세션입니다. 기존 기록은 다운로드할 수 있습니다.');
  if(this.expired||this.snapshots.length>=SCENE_LIMITS.snapshots)throw Error('진단 수집 상한에 도달했습니다. 기존 기록을 다운로드하세요. 게임은 계속 실행됩니다.');
  this.observe(d,queryMs);
  const counters=sceneCounters(d),current=d?.bgmCommands?.source==='live-worker-query';
  const actual=d?.identity?.actualEngine??null;
  if(actual&&actual!==this.requestedEngine)throw Error(`엔진 불일치: 선택 ${this.requestedEngine} / 실제 ${actual}. 요청한 엔진 계측 결과로 사용할 수 없습니다.`);
  const snapshot={sessionId:this.id,build:BUILD,requestedEngine:this.requestedEngine,actualEngine:actual,identityVerified:d?.identity?.status==='verified',scene,capturedAt:new Date().toISOString(),elapsedMs:performance.now()-this.started,
   metadata:select(d),counters,delta:current?counterDelta(counters,this.previous):null,counterReset:current&&!!this.previous&&Object.entries(counters).some(([k,v])=>v!==null&&this.previous![k]!==null&&v<this.previous![k]!),
   freshness:current?'live-worker-query':'unavailable-or-stale',loss:{nativeOverwritten:d?.bgmCommands?.overwritten??null,unobservedSequenceCount:this.gaps,hostDiscarded:this.discarded},audioStartupScope:'Session first 60 seconds only; not this scene audio. Later scenes use audioOutput.'};
  this.snapshots.push(snapshot);if(current)this.previous=counters;return snapshot;
 }
 end(){this.endedAt=new Date().toISOString();}
 report(){return {format:'ed4-scene-diagnostics',version:1,sessionId:this.id,startedAt:this.startedAt,endedAt:this.endedAt,build:BUILD,requestedEngine:this.requestedEngine,snapshots:this.snapshots,
  eventArchive:{first:this.first,recent:this.tail,lastSequence:this.lastSequence,unobservedSequenceCount:this.gaps,hostDiscarded:this.discarded},audioStartup:this.startup,latest:this.latest,
  collection:{polls:this.polls,queryWaitMs:this.queryMs,limitReached:this.limit||this.expired,limits:SCENE_LIMITS},
  limitations:['INT66/69 are requests, not verified BGM ownership or playback success.','Batched queries may miss overwritten events; missing history is never reconstructed.','Android download completion and Galaxy playback must be checked on device.']};}
 serialize(){const text=JSON.stringify(this.report(),null,2);if(new TextEncoder().encode(text).length>SCENE_LIMITS.jsonBytes)throw Error('진단 JSON 크기 상한 초과. 수집 기록은 유지됩니다.');return text;}
}
