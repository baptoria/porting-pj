import type { Files, Profile, Save } from './model';
import { planPcSaveImport, readPcSaves, pcSaveBackup, type PcSaveEntry, type PcSavePlan } from './pc-save-import';
import { storageError } from './storage';
import './save-transfer.css';

export function showPcSaveImport(data:{profile:Profile;source:Files;save?:Save}, actions:{
  run:(action:()=>Promise<void>)=>Promise<void>;
  download:(bytes:Uint8Array,name:string)=>void;
  apply:(plan:PcSavePlan,paths:string[])=>Promise<void>;
}) {
  const d=document.createElement('dialog');d.id='pc-save-dialog';d.className='save-transfer';d.setAttribute('aria-labelledby','pc-save-title');
  d.innerHTML=`<header><h2 id="pc-save-title">저장 파일 가져오기</h2><p id="pc-save-target"></p>
    <ol class="save-steps" aria-label="가져오기 순서"><li>1. 파일 선택</li><li>2. 내용 확인</li><li>3. 가져오기</li></ol></header>
    <div class="save-transfer-body">
      <section id="pc-save-select"><h3>저장 파일을 선택해주세요</h3><p>같은 게임·수정본에서 사용한 저장 파일을 선택하세요. 게임과 음악은 다시 등록하지 않습니다.</p>
        <div class="save-picker"><label for="pc-save-kind">선택할 항목</label><select id="pc-save-kind"><option value="files">저장 파일 (DAT · CFG · SAV)</option><option value="folder">SAVE 폴더</option><option value="zip">압축된 저장 파일 (ZIP)</option></select><button id="pc-save-pick">저장 파일 선택</button></div>
        <p id="pc-save-folder-support"></p><button id="pc-save-review" hidden>선택한 내용 다시 확인</button>
      </section>
      <input hidden id="pc-save-files" type="file" multiple accept=".dat,.cfg,.sav"><input hidden id="pc-save-folder" type="file" multiple webkitdirectory><input hidden id="pc-save-zip" type="file" accept=".zip">
      <section id="pc-save-preview" hidden><h3>가져올 내용 확인</h3><ul id="pc-save-summary" class="save-summary"></ul>
        <p id="pc-save-policy">선택한 저장 파일만 가져오기 (추천)</p>
        <details id="pc-save-details"><summary>자세히 보기 · 파일 선택</summary><p>체크를 해제한 파일은 변경하지 않습니다.</p><div id="pc-save-rows" class="save-file-list"></div></details>
        <details id="pc-save-advanced"><summary>다른 가져오기 방식 · 외부 백업</summary>
          <label for="pc-save-mode">가져오기 방식</label><select id="pc-save-mode"><option value="merge">선택한 저장 파일만 가져오기 (추천)</option><option value="replace">기존 저장 파일 전체 교체</option></select>
          <p>전체 교체에서는 선택하지 않은 기존 파일을 유지할 수 있습니다. 삭제할 파일은 자세히 보기에서 확인하세요.</p>
          <button id="pc-save-backup" disabled>현재 저장 파일 백업 다운로드 (선택)</button><p>이 백업은 실행기의 ‘백업 가져오기’로 복원합니다.</p>
        </details>
        <p class="save-help">가져오기 직전 상태는 자동 복구 지점으로 보관합니다. 브라우저 데이터를 삭제하면 복구 지점도 사라질 수 있습니다.</p>
      </section>
    </div>
    <footer><p id="pc-save-confirm" class="save-change-notice" hidden></p><p id="pc-save-status" role="status"></p>
      <div class="save-transfer-actions"><span id="pc-save-count"></span><button id="pc-save-back" hidden>다시 선택</button><button id="pc-save-close">취소</button><button id="pc-save-apply" class="primary" disabled>저장 파일 가져오기</button></div>
    </footer>`;
  document.body.append(d);
  const q=<T extends HTMLElement=HTMLElement>(s:string)=>d.querySelector<T>(s)!;
  q('#pc-save-target').textContent=data.profile.name;
  let entries:PcSaveEntry[]|undefined, plan:PcSavePlan|undefined, working=false, preview=false, applying=false;
  const selected=()=>[...d.querySelectorAll<HTMLInputElement>('[data-pc-path]:checked')].map(e=>e.dataset.pcPath!);
  function state(){
    const paths=new Set(selected()),rows=plan?.rows.filter(r=>paths.has(r.path))??[];
    const count=(action:string)=>rows.filter(r=>r.action===action).length;
    q<HTMLButtonElement>('#pc-save-apply').disabled=working||!preview||!plan||!paths.size;
    for(const id of ['#pc-save-close','#pc-save-back','#pc-save-pick','#pc-save-review'])q<HTMLButtonElement>(id).disabled=working;
    q<HTMLButtonElement>('#pc-save-backup').disabled=working||!plan;
    for(const id of ['#pc-save-mode','#pc-save-kind'])q<HTMLSelectElement>(id).disabled=working;
    for(const el of d.querySelectorAll<HTMLInputElement>('[data-pc-path]'))el.disabled=working;
    q('#pc-save-select').hidden=preview;q('#pc-save-preview').hidden=!preview;q('#pc-save-back').hidden=!preview;q('#pc-save-review').hidden=!plan;
    q('#pc-save-count').textContent=preview?`${rows.filter(r=>r.action!=='delete').length}개 파일 선택${count('delete')?` · ${count('delete')}개 삭제`:''}`:'파일 선택 후 내용을 확인하세요';
    const summary=[`새로 추가할 저장 파일: ${count('add')+count('revive')}개`,`바뀌는 기존 저장 파일: ${count('overwrite')}개`,`유지되는 기존 파일: 나머지 전부`];
    if(count('same'))summary.splice(2,0,`이미 같은 파일이 있음: ${count('same')}개`);
    if(plan?.mode==='replace')summary.splice(2,0,`삭제할 기존 저장 파일: ${count('delete')}개`);
    q('#pc-save-summary').replaceChildren(...summary.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    q('#pc-save-policy').textContent=plan?.mode==='replace'?'기존 저장 파일 전체 교체 · 선택한 변경만 적용':'선택한 저장 파일만 가져오기 (추천)';
    const notices=[];
    if(count('overwrite'))notices.push(`기존 파일 ${count('overwrite')}개를 새 파일로 바꿉니다.`);
    if(count('delete'))notices.push(`기존 저장 파일 ${count('delete')}개를 삭제합니다.`);
    if(count('revive'))notices.push(`이전에 삭제된 저장 파일 ${count('revive')}개를 다시 가져옵니다.`);
    q('#pc-save-confirm').textContent=notices.join(' ');q('#pc-save-confirm').hidden=!preview||!notices.length;
    d.querySelectorAll('.save-steps li').forEach((li,i)=>{if(i===(applying?2:preview?1:0))li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  }
  async function run(action:()=>Promise<void>){
    if(working)return;working=true;state();
    try{await actions.run(action);}catch(e){q('#pc-save-status').textContent=storageError(e)+' 기존 저장 자료는 유지됩니다.';}
    finally{working=false;applying=false;state();}
  }
  function render(){
    plan=undefined;q('#pc-save-rows').replaceChildren();
    if(!entries){state();return;}
    plan=planPcSaveImport(data.profile,data.source,data.save,entries,q<HTMLSelectElement>('#pc-save-mode').value as 'merge'|'replace');
    const names={add:'새로 추가',overwrite:'기존 파일을 새 파일로 바꿈',revive:'이전에 삭제된 저장 파일 다시 가져오기',same:'이미 같은 파일이 있음',delete:'기존 저장 파일 삭제'};
    for(const row of plan.rows){
      const label=document.createElement('label'),check=document.createElement('input'),body=document.createElement('span');label.className='save-file';check.type='checkbox';check.checked=true;check.dataset.pcPath=row.path;check.setAttribute('aria-label',row.path+' 적용');check.onchange=state;
      for(const [tag,text]of [['strong',row.input?.split(/[\\/]/).at(-1)??row.path.split('/').at(-1)!],['span',`${names[row.action]} · ${row.bytes.toLocaleString()} 바이트`],['small',`선택한 파일: ${row.input??'현재 저장된 게임 데이터'}`],['small',`게임 안의 저장 위치: ${row.path}`]]){const el=document.createElement(tag);el.textContent=text;body.append(el);}
      label.append(check,body);q('#pc-save-rows').append(label);
    }
    preview=true;q('#pc-save-status').textContent=`${entries.length}개 파일 확인`;state();
  }
  q('#pc-save-pick').onclick=()=>{const input=q<HTMLInputElement>(`#pc-save-${q<HTMLSelectElement>('#pc-save-kind').value}`);input.value='';input.click();};
  for(const kind of ['files','folder','zip'] as const){
    const input=q<HTMLInputElement>(`#pc-save-${kind}`);
    input.onchange=()=>{const files=[...input.files??[]];if(!files.length||working)return;void run(async()=>{
      entries=undefined;preview=false;q<HTMLSelectElement>('#pc-save-mode').value='merge';render();q('#pc-save-status').textContent='저장 파일 확인 중…';
      entries=await readPcSaves(files,kind);render();
      if(kind==='folder'&&files.length>entries.length)q('#pc-save-status').textContent+=` 저장 파일이 아닌 ${files.length-entries.length}개 파일은 제외했습니다.`;
      q('#pc-save-preview').closest('.save-transfer-body')!.scrollTop=0;
    });};
  }
  q('#pc-save-mode').onchange=()=>{try{render();}catch(e){q('#pc-save-status').textContent=storageError(e);state();}};
  q('#pc-save-back').onclick=()=>{preview=false;state();};q('#pc-save-review').onclick=()=>{preview=!!plan;state();};
  q('#pc-save-backup').onclick=()=>{try{if(!plan||working)return;actions.download(pcSaveBackup(plan),`ed4-before-pc-import-${plan.profile.id}-${Date.now()}.zip`);q('#pc-save-status').textContent='백업 다운로드를 요청했습니다. 기기의 다운로드 목록에서 확인해주세요.';}catch(e){q('#pc-save-status').textContent=storageError(e);}};
  q('#pc-save-apply').onclick=()=>{if(working||!preview||!plan||!selected().length)return;const approved=plan,paths=selected();applying=true;void run(async()=>{q('#pc-save-status').textContent='복구 지점과 저장 파일을 안전하게 보관하는 중…';await actions.apply(approved,paths);d.close();});};
  q('#pc-save-close').onclick=()=>d.close();
  d.addEventListener('cancel',e=>{if(working)e.preventDefault();});
  d.addEventListener('close',()=>{entries=undefined;plan=undefined;d.remove();window.dispatchEvent(new Event('ed4-update-idle'));},{once:true});
  if(!('webkitdirectory' in q('#pc-save-folder'))){q<HTMLOptionElement>('#pc-save-kind option[value=folder]').disabled=true;q('#pc-save-folder-support').textContent='이 브라우저에서는 폴더 대신 저장 파일 또는 ZIP을 선택해주세요.';}
  state();d.showModal();
}
