import type { PcExportPlan } from './pc-save-export';
import { storageError } from './storage';

export function showPcSaveExport(name:string,plan:PcExportPlan,download:(paths:string[])=>Promise<void>){
  const d=document.createElement('dialog');d.id='pc-save-export-dialog';
  d.innerHTML=`<h2>PC 세이브 내보내기</h2><p id="pc-export-profile"></p>
  <p>현재 게임에 보이는 저장 파일을 SAVE/ 폴더로 내보냅니다. 소비·삭제된 파일은 포함하지 않습니다. DATA_B.DAT 등 용도 미확인 파일은 기본 선택하지 않으며, 게임 리소스라면 선택하지 마세요.</p>
  <div class="card-actions"><button id="pc-export-slots">전체 슬롯·CFG 선택</button><button id="pc-export-none">모두 해제</button></div>
  <div class="pc-save-list" tabindex="0"><table><thead><tr><th>선택</th><th>현재 경로 → ZIP 경로</th><th>바이트</th><th>구분</th></tr></thead><tbody id="pc-export-rows"></tbody></table></div>
  <p id="pc-export-deleted"></p><p id="pc-export-status" role="status"></p>
  <p>PC의 게임을 종료하고 기존 SAVE 폴더를 먼저 백업하세요. ED4_PC_SAVE.zip을 게임 실행 파일이 있는 폴더에 풀어 SAVE 폴더에 복사하세요. ZIP에 없는 파일은 PC에서 자동 삭제되지 않습니다. 위 삭제 목록의 중단 저장이 PC에 남아 있으면 이전 이어하기가 나타날 수 있으므로 별도로 확인하세요.</p>
  <p>일부 파일만 선택하면 해당 파일만 이동합니다. 파일 조합·수정본 호환성과 게임 내 불러오기는 직접 확인해주세요.</p>
  <div class="card-actions"><button id="pc-export-download">ED4_PC_SAVE.zip 받기</button><button id="pc-export-close">닫기</button></div>`;
  document.body.append(d);const q=<T extends HTMLElement=HTMLElement>(s:string)=>d.querySelector<T>(s)!;let working=false;
  q('#pc-export-profile').textContent=`${name} · ${plan.profileId} · ${plan.root}`;
  q('#pc-export-deleted').textContent=plan.deleted.length?'삭제 상태로 제외: '+plan.deleted.join(', '):'현재 저장의 삭제 표시 없음';
  const selected=()=>[...d.querySelectorAll<HTMLInputElement>('[data-export-path]:checked')].map(e=>e.dataset.exportPath!);
  function state(){const paths=selected();q<HTMLButtonElement>('#pc-export-download').disabled=working||!paths.length;
    for(const id of ['#pc-export-close','#pc-export-slots','#pc-export-none'])q<HTMLButtonElement>(id).disabled=working;
    q('#pc-export-status').textContent=plan.rows.length?`${paths.length}개 선택 · ${plan.rows.filter(r=>paths.includes(r.path)).reduce((n,r)=>n+r.size,0).toLocaleString()} 바이트`:'내보낼 SAVE 파일이 없습니다.';
  }
  for(const row of plan.rows){const tr=document.createElement('tr'),td=document.createElement('td'),input=document.createElement('input');input.type='checkbox';input.checked=row.allowed&&row.known;input.disabled=!row.allowed;input.dataset.exportPath=row.path;input.setAttribute('aria-label',row.path+' 내보내기');input.onchange=state;td.append(input);tr.append(td);
    for(const text of [row.path+' → '+row.output,String(row.size),row.reason]){const cell=document.createElement('td');cell.textContent=text;tr.append(cell);}q('#pc-export-rows').append(tr);
  }
  q('#pc-export-slots').onclick=()=>{for(const el of d.querySelectorAll<HTMLInputElement>('[data-export-path]'))el.checked=plan.rows.some(r=>r.path===el.dataset.exportPath&&r.known&&r.allowed);state();};
  q('#pc-export-none').onclick=()=>{for(const el of d.querySelectorAll<HTMLInputElement>('[data-export-path]'))el.checked=false;state();};
  q('#pc-export-download').onclick=async()=>{if(working)return;const paths=selected();working=true;state();try{await download(paths);working=false;state();q('#pc-export-status').textContent='다운로드를 요청했습니다. 기기의 다운로드 목록에서 ED4_PC_SAVE.zip 저장 여부를 확인해주세요.';}catch(e){working=false;state();q('#pc-export-status').textContent=storageError(e);}};
  q('#pc-export-close').onclick=()=>d.close();d.addEventListener('cancel',e=>{if(working)e.preventDefault();});d.addEventListener('close',()=>{d.remove();window.dispatchEvent(new Event('ed4-update-idle'));},{once:true});state();d.showModal();
}
