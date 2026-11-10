import {DEVELOPER_TOOLS} from './build-policy';

/** Public presentation; capability checks live at action and engine boundaries. */
export function installPublicLauncher(){
 if(DEVELOPER_TOOLS)return;
 document.body.dataset.buildAudience='public';
 const q=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
 const hide=(element:HTMLElement|null)=>{if(element){element.hidden=true;element.dataset.publicUnavailable='true';}};
 for(const s of ['.trial-launch','#open-import','#demo','.phase2-card','.diagnostics',
 '#boot-dialog','#import-dialog','#run-diagnostics','#run-performance','#scene-panel',
 '#trace-status','#speed-toggle','#speed-limit','#raw-preview','#raw-stop'])hide(q(s));
 for(const s of ['#cycles','#memory','#sound','#prelude','#preset','#required-version'])hide(q(s).closest('label'));
 // Keep existing saved CPU/prelude values, and existing ordinary engine preference.
 for(const el of q('#settings-form').querySelectorAll<HTMLElement>(':scope > .hint'))hide(el);
 q('#settings-dialog h2').textContent='게임 설정';
 q('#launcher-advanced').textContent='관리 · 백업';
 q('#advanced-settings > summary').textContent='게임 관리 · 음악 · 백업 · 업데이트';
 q('#advanced-content > .hint').textContent='게임 안에서 저장한 뒤 실행기를 종료하세요. 중요한 저장은 백업 파일로 따로 보관해 주세요.';
 q('#ingame-advanced').textContent='더 보기 ↓';
 q('#play-menu-advanced h3').textContent='화면 · 백업';
 q('#status').textContent='게임 폴더를 한 번 등록하면 다음부터 바로 시작할 수 있습니다.';
 q('#mode-manage').textContent='모드 관리';
 q('.library').prepend(q('#mode-manage'));
 q('#mode-manage').classList.add('quiet');
 const original=q<HTMLSelectElement>('#play-engine');
 original.options[0].text='기본 DOS 실행';original.options[1].text='영웅전설4 호환 실행';
 const label=original.closest('label')!,note=q('#normal-launch small');
 // Move, never reset the user's selected ordinary engine.
 q('#edit-exe').closest('label')!.after(label);
 const more=document.createElement('details');more.id='profile-more';more.innerHTML='<summary>모드 · 저장 상세 설정</summary>';
 label.after(more);
 const patches=q('#patch-list'),hint=patches.previousElementSibling!,heading=hint.previousElementSibling!;
 more.append(q('#save-paths').closest('label')!,heading,hint,patches);
 note.textContent='선택한 게임으로 모험을 이어갑니다.';
 original.addEventListener('change',()=>{note.textContent='선택한 게임으로 모험을 이어갑니다.';});
 const music=q('.phase3-card');music.querySelector('h3')!.textContent='음악 파일 연결';
 const hints=music.querySelectorAll<HTMLElement>('.hint');
 if(hints[0])hints[0].textContent='등록할 때 포함된 RAW 음악은 자동으로 연결됩니다. 따로 보관한 RAW 파일은 여기서 추가할 수 있습니다. 음악 없이도 실행할 수 있습니다.';
 if(hints[1])hide(hints[1]);hide(q('#music-track').closest('label'));
 q('#music-prefix').closest('label')!.childNodes[0].textContent='음악 폴더 위치 (필요한 경우만 입력)';
 q('.detail-grid .card:nth-child(2) .hint').textContent='방향키로 이동 · Enter로 확인 · ESC로 취소';
 q('.detail-grid .card:first-child h3').textContent='게임 · 저장 관리';
 q('#screen-export').textContent='화면 저장';
 const updateMode=()=>{q<HTMLButtonElement>('#mode-manage').disabled=!document.body.classList.contains('has-profile')||document.body.classList.contains('running')||document.body.classList.contains('busy');};
 new MutationObserver(updateMode).observe(document.body,{attributes:true,attributeFilter:['class']});updateMode();
}
