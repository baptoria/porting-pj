import {rememberDookyAttempt,latestDookyAttempt} from './dooky-diagnostics';
import {folderMusicPlan, prepareFolderMusic, type MusicRegistration} from './folder-music-import';
import {FolderSelectionError, scanGameFolder, folderPickerAvailable, folderUnavailable, type FolderScan} from './folder-registration';
import type {SourceInput} from './source-import';
import {DEVELOPER_TOOLS} from './build-policy';
import {inspectDookyFolder,dookyAdvice,type DookyAutoPlan,type DookyDecision} from './dooky-auto';
import {publicImportError} from './import-messages';
import type { Profile, ProfileKind } from "./model";
import { prepareRegistration, commitRegistration, discardRegistration, importAdvice } from "./simple-registration";
import { importTrace, failImport } from './import-trace';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function installSimpleImport(options: {
  run: (action: () => Promise<void>) => Promise<void>;
  idle: () => void;
  profiles: () => Profile[];
  selected: () => string;
  done: (profile: Profile) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
}) {
  document.querySelector('#app')!.insertAdjacentHTML('beforeend', `
  <dialog id="simple-import-dialog" aria-labelledby="simple-heading">
    <div class="dialog-heading"><h2 id="simple-heading">게임 등록</h2><button id="simple-cancel" type="button">취소 · 닫기</button></div>
    <p>게임 전체를 한 번만 선택하세요. 본체와 RAW 음악을 자동 분리해 이 브라우저에 보관합니다. 서버로 전송하지 않습니다.</p>
    <label id="simple-kind-row">등록할 게임<select id="simple-kind"><option value="vanilla">바닐라 · 원본 게임</option><option value="patch">모드 A · 수정 파일</option><option value="standalone">모드 B · 전체 수정 게임</option></select></label>
    <label id="simple-base-row" hidden>공유할 원본 프로필<select id="simple-base"></select></label>
    <label class="file-drop">게임 폴더 선택<input id="simple-folder" type="file" webkitdirectory multiple></label>
${DEVELOPER_TOOLS ? '<label class="file-drop">개발용 ZIP 등록<input id="simple-zip" type="file" accept=".zip"></label>' : ''}
    <section id="simple-folder-choice" hidden>
      <label>등록할 게임 폴더<select id="simple-folder-root"></select></label>
      <p id="simple-folder-summary"></p>
      <button id="simple-folder-confirm" class="primary wide" type="button">이 폴더로 파일 검사</button>
    </section>
    <p class="hint">EFFECT 하위 RAW도 포함해 선택하세요. 등록할 게임 폴더 안의 상대 경로와 원래 이름 정보는 보존합니다.</p>
    <progress id="simple-progress" max="1" value="0" hidden></progress>
    <p id="simple-progress-text" role="status" aria-live="polite">압축파일을 먼저 해제해주세요.</p>
    <button id="import-diagnostics" type="button">등록 진단 JSON 다운로드</button>
    <section id="simple-choice" hidden>
      <p id="simple-analysis"></p><pre id="simple-issues"></pre>
      <label>처음 한 번 실행 파일 선택<select id="simple-executable"></select></label>
      <label id="simple-conflict-row" class="check-row" hidden><input id="simple-conflicts" type="checkbox">표시된 경로에 수정 파일을 적용합니다. 원본 파일은 보존됩니다.</label>
      <p class="hint">선택한 BAT 원문을 그대로 실행합니다. 미확인 초기화 명령은 설정의 파일 구조 분석에서 확인할 수 있습니다. DOSBox 설정은 실험용 시작점이며 실제 ED4 호환성을 보장하지 않습니다.</p>
      <button id="simple-confirm" class="primary wide" type="button" disabled>이 설정으로 등록</button>
    </section>
  </dialog>`);
  const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = find<HTMLDialogElement>('simple-import-dialog');
  const sourceIds = DEVELOPER_TOOLS ? ['simple-folder','simple-zip'] : ['simple-folder'];
  const folderSupported = folderPickerAvailable(find('simple-folder'), navigator.userAgent);
  let pendingFolder: FolderScan | undefined;
  find('import-diagnostics').onclick=()=>{
    if(!DEVELOPER_TOOLS){message('진단은 개발 빌드에서만 사용할 수 있습니다.');return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'ed4-import-diagnostics',appVersion:'0.5.0',diagnosticRevision:'phase7-runtime-1',userAgent:navigator.userAgent,trace:importTrace(),automaticDetection:latestDookyAttempt()},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='ed4-import-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let controller: AbortController | undefined, draft: MusicRegistration | undefined, processing = false;
  const message = (text: string) => { find('simple-progress-text').textContent = text; };
  function controls(disabled: boolean) {
    processing = disabled;
    for (const id of ['simple-kind','simple-base',...sourceIds,'simple-folder-root','simple-folder-confirm','simple-executable','simple-conflicts','simple-confirm'])
      find<HTMLInputElement>(id).disabled = disabled;
    find<HTMLInputElement>('simple-folder').disabled = disabled || !folderSupported;
    if (!disabled) { updateChoice(); folderSummary(); }
  }
  function updateChoice() {
    const candidate = draft?.analysis.candidates.find(c => c.path === find<HTMLSelectElement>('simple-executable').value);
    find<HTMLButtonElement>('simple-confirm').disabled = processing || !candidate?.entrySafe || (!!draft?.conflicts.length && !find<HTMLInputElement>('simple-conflicts').checked);
  }
  async function discard() {
    controller?.abort();
    pendingFolder = undefined; find('simple-folder-choice').hidden = true;
    const prior = draft; draft = undefined;
    await discardRegistration(prior);
  }
  async function cancel() {
    try { await discard(); options.notify('등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.'); }
    catch (error) { options.notify('등록은 취소했지만 임시 음악 정리를 완료하지 못했습니다. ' + advice(error), true); }
    dialog.close();
  }
  find('simple-cancel').onclick = () => void cancel();
  dialog.addEventListener('cancel', event => { event.preventDefault(); void cancel(); });
  let publicKind:ProfileKind='vanilla';
  const step=(n:number)=>{dialog.querySelectorAll('.import-steps li').forEach((e,i)=>{if(i===n)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});};
  const advice=(e:unknown)=>DEVELOPER_TOOLS?importAdvice(e):publicImportError(e);
  const open = async (kind:ProfileKind='vanilla') => {
    options.idle(); await discard(); controller = undefined;
    for (const id of sourceIds) find<HTMLInputElement>(id).value = '';
    publicKind=kind;find<HTMLSelectElement>('simple-kind').value = kind;
    if(!DEVELOPER_TOOLS)find('simple-heading').textContent=kind==='vanilla'?'원본 게임 등록':kind==='patch'?'수정 파일 추가':'전체 수정 게임 추가';step(0);
    find('simple-base-row').hidden = kind!=='patch'; find('simple-choice').hidden = true; find('simple-progress').hidden = true;
    const bases = options.profiles().filter(p => p.kind !== 'patch');
    find('simple-base').innerHTML = bases.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('');
    if (bases.some(p=>p.id===options.selected())) find<HTMLSelectElement>('simple-base').value = options.selected();
    controls(false); message(folderSupported?'게임이 있는 상위 폴더를 선택해도 됩니다. 하위 게임 폴더를 찾아드립니다.':folderUnavailable);
    dialog.showModal();
  };
  document.getElementById('simple-import')!.onclick = () => void options.run(()=>open());
  for (const id of ['simple-kind','simple-base']) find(id).onchange = () => void options.run(async()=>{
    await discard(); find('simple-choice').hidden = true;
    find('simple-base-row').hidden = find<HTMLSelectElement>('simple-kind').value !== 'patch';
    message(folderSupported?'압축을 푼 게임 폴더를 선택하세요.':folderUnavailable);
    for (const id of sourceIds) find<HTMLInputElement>(id).value = '';
  });
  for (const id of ['simple-executable','simple-conflicts']) find(id).onchange = updateChoice;
  async function finish(manual: boolean) {
    if (!draft || !controller) return;
    const completed = draft;
    message(DEVELOPER_TOOLS?'게임·프로필 IndexedDB 확정 중… 완료될 때까지 이 화면을 유지하세요.':'게임을 보관하고 있습니다. 잠시만 기다려 주세요.');
    const profile = await commitRegistration(completed, find<HTMLSelectElement>('simple-executable').value, manual, controller.signal);
    draft = undefined; controller = undefined;
    step(2);dialog.close();
    await options.done(profile);
    const musicNote = (completed.isoMusicFailed ? ' 게임 파일은 등록되었지만 음악 일부 또는 전체를 연결하지 못했습니다. ' : completed.isoMusicCount ? ` 음악 파일 ${completed.isoMusicCount}개를 연결했습니다. ` : '') + (completed.musicNotes ?? []).join(' ');
    options.notify((!DEVELOPER_TOOLS?'등록 완료. 이제 «모험 시작»을 누르세요. 다음부터 파일을 다시 선택할 필요가 없습니다.':'등록 완료. 다음부터 파일을 다시 고르지 않고 «게임 실행»을 누르면 됩니다.' + (profile.music ? ' RAW 음악도 연결했습니다.' : ' 이 프로필에는 RAW 음악이 없습니다.')) + musicNote);
  }
  async function guarded(action: () => Promise<void>) {
    controls(true);
    try { await action(); }
    catch (error) {
      failImport(error);
      const prior = draft; draft = undefined;
      await discardRegistration(prior).catch(e => options.notify(advice(e), true));
      message(advice(error)); options.notify(advice(error), true);
      find('simple-choice').hidden = true;
      for (const id of sourceIds) find<HTMLInputElement>(id).value = '';
    } finally { controls(false); find('simple-progress').hidden = true; }
  }
  function folderSummary() {
    if (!pendingFolder) return;
    const selection = folderMusicPlan(pendingFolder, find<HTMLSelectElement>('simple-folder-root').value, (DEVELOPER_TOOLS?find<HTMLSelectElement>('simple-kind').value:publicKind)==='patch');
    find<HTMLButtonElement>('simple-folder-confirm').disabled = processing || selection.needsRootChoice;
    find('simple-folder-summary').textContent = selection.needsRootChoice ? '여러 게임 설치본을 찾았습니다. 목록에서 게임 폴더 하나를 선택해 주세요.' : `${selection.files.length}개 파일을 등록합니다. ` +
      (selection.excluded ? `선택 폴더 밖 ${selection.excluded}개 파일은 포함하지 않습니다. ` : '') +
      (selection.outsideRaw ? '폴더 밖 음악은 등록 후 음악 연결에서 추가할 수 있습니다. ' : '') +
      (selection.iso ? 'ISO 음악도 자동으로 확인해 연결합니다. ' : '') + selection.notes.join(' ') + ' ' +
      '원본 파일은 변경하지 않습니다.';
  }
  find('simple-folder-root').onchange = folderSummary;
  find('simple-folder-confirm').onclick = () => void options.run(()=>guarded(async()=>{
    if (!pendingFolder) return;
    const root=find<HTMLSelectElement>('simple-folder-root').value;
    const patch=(DEVELOPER_TOOLS?find<HTMLSelectElement>('simple-kind').value:publicKind)==='patch';
    controller=new AbortController();
    const inspected=!patch?await inspectDookyFolder(pendingFolder,controller.signal,root):undefined;
    controller.signal.throwIfAborted();
    if(inspected)rememberDookyAttempt(inspected.report);
    const selection = folderMusicPlan(pendingFolder, root, patch);
    if(selection.needsRootChoice)throw new FolderSelectionError('게임 폴더 하나를 선택해 주세요.');
    pendingFolder = undefined; find('simple-folder-choice').hidden = true;
    await prepare(selection.files, selection.name, selection.iso, [...selection.notes,...(DEVELOPER_TOOLS&&inspected&&!inspected.plan?[dookyAdvice(inspected.report)]:[])], selection.startup,inspected?.plan,inspected?.report);
  }));
  for (const selector of sourceIds) find<HTMLInputElement>(selector).onchange = () => void options.run(()=>guarded(async()=>{
    options.idle(); await discard();
    find('simple-choice').hidden = true;
    const files = Array.from(find<HTMLInputElement>(selector).files ?? []); if (!files.length) return;
    if (selector === 'simple-folder') {
      if (!folderSupported) throw new FolderSelectionError(folderUnavailable);
      const kind = DEVELOPER_TOOLS?find<HTMLSelectElement>('simple-kind').value:publicKind;
      const scan = scanGameFolder(files, kind === 'patch');
      controller=new AbortController();
      const inspected=kind!=='patch'?await inspectDookyFolder(scan,controller.signal):undefined;
      if(inspected)rememberDookyAttempt(inspected.report);
      const automatic=inspected?.plan;
      controller.signal.throwIfAborted();
      const selected = folderMusicPlan(scan, automatic?.root??scan.preferred, kind === 'patch');
      const uniqueGame=scan.files.filter(f=>/(^|\/)GAME\.BAT$/i.test(f.path)).length===1;
      const automaticDistribution=kind!=='patch'&&uniqueGame&&selected.iso&&/(^|\/)DosBox\/CD\/ED4\.iso$/i.test(selected.iso.path);
      if (!automatic && !automaticDistribution && (scan.preferred || scan.roots.length > 1 || selected.skippedIso)) {
        pendingFolder = scan;
        find('simple-folder-root').innerHTML = scan.roots.map(root=>`<option value="${escape(root)}">${escape(root || scan.name + ' (선택한 폴더 전체)')}</option>`).join('');
        find<HTMLSelectElement>('simple-folder-root').value = scan.preferred;
        folderSummary(); find('simple-folder-choice').hidden = false;
        message('게임 폴더를 찾았습니다. 함께 등록할 파일 범위를 확인해 주세요.');
        return;
      }
      await prepare(selected.files, selected.name, selected.iso, [...selected.notes,...(DEVELOPER_TOOLS&&inspected&&!automatic?[dookyAdvice(inspected.report)]:[])], selected.startup,automatic,inspected?.report);
    } else if (DEVELOPER_TOOLS) await prepare(files[0], files[0].name);
  }));
  async function prepare(input: SourceInput[] | File, name: string, iso?:SourceInput, notes:string[]=[], startup?:SourceInput, automatic?:DookyAutoPlan, decision?:DookyDecision) {
    options.idle(); controller = new AbortController();
    const signal = controller.signal;
    find('simple-choice').hidden = true; find('simple-progress').hidden = false;
    find<HTMLProgressElement>('simple-progress').removeAttribute('value');
    step(1);message('파일 검사 중… 잠시만 기다려 주세요.');
    const kind = DEVELOPER_TOOLS?find<HTMLSelectElement>('simple-kind').value as ProfileKind:publicKind;
    const base = options.profiles().find(p=>p.id===find<HTMLSelectElement>('simple-base').value);
    const onProgress = (text:string, details?:import('./source-import').ImportProgress)=>{
      message(DEVELOPER_TOOLS||/^(ISO|음악 파일|음악을 보관|게임 파일 확인)/.test(text)?text:(iso?'게임과 ISO 음악을 보관하고 있습니다…':'파일을 확인하고 보관하고 있습니다…'));
      if (details) find<HTMLProgressElement>('simple-progress').value = details.totalBytes ? details.completedBytes/details.totalBytes : 0;
    };
    draft = Array.isArray(input)?await prepareFolderMusic(input,name,kind,base,onProgress,signal,iso,notes,startup,automatic,decision):await prepareRegistration(input,name,kind,base,onProgress,signal);
    signal.throwIfAborted();
    if(draft.registrationDecision)rememberDookyAttempt(draft.registrationDecision);
    find('simple-analysis').textContent = !DEVELOPER_TOOLS?'게임을 시작할 파일을 한 번만 선택해 주세요.':draft.analysis.reason + ' 참조 누락·형식 분석은 참고 정보입니다. 직접 선택하면 원본 파일 그대로 DOS 실행을 시도합니다. 실제 필수 파일이 없으면 게임 내부에서 실패할 수 있습니다.';
    find('simple-issues').hidden=!DEVELOPER_TOOLS&&!draft.conflicts.length;
    find('simple-issues').textContent = !DEVELOPER_TOOLS?'수정 파일이 적용되는 위치:\n'+draft.conflicts.join('\n'):draft.analysis.candidates.map(c=>`${c.path}${c.missing.length ? '\n누락: '+c.missing.join(', ') : ''}${c.warnings.length ? '\n확인: '+c.warnings.join(' / ') : ''}`).join('\n\n') + (draft.conflicts.length ? '\n\n원본과 충돌: '+draft.conflicts.join(', ') : '');
    find('simple-executable').innerHTML = '<option value="">실행 파일을 선택하세요</option>' + draft.analysis.candidates.map(c=>`<option value="${escape(c.path)}" ${!c.entrySafe?'disabled':''}>${escape(draft!.archive.originalPaths?.[c.path] ?? c.path)}${!c.entrySafe?' · 실행 경로 확인':c.blocked?' · 확인 후 실행 가능':''}</option>`).join('');
    find<HTMLSelectElement>('simple-executable').value = draft.analysis.automatic ?? '';
    find('simple-conflict-row').hidden = !draft.conflicts.length; find<HTMLInputElement>('simple-conflicts').checked = false;
    if (draft.analysis.automatic && !draft.conflicts.length) await finish(false);
    else { find('simple-choice').hidden = false; message(DEVELOPER_TOOLS?'파일 분석 완료. 아래 내용을 확인하고 실행 파일을 한 번만 선택하세요.':(draft.analysis.candidates.some(c=>c.entrySafe)?'파일 검사가 끝났습니다. 실행 파일을 선택해 등록을 마무리하세요.':'실행할 파일을 찾지 못했습니다. 실행 파일이 포함된 게임 폴더인지, 파일 이름을 사용할 수 있는지 확인해 주세요.')); }
  }
  find('simple-confirm').onclick = () => void options.run(()=>guarded(async()=>{
    if (draft?.conflicts.length && !find<HTMLInputElement>('simple-conflicts').checked) throw Error('수정 파일 충돌 경로를 확인하세요.');
    await finish(true);
  }));

  if(!DEVELOPER_TOOLS){
    const kind=find('simple-kind');const input=document.createElement('input');input.type='hidden';input.id='simple-kind';input.value='vanilla';kind.closest('label')!.replaceWith(input);
    find('simple-heading').textContent='원본 게임 등록';
    dialog.querySelector('p')!.textContent='압축파일을 먼저 해제한 뒤 게임 폴더를 선택해주세요. 음악 이미지가 있으면 함께 확인하며 서버로 보내지 않습니다.';
    dialog.querySelector('p')!.insertAdjacentHTML('afterend','<ol class="import-steps" aria-label="등록 순서"><li aria-current="step">1 폴더 선택</li><li>2 파일 검사</li><li>3 등록 완료</li></ol>');
    for(const e of dialog.querySelectorAll<HTMLElement>('.hint'))e.hidden=true;
    find('import-diagnostics').hidden=true;
    const pickers=document.createElement('div');pickers.className='import-pickers';const folder=find('simple-folder').closest('label')!;folder.before(pickers);pickers.append(folder);
    document.querySelector('#simple-import')!.insertAdjacentHTML('afterend','<button id="mode-manage" type="button">모드 관리</button>');
    document.querySelector('#app')!.insertAdjacentHTML('beforeend','<dialog id="mode-manager"><div class="dialog-heading"><h2>모드 관리</h2><button id="mode-close">닫기</button></div><p>원본과 별도의 프로필로 보관합니다. 저장도 서로 분리됩니다.</p><div class="mode-options"><button id="mode-patch">원본에 수정 파일 추가</button><button id="mode-standalone">전체 수정 게임 추가</button><button id="mode-settings">선택한 프로필 관리</button></div></dialog>');
    find('mode-manage').onclick=()=>void options.run(async()=>{options.idle();if(!options.profiles().length)throw Error('원본 게임을 먼저 등록하세요.');find<HTMLDialogElement>('mode-manager').showModal();});
    find('mode-close').onclick=()=>find<HTMLDialogElement>('mode-manager').close();
    for(const [button,kind] of [['mode-patch','patch'],['mode-standalone','standalone']] as const)find(button).onclick=()=>void options.run(async()=>{options.idle();if(!options.profiles().length)throw Error('원본 게임을 먼저 등록하세요.');find<HTMLDialogElement>('mode-manager').close();await open(kind);});
    find('mode-settings').onclick=()=>{find<HTMLDialogElement>('mode-manager').close();document.querySelector<HTMLButtonElement>('#edit-profile')!.click();};
  }
}
