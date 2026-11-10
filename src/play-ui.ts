export const PLAY_UI_KEY='ed4-play-ui-v1';
export const DEFAULT_PLAY_UI={joystickSize:150,joystickX:0,joystickY:100,opacity:35,buttonSize:72,buttonX:100,buttonY:100,swap:false,fit:'contain' as 'contain'|'fill'};
export type PlayUi=typeof DEFAULT_PLAY_UI;
const ranges:Record<string,[number,number]>={joystickSize:[80,240],joystickX:[0,100],joystickY:[0,100],opacity:[15,85],buttonSize:[44,120],buttonX:[0,100],buttonY:[0,100]};
export function normalizePlayUi(value:unknown):PlayUi{
 const result={...DEFAULT_PLAY_UI};if(!value||typeof value!=='object')return result;
 const v=value as Record<string,unknown>;
 for(const [k,[min,max]]of Object.entries(ranges))if(typeof v[k]==='number'&&Number.isFinite(v[k]))(result as any)[k]=Math.max(min,Math.min(max,v[k]));
 result.swap=v.swap===true;result.fit=v.fit==='fill'?'fill':'contain';return result;
}
export function controlLayout(width:number,height:number,s:PlayUi){
 const w=Math.max(0,width),h=Math.max(0,height),joy=Math.min(s.joystickSize,w*.42,h*.48),button=Math.min(s.buttonSize,w*.21,h*.3),gap=Math.min(12,w*.02),group=button*2+gap;
 return {joy,button,gap,joyX:Math.max(0,w/2-joy)*s.joystickX/100,joyY:Math.max(0,h-joy)*s.joystickY/100,
  actionX:w/2+Math.max(0,w/2-group)*s.buttonX/100,actionY:Math.max(0,h-button)*s.buttonY/100};
}
export const SPEED_CAPABILITY={supported:false,rate:1,reason:'2×는 Phase 9-8H 전체 오디오 가속 일회성 진단에서만 지원합니다. 현재 일반 속도 1×입니다.'} as const;
export function installPlayUi(area:HTMLElement){
 const release=()=>window.dispatchEvent(new Event('ed4-release-input'));
 let settings:PlayUi={...DEFAULT_PLAY_UI};try{settings=normalizePlayUi(JSON.parse(localStorage.getItem(PLAY_UI_KEY)??'null'));}catch{}
 const controls=area.querySelector<HTMLElement>('#touch-controls')!;
 area.querySelector('.screen')!.append(controls);
 area.insertAdjacentHTML('beforeend',`<div id="game-tools"><button id="player-menu" aria-label="플레이 메뉴" aria-expanded="false">☰</button><button id="speed-toggle" disabled aria-pressed="false" aria-label="2× 배속 미지원 · 현재 1×" title="${SPEED_CAPABILITY.reason}">2×</button></div>`);
 const toolbar=area.querySelector<HTMLElement>('.player-toolbar')!;
 toolbar.insertAdjacentHTML('beforeend','<button id="play-ui-open">화면·조작 설정</button><button id="immersive-close">몰입 화면 닫기</button><p id="speed-limit">'+SPEED_CAPABILITY.reason+'</p>');
 // Keep the existing preference keys: size/position now describe the four-button group.
 const labels:Record<string,string>={joystickSize:'방향 버튼 묶음 크기 (px)',joystickX:'방향 버튼 좌우 위치',joystickY:'방향 버튼 상하 위치',opacity:'조작부 불투명도 (%)',buttonSize:'Enter/ESC 크기 (px)',buttonX:'버튼 좌우 위치',buttonY:'버튼 상하 위치'};
 area.insertAdjacentHTML('beforeend',`<dialog id="play-ui-dialog"><h2>화면·조작 설정</h2><p>게임 파일·세이브와 별도로 이 기기에 저장됩니다. 위치는 안전 영역 안에서 제한됩니다.</p><label>화면 표시<select id="play-fit"><option value="contain">원본 비율 유지 (기본)</option><option value="fill">화면 채우기 (비율 왜곡 가능, 잘림 없음)</option></select></label>${Object.entries(ranges).map(([key,[min,max]])=>`<label>${labels[key]} <output id="ui-${key}-value"></output><input id="ui-${key}" type="range" min="${min}" max="${max}" step="1"></label>`).join('')}<label><input id="ui-swap" type="checkbox"> Enter / ESC 좌우 위치 교환</label><p id="play-ui-status" role="status"></p><button id="play-ui-reset">기본 배치 복원</button><button id="play-ui-close">닫기</button></dialog>`);
 const q=<T extends HTMLElement=HTMLElement>(s:string)=>area.querySelector<T>(s)!;
 const stick=q('#direction-pad'),actions=q('.action-pad'),dialog=q<HTMLDialogElement>('#play-ui-dialog');
 const layout=()=>{
  const r=controls.getBoundingClientRect(),p=controlLayout(r.width,r.height,settings);
  stick.style.width=stick.style.height=p.joy+'px';stick.style.left=p.joyX+'px';stick.style.top=p.joyY+'px';
  actions.style.left=p.actionX+'px';actions.style.top=p.actionY+'px';actions.style.gap=p.gap+'px';actions.style.flexDirection=settings.swap?'row-reverse':'row';
  actions.style.setProperty('--action-size',p.button+'px');
  area.style.setProperty('--play-opacity',String(settings.opacity/100));area.style.setProperty('--play-active-opacity',String(Math.max(65,settings.opacity)/100));
  area.dataset.fit=settings.fit;
 };
 const fields=()=>{
  for(const key of Object.keys(ranges)){q<HTMLInputElement>('#ui-'+key).value=String((settings as any)[key]);q('#ui-'+key+'-value').textContent=String((settings as any)[key]);}
  q<HTMLSelectElement>('#play-fit').value=settings.fit;q<HTMLInputElement>('#ui-swap').checked=settings.swap;
 };
 const save=()=>{try{localStorage.setItem(PLAY_UI_KEY,JSON.stringify(settings));q('#play-ui-status').textContent='화면·조작 설정을 저장했습니다.';}catch{q('#play-ui-status').textContent='UI 설정을 저장할 수 없습니다. 이번 실행에는 적용됩니다. 게임 데이터는 유지됩니다.';}};
 for(const key of Object.keys(ranges))q('#ui-'+key).addEventListener('input',()=>{release();settings=normalizePlayUi({...settings,[key]:Number(q<HTMLInputElement>('#ui-'+key).value)});fields();layout();save();});
 q('#play-fit').onchange=()=>{release();settings.fit=q<HTMLSelectElement>('#play-fit').value==='fill'?'fill':'contain';layout();save();};
 q('#ui-swap').onchange=()=>{release();settings.swap=q<HTMLInputElement>('#ui-swap').checked;layout();save();};
 q('#play-ui-reset').onclick=()=>{release();settings={...DEFAULT_PLAY_UI};fields();layout();save();};
 q('#play-ui-open').onclick=()=>{release();fields();dialog.showModal();};
 q('#play-ui-close').onclick=()=>dialog.close();dialog.addEventListener('close',release);
 q('#player-menu').onclick=()=>{release();const open=area.classList.toggle('menu-open');q('#player-menu').setAttribute('aria-expanded',String(open));if(!open)q('#canvas').focus();};
 const enter=()=>{release();area.classList.add('immersive');layout();};
 q('#fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)enter();});
 q('#immersive-close').onclick=()=>{release();area.classList.remove('immersive','menu-open');q('#player-menu').setAttribute('aria-expanded','false');void document.exitFullscreen?.().catch(()=>{});screen.orientation?.unlock?.();};
 for(const id of ['#pause','#stop'])q(id).addEventListener('click',release);
 document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===area)enter();layout();});
 let wasRunning=false;
 new MutationObserver(()=>{
  const running=document.body.classList.contains('running');if(running===wasRunning)return;wasRunning=running;release();
  q('#speed-toggle').setAttribute('aria-pressed','false');
  if(running&&matchMedia('(pointer: coarse)').matches)enter();
  if(!running){area.classList.remove('immersive','menu-open');q('#player-menu').setAttribute('aria-expanded','false');if(dialog.open)dialog.close();}
 }).observe(document.body,{attributes:true,attributeFilter:['class']});
 new ResizeObserver(()=>{release();layout();}).observe(controls);fields();layout();
 return ()=>({revision:'phase9-8d-controls-1',settings:{...settings},immersive:area.classList.contains('immersive'),speed:{...SPEED_CAPABILITY,supported:q<HTMLButtonElement>('#speed-toggle').dataset.capable==='true',rate:q('#speed-toggle').getAttribute('aria-pressed')==='true'?2:1,reason:q('#speed-limit').textContent}});
}
