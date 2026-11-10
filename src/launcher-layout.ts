import {DEVELOPER_TOOLS} from './build-policy';
/** Presentation only. Move existing controls without replacing their event listeners. */
export function installLauncherLayout(){
 const q=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
 const panel=q('.main-panel'),area=q('#play-area'),toolbar=q('.player-toolbar');
 document.body.classList.add('fantasy-launcher');
 q('.brand').innerHTML='<span class="brand-mark">Ⅳ</span><span>ED4 <b>MOBILE</b><small>나만의 모험을 이어서</small></span>';
 q('.phase').textContent=DEVELOPER_TOOLS?'개발 빌드 · 진단 전용':'LOCAL PLAY';
 if(DEVELOPER_TOOLS)q('.phase').id='developer-badge';
 panel.insertAdjacentHTML('afterbegin',`<section class="launcher-hero" aria-labelledby="launcher-title"><div class="hero-copy"><span class="eyebrow">THE LEGEND OF HEROES · DOS</span><h1 id="launcher-title">영웅전설 <span>IV</span></h1><p>다시 펼치는, 당신의 모험.</p><div id="selected-profile"></div><div id="registration-action"></div></div><div class="launch-deck"><div id="normal-launch"><span class="eyebrow">일반 실행 · 1×</span></div><div class="trial-launch"><button id="trial-k">2× 시험 실행 <span>↗</span></button><small>Phase 9-8K · Galaxy 2× 확인 · 음악도 가속<br><strong>시험 중 저장 변경분은 폐기됩니다.</strong></small></div></div></section><nav class="launcher-nav" aria-label="런처 메뉴"><button id="choose-profile">게임 · 프로필</button><button id="game-settings">게임 설정</button><button id="launcher-controls">조작 설정</button><button id="launcher-advanced">고급 도구</button></nav>`);
 q('#selected-profile').append(q('.title-row'));
 q('#registration-action').append(q('#simple-import'));
 const engine=q('#play-engine'),label=engine.parentElement!,note=label.nextElementSibling!;
 q('#normal-launch').append(label,q('#play'),q('#play-fallback'),note);
 q('#play').textContent='모험 시작';
 q<HTMLSelectElement>('#play-engine').setAttribute('aria-label','일반 실행 엔진');
 const describe=()=>{note.textContent=engine instanceof HTMLSelectElement&&engine.value==='phase9-8k'?'전체 배속 호환 실행 · 음악/효과음도 가속 · 일반 저장 사용':engine instanceof HTMLSelectElement&&engine.value==='phase9-7'?'Phase 9-7 호환 경로 · 기존 일반 저장 사용':'Stable 원래 경로 · 기존 일반 저장 사용. 구버전 ED4는 위에서 Phase 9-7을 선택하세요.';};
 engine.addEventListener('change',describe);describe();
 const library=q('.library');q('.launcher-nav').after(library);
 library.querySelector('h1')!.remove();library.querySelector('.intro')!.remove();
 q('#advanced-content').append(q('.library-bottom'));
 q('#settings-toggle').textContent='저장 · 복구 도구';
 q('#advanced-settings > summary').textContent='고급 도구 · 모드 / 저장 / 진단 / 업데이트';
 q('#boot-block-reason').insertAdjacentHTML('afterend','<p class="hint">이 분석 제한은 임시 BAT 추적에만 적용됩니다. 일반 «모험 시작»은 선택한 원본 BAT를 직접 실행합니다. 분석 미지원만으로 게임 호환성을 판정하지 않습니다.</p>');
 q('#choose-profile').onclick=()=>{library.scrollIntoView({block:'nearest'});(document.querySelector<HTMLButtonElement>('#profiles button')??q<HTMLButtonElement>('#simple-import')).focus();};
 q('#game-settings').onclick=()=>q('#edit-profile').click();
 q('#launcher-controls').onclick=()=>q('#play-ui-open').click();
 q('#launcher-advanced').onclick=()=>{q<HTMLDetailsElement>('#advanced-settings').open=true;q('#advanced-settings').scrollIntoView({block:'start'});};
 // Explicit trial entry opens the existing dialog. It never starts a session or persists a choice.
 q('#trial-k').onclick=()=>{
  const dialog=q<HTMLDialogElement>('#boot-dialog');
  const observer=new MutationObserver(()=>{if(dialog.open){q<HTMLSelectElement>('#boot-engine').value='phase9-8k';observer.disconnect();}});
  observer.observe(dialog,{attributes:true,attributeFilter:['open']});q('#boot-open').click();
  setTimeout(()=>observer.disconnect(),10000);
 };
 const sync=()=>{for(const [target,source] of [['#trial-k','#boot-open'],['#game-settings','#edit-profile']])q<HTMLButtonElement>(target).disabled=q<HTMLButtonElement>(source).disabled;};
 for(const id of ['#boot-open','#edit-profile'])new MutationObserver(sync).observe(q(id),{attributes:true,attributeFilter:['disabled']});sync();
 toolbar.insertAdjacentHTML('afterbegin','<div class="play-menu-heading"><span>모험 메뉴</span><button id="return-game">게임으로 돌아가기</button></div><div id="play-menu-basic"></div><button id="ingame-advanced">고급 도구 ↓</button><section id="play-menu-advanced" aria-label="실행 고급 도구"><h3>고급 도구 · 진단</h3></section>');
 q('#play-menu-basic').append(q('#play-ui-open'),q('#pause'),q('#stop'));
 q('#return-game').onclick=()=>{if(area.classList.contains('menu-open'))q('#player-menu').click();else q('#canvas').focus();};
 for(const id of ['#recovery-run','#export-live','#keyboard-toggle','#fullscreen','#screen-export','#run-diagnostics','#run-performance','#immersive-close','#scene-panel'])q('#play-menu-advanced').append(q(id));
 q('#play-menu-basic').append(q('#speed-limit'),q('#session-notice'));
 q('#ingame-advanced').onclick=()=>q('#play-menu-advanced').scrollIntoView({block:'nearest'});
 // Keep exports reachable after a failed start or stopped Worker as well.
 // A failed start need not ever add body.running, so observe the status too.
 const diagnostic=q('#run-diagnostics'),tools=q('#play-menu-advanced');
 const placeTools=()=>{
  const running=document.body.classList.contains('running');
  const recent=!running&&['종료됨','시작 실패'].includes(q('#run-state').textContent??'');
  const diagnosticDestination=recent?q('.simple-summary'):tools;
  if(diagnostic.parentElement!==diagnosticDestination)diagnosticDestination.append(diagnostic);
 };
 new MutationObserver(placeTools).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(placeTools).observe(q('#run-state'),{childList:true,characterData:true,subtree:true});placeTools();
 const advanced=q<HTMLDetailsElement>('#advanced-settings');
 const showIdleTools=()=>document.body.classList.toggle('launcher-tools-open',advanced.open);
 new MutationObserver(showIdleTools).observe(advanced,{attributes:true,attributeFilter:['open']});showIdleTools();
 q('#player-menu').textContent='메뉴';
 // Rate button remains the single engine-ACK-driven control; no duplicate rate state.
 q('#speed-toggle').setAttribute('aria-describedby','speed-limit');
}
