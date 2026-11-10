// Summarize two explicit user observations. Never infer music from RAW reads,
// DMA activity or mixed PCM alone; no guest bytes are accessed here.
export const MENU_AUDIO_SCENES=['최초 메뉴 (LOAD 전)','LOAD 직후'] as const;
const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const delta=(a:unknown,b:unknown)=>count(a)!==null&&count(b)!==null&&(b as number)>=(a as number)?(b as number)-(a as number):null;
export function menuAudioComparison(snapshots:any[]){
 const before=[...snapshots].reverse().find(s=>s.scene===MENU_AUDIO_SCENES[0]);
 const after=before&&snapshots.slice(snapshots.indexOf(before)+1).find(s=>s.scene===MENU_AUDIO_SCENES[1]&&s.sessionId===before.sessionId&&s.elapsedMs>=before.elapsedMs);
 if(!before||!after)return {status:'awaiting-two-observations',hasMenu:!!before,hasLoad:!!after};
 const brief=(s:any)=>{
  const d=s.metadata,b=d.bgmCommands,fresh=s.freshness==='live-worker-query';
  const events=fresh?(b?.events??[]):[];
  return {scene:s.scene,elapsedMs:s.elapsedMs,actualEngine:s.actualEngine,identityVerified:s.identityVerified,
   freshness:s.freshness,loss:s.loss,audioState:d.audioState,
   selectionRequests:events.filter((e:any)=>e.kind===4&&e.command===9),
   stopCandidates:events.filter((e:any)=>e.kind===4&&e.command===10),
   returns:events.filter((e:any)=>e.kind===5),
   int66:fresh?b?.commands:null,rawReads:fresh?count(b?.rawReads):null,
   pcmFrames:count(d.audioOutput?.inputFrames),pcmBlocks:count(d.audioOutput?.blocks),
   output:d.integratedSpeed?.audio??null,
   // Detailed bounded INT66 buffer/DMA and RAW path evidence is already in the
   // corresponding scene and eventArchive; do not duplicate samples or files.
   evidenceSource:'snapshots[].metadata and eventArchive',slotState:'unobserved',audibleBgm:'requires-user-observation'};
 };
 const a=before.metadata,b=after.metadata;
 return {status:'two-observations',sessionId:before.sessionId,menu:brief(before),load:brief(after),
  delta:{pcmFrames:delta(a.audioOutput?.inputFrames,b.audioOutput?.inputFrames),
   pcmBlocks:delta(a.audioOutput?.blocks,b.audioOutput?.blocks),
   int69:before.freshness==='live-worker-query'&&after.freshness==='live-worker-query'?delta(a.bgmCommands?.int69Calls,b.bgmCommands?.int69Calls):null,
   rawReads:before.freshness==='live-worker-query'&&after.freshness==='live-worker-query'?delta(a.bgmCommands?.rawReads,b.bgmCommands?.rawReads):null},
  limitations:['No retained request is not proof no request occurred; inspect losses and freshness.',
   'Matched IRET is not driver success. RAW/DMA/PCM activity is not proof of audible BGM.',
   'Slot state and successful RAW open are not directly instrumented. RAW read events only.',
   'audioStartup covers the first 60 seconds; it is not a per-scene waveform.',
   'Compare one installation and one session. No automatic playback, track substitution or repair.']};
}
