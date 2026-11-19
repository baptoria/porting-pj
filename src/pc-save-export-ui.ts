import type { PcExportPlan } from './pc-save-export';
import { storageError } from './storage';
import './save-transfer.css';

export function showPcSaveExport(name:string,plan:PcExportPlan,download:(paths:string[])=>Promise<void>){
  const d=document.createElement('dialog');d.id='pc-save-export-dialog';d.className='save-transfer';d.setAttribute('aria-labelledby','pc-export-title');
  d.innerHTML=`<header><h2 id="pc-export-title">저장 파일 내보내기</h2><p id="pc-export-profile"></p></header>
    <div class="save-transfer-body"><p>다른 PC나 휴대폰에서 이어할 수 있도록 저장 파일을 다운로드합니다.</p>
      <p>확인된 저장·설정 파일을 미리 선택했습니다. 필요한 파일만 선택할 수도 있습니다.</p>
      <details id="pc-export-details"><summary>자세히 보기 · 파일 선택</summary>
        <div class="card-actions"><button id="pc-export-slots">기본 저장 파일 선택</button><button id="pc-export-none">모두 해제</button></div>
        <p>용도를 확인하지 못한 파일은 선택하지 않았습니다. 게임 리소스는 선택하지 마세요.</p><div id="pc-export-rows" class="save-file-list"></div>
        <p id="pc-export-deleted"></p>
      </details>
      <details id="pc-export-help"><summary>다른 기기에서 사용하는 방법</summary>
        <p>PC의 게임을 종료하고 기존 SAVE 폴더를 백업하세요. ED4_PC_SAVE.zip을 게임 실행 파일이 있는 폴더에 풀어 SAVE 폴더로 복사하세요. 휴대폰에서는 ‘PC 세이브 가져오기’에서 ZIP을 선택하세요.</p>
        <p>ZIP에 없는 파일은 PC에서 자동 삭제되지 않습니다. 이전 이어하기 파일이 남아 있다면 자세히 보기의 제외 목록을 확인하세요. 같은 게임·수정본에서 사용하고, 게임 안에서 불러오기를 확인해주세요.</p>
        <p>이 ZIP은 다른 기기로 옮기는 게임 저장 파일입니다. ‘실행기 저장 백업’은 실행기에서 복원할 때 사용하는 별도 형식입니다.</p>
      </details><p id="pc-export-absence" class="save-help"></p>
    </div>
    <footer><p id="pc-export-status" role="status"></p><div class="save-transfer-actions"><span id="pc-export-count"></span><button id="pc-export-close">닫기</button><button id="pc-export-download" class="primary">저장 파일 다운로드</button></div></footer>`;
  document.body.append(d);const q=<T extends HTMLElement=HTMLElement>(s:string)=>d.querySelector<T>(s)!;let working=false;
  q('#pc-export-profile').textContent=name;
  q('#pc-export-deleted').textContent=plan.deleted.length?'이미 삭제되어 제외한 파일: '+plan.deleted.join(', '):'삭제되어 제외한 파일이 없습니다.';
  q('#pc-export-absence').textContent=plan.deleted.length?`이미 삭제된 저장 파일 ${plan.deleted.length}개는 포함하지 않습니다. PC에 남아 있는 이전 파일은 자동으로 지워지지 않습니다.`:'';
  const selected=()=>[...d.querySelectorAll<HTMLInputElement>('[data-export-path]:checked')].map(e=>e.dataset.exportPath!);
  function state(){const paths=selected();q<HTMLButtonElement>('#pc-export-download').disabled=working||!paths.length;
    for(const id of ['#pc-export-close','#pc-export-slots','#pc-export-none'])q<HTMLButtonElement>(id).disabled=working;
    for(const el of d.querySelectorAll<HTMLInputElement>('[data-export-path]'))el.disabled=working||!plan.rows.find(r=>r.path===el.dataset.exportPath)?.allowed;
    q('#pc-export-count').textContent=plan.rows.length?`${paths.length}개 파일 선택 · ${plan.rows.filter(r=>paths.includes(r.path)).reduce((n,r)=>n+r.size,0).toLocaleString()} 바이트`:'내보낼 저장 파일이 없습니다.';
  }
  for(const row of plan.rows){const label=document.createElement('label'),body=document.createElement('span'),input=document.createElement('input');label.className='save-file';input.type='checkbox';input.checked=row.allowed&&row.known;input.dataset.exportPath=row.path;input.setAttribute('aria-label',row.path+' 내보내기');input.onchange=state;
    for(const [tag,text]of [['strong',row.output.slice(5)],['span',`${row.size.toLocaleString()} 바이트 · ${row.known&&row.allowed?'확인된 저장·설정 파일':row.reason}`],['small','게임 안의 저장 위치: '+row.path],['small','다운로드 파일 안의 위치: '+row.output]]){const cell=document.createElement(tag);cell.textContent=text;body.append(cell);}label.append(input,body);q('#pc-export-rows').append(label);
  }
  q('#pc-export-slots').onclick=()=>{for(const el of d.querySelectorAll<HTMLInputElement>('[data-export-path]'))el.checked=plan.rows.some(r=>r.path===el.dataset.exportPath&&r.known&&r.allowed);state();};
  q('#pc-export-none').onclick=()=>{for(const el of d.querySelectorAll<HTMLInputElement>('[data-export-path]'))el.checked=false;state();};
  q('#pc-export-download').onclick=async()=>{if(working||!selected().length)return;const paths=selected();working=true;state();try{q('#pc-export-status').textContent='다운로드 파일을 준비하는 중…';await download(paths);q('#pc-export-status').textContent='다운로드를 요청했습니다. 기기의 다운로드 목록에서 ED4_PC_SAVE.zip 저장 여부를 확인해주세요.';}catch(e){q('#pc-export-status').textContent=storageError(e);}finally{working=false;state();}};
  q('#pc-export-close').onclick=()=>d.close();d.addEventListener('cancel',e=>{if(working)e.preventDefault();});d.addEventListener('close',()=>{d.remove();window.dispatchEvent(new Event('ed4-update-idle'));},{once:true});state();d.showModal();
}
