import {DEVELOPER_TOOLS} from './build-policy';
import type {DosEngine} from './engine';
import {SceneSession,SCENES,SCENE_LIMITS} from './scene-diagnostics';
import {MENU_AUDIO_SCENES} from './menu-audio-comparison';
export function installScenePanel(toolbar:HTMLElement,getEngine:()=>DosEngine|undefined,download:(bytes:Uint8Array,name:string)=>void){
 if(!DEVELOPER_TOOLS){toolbar.insertAdjacentHTML('beforeend','<div id="scene-panel" hidden></div>');return {start(_requested:string){},ready(){},end(){},report:()=>undefined};}
 toolbar.insertAdjacentHTML('beforeend',`<details id="scene-panel"><summary>장면 진단</summary><label>현재 장면<select id="scene-name">${SCENES.map(s=>`<option>${s}</option>`).join('')}</select></label><button id="scene-capture">현재 장면 기록</button><button id="scene-download">전체 진단 다운로드</button><p id="scene-status" role="status">장면 기록 대기</p></details>`);
 const q=(s:string)=>toolbar.querySelector<HTMLElement>(s)!;let session:SceneSession|undefined,timer:ReturnType<typeof setInterval>|undefined,pending=false;
 q('#scene-capture').insertAdjacentHTML('afterend','<button id="menu-audio-before">최초 메뉴 기록 · LOAD 전</button><button id="menu-audio-after">LOAD 직후 기록</button>');
 const status=(message:string)=>{q('#scene-status').textContent=message;};
 async function sample(scene?:string){
  const current=session,engine=getEngine();if(!current||!engine){if(scene)status('실행 중인 세션이 없습니다. 기존 기록은 다운로드할 수 있습니다.');return;}
  if(pending){if(scene)status('진단 응답 대기 중입니다. 잠시 후 기록하세요.');return;}pending=true;
  try{
   const started=performance.now();await engine.refreshAudioDiagnostics();if(session!==current||getEngine()!==engine)return;
   const data=engine.diagnostics(),ms=performance.now()-started;
   if(scene){const snapshot=current.capture(scene,data,ms);status(`${current.snapshots.length}개 장면 · 마지막 ${scene} ${snapshot.capturedAt} · 선택 ${current.requestedEngine} / 실제 ${snapshot.actualEngine??'미확인'}${snapshot.freshness==='live-worker-query'?'':' · INT66/69 최신 관측 없음'}`);}
   else current.observe(data,ms);
  }catch(e){status('장면 기록 실패: '+String(e)+' · 기존 기록은 유지됩니다.');}finally{pending=false;}
 }
 q('#scene-capture').onclick=()=>void sample((q('#scene-name') as HTMLSelectElement).value);
 const captureMenu=(scene:string)=>{(q('#scene-name') as HTMLSelectElement).value=scene;void sample(scene);};
 q('#menu-audio-before').onclick=()=>captureMenu(MENU_AUDIO_SCENES[0]);
 q('#menu-audio-after').onclick=()=>captureMenu(MENU_AUDIO_SCENES[1]);
 q('#scene-download').onclick=()=>{
  try{
   if(!session||!session.snapshots.length)throw Error('먼저 현재 장면을 기록하세요.');
   // Synchronous user gesture: no IndexedDB scan or async work before Android download.
   download(new TextEncoder().encode(session.serialize()),`ed4-scenes-${session.id}.json`);
   status(`${session.snapshots.length}개 장면 다운로드 요청 · 게임과 수집 기록은 유지됩니다. 저장 실패 시 다시 누르세요.`);
  }catch(e){status('다운로드 실패: '+String(e)+' · 수집 기록은 유지됩니다.');}
 };
 return {start(requested:string){if(timer)clearInterval(timer);session=new SceneSession(requested);status(`새 세션 · 선택 ${requested} · 장면 기록 대기`);},
  ready(){void sample();timer=setInterval(()=>{if(session?.expired){clearInterval(timer);status('2시간 수집 상한 도달 · 기존 장면은 다운로드할 수 있습니다.');return;}if(!document.hidden)void sample();},SCENE_LIMITS.pollMs);},
  end(){if(timer)clearInterval(timer);session?.end();},report:()=>session?.report()};
}
