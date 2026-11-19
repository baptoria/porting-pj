import type { Files, Profile, Save } from './model';
import { planPcSaveImport, readPcSaves, pcSaveBackup, type PcSaveEntry, type PcSavePlan } from './pc-save-import';
import { storageError } from './storage';

export function showPcSaveImport(data:{profile:Profile;source:Files;save?:Save}, actions:{
  run:(action:()=>Promise<void>)=>Promise<void>;
  download:(bytes:Uint8Array,name:string)=>void;
  apply:(plan:PcSavePlan,paths:string[])=>Promise<void>;
}) {
  const d=document.createElement('dialog');d.id='pc-save-dialog';
  d.innerHTML=`<h2>PC 세이브 가져오기</h2><p id="pc-save-target"></p>
    <p>PC의 SAVE 폴더 또는 DAT·CFG·SAV 파일을 선택하세요. 게임과 음악은 다시 등록하지 않습니다. 같은 설치본·수정본의 세이브인지 확인해주세요.</p>
    <div class="card-actions"><button id="pc-save-files-pick">파일 여러 개 선택</button><button id="pc-save-folder-pick">SAVE 폴더 선택</button><button id="pc-save-zip-pick">세이브 ZIP 선택</button></div>
    <input hidden id="pc-save-files" type="file" multiple accept=".dat,.cfg,.sav"><input hidden id="pc-save-folder" type="file" multiple webkitdirectory><input hidden id="pc-save-zip" type="file" accept=".zip">
    <p id="pc-save-folder-support"></p><label>가져오기 방식 <select id="pc-save-mode"><option value="merge">병합 · 선택한 파일만 적용</option><option value="replace">SAVE 교체 · 가져오기에 없는 저장 파일도 삭제 대상으로 표시</option></select></label>
    <p>아래 체크를 해제한 파일은 유지됩니다. ‘삭제 표시 해제’는 이전에 소비된 이어하기 파일을 다시 가져오는 선택일 수 있습니다. 파일 형식과 게임 내 불러오기 호환성은 직접 확인해야 합니다.</p>
    <div class="pc-save-list" tabindex="0"><table><thead><tr><th>적용</th><th>PC 상대 경로 → DOS 경로</th><th>동작</th><th>바이트</th></tr></thead><tbody id="pc-save-rows"></tbody></table></div>
    <p id="pc-save-status" role="status">파일을 선택해주세요.</p>
    <button id="pc-save-backup" disabled>1. 현재 세이브 백업 ZIP 받기</button>
    <label><input id="pc-save-backup-confirm" type="checkbox" disabled>백업 ZIP이 기기에 저장된 것을 확인했습니다.</label>
    <p>브라우저에서는 다운로드 완료를 확인할 수 없습니다. 백업 저장을 확인한 뒤 적용하세요. 적용 전 상태는 이어하기 복구 지점에도 함께 보존됩니다.</p>
    <div class="card-actions"><button id="pc-save-apply" disabled>2. 선택한 변경 적용</button><button id="pc-save-close">취소</button></div>`;
  document.body.append(d);
  const q=<T extends HTMLElement=HTMLElement>(s:string)=>d.querySelector<T>(s)!;
  q('#pc-save-target').textContent=`현재 프로필: ${data.profile.name} · ${data.profile.id}`;
  let entries:PcSaveEntry[]|undefined, plan:PcSavePlan|undefined, working=false,downloaded=false;
  const selected=()=>[...d.querySelectorAll<HTMLInputElement>('[data-pc-path]:checked')].map(e=>e.dataset.pcPath!);
  function state(){
    q<HTMLButtonElement>('#pc-save-apply').disabled=working||!plan||!selected().length||!downloaded||!q<HTMLInputElement>('#pc-save-backup-confirm').checked;
    q<HTMLButtonElement>('#pc-save-backup').disabled=working||!plan;
    q<HTMLButtonElement>('#pc-save-close').disabled=working;
    q<HTMLSelectElement>('#pc-save-mode').disabled=working;
    for(const id of ['files','folder','zip'])q<HTMLButtonElement>(`#pc-save-${id}-pick`).disabled=working||(id==='folder'&&!('webkitdirectory' in q('#pc-save-folder')));
  }
  async function run(action:()=>Promise<void>){
    if(working)return;working=true;state();
    try{await actions.run(action);}catch(e){q('#pc-save-status').textContent=storageError(e)+' 기존 저장 자료는 유지됩니다.';}
    finally{working=false;state();}
  }
  function render(){
    plan=undefined;downloaded=false;q<HTMLInputElement>('#pc-save-backup-confirm').checked=false;q<HTMLInputElement>('#pc-save-backup-confirm').disabled=true;
    q('#pc-save-rows').replaceChildren();
    if(!entries){state();return;}
    plan=planPcSaveImport(data.profile,data.source,data.save,entries,q<HTMLSelectElement>('#pc-save-mode').value as 'merge'|'replace');
    const names={add:'새 저장 파일',overwrite:'덮어쓰기',revive:'삭제 표시 해제 후 가져오기',same:'동일 내용',delete:'삭제 표시 적용'};
    for(const row of plan.rows){
      const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.pcPath=row.path;check.setAttribute('aria-label',row.path+' 적용');check.onchange=state;
      const cell=document.createElement('td');cell.append(check);tr.append(cell);
      for(const value of [`${row.input??'(현재 저장)'} → ${row.path}`,names[row.action],String(row.bytes)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      q('#pc-save-rows').append(tr);
    }
    q('#pc-save-status').textContent=`${plan.root} · ${entries.length}개 파일 확인. ${plan.rows.filter(r=>r.action==='delete').length}개 삭제 대상. 경로와 덮어쓰기를 확인해주세요.`;
    state();
  }
  for(const kind of ['files','folder','zip'] as const){
    const input=q<HTMLInputElement>(`#pc-save-${kind}`);
    q(`#pc-save-${kind}-pick`).onclick=()=>{input.value='';input.click();};
    input.onchange=()=>{const files=[...input.files??[]];if(!files.length)return;void run(async()=>{
      entries=undefined;render();q('#pc-save-status').textContent='세이브 파일 확인 중…';
      entries=await readPcSaves(files,kind);render();
      if(kind==='folder'&&files.length>entries.length)q('#pc-save-status').textContent+=` ZIP 등 세이브가 아닌 ${files.length-entries.length}개 파일은 제외했습니다.`;
    });};
  }
  q('#pc-save-mode').onchange=()=>{try{render();}catch(e){q('#pc-save-status').textContent=storageError(e);state();}};
  q('#pc-save-backup').onclick=()=>{try{if(!plan||working)return;actions.download(pcSaveBackup(plan),`ed4-before-pc-import-${plan.profile.id}-${Date.now()}.zip`);downloaded=true;q<HTMLInputElement>('#pc-save-backup-confirm').disabled=false;state();}catch(e){q('#pc-save-status').textContent=storageError(e);}};
  q('#pc-save-backup-confirm').onchange=state;
  q('#pc-save-apply').onclick=()=>{if(!plan||!downloaded||!q<HTMLInputElement>('#pc-save-backup-confirm').checked)return;const approved=plan,paths=selected();void run(async()=>{await actions.apply(approved,paths);d.close();});};
  q('#pc-save-close').onclick=()=>d.close();
  d.addEventListener('cancel',e=>{if(working)e.preventDefault();});
  d.addEventListener('close',()=>{entries=undefined;plan=undefined;d.remove();window.dispatchEvent(new Event('ed4-update-idle'));},{once:true});
  if(!('webkitdirectory' in q('#pc-save-folder')))q('#pc-save-folder-support').textContent='이 브라우저는 폴더 선택을 지원하지 않습니다. 파일 여러 개 또는 세이브 ZIP을 선택해주세요.';
  state();d.showModal();
}
