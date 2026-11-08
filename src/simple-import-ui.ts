import type { Profile, ProfileKind } from "./model";
import { prepareRegistration, commitRegistration, discardRegistration, importAdvice, type Registration } from "./simple-registration";
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
    <label>등록할 게임<select id="simple-kind"><option value="vanilla">바닐라 · 원본 게임</option><option value="patch">모드 A · 수정 파일</option><option value="standalone">모드 B · 전체 수정 게임</option></select></label>
    <label id="simple-base-row" hidden>공유할 원본 프로필<select id="simple-base"></select></label>
    <label class="file-drop">게임 폴더 선택 · 권장<input id="simple-folder" type="file" webkitdirectory multiple></label>
    <label class="file-drop">또는 게임 ZIP 선택<input id="simple-zip" type="file" accept=".zip"></label>
    <p class="hint">EFFECT 하위 RAW도 포함해 선택하세요. 최상위 선택 폴더 이름만 제외하며 내부 경로와 원래 이름 정보는 보존합니다.</p>
    <progress id="simple-progress" max="1" value="0" hidden></progress>
    <p id="simple-progress-text" role="status" aria-live="polite">폴더 선택을 지원하지 않으면 ZIP을 사용하세요.</p>
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
  find('import-diagnostics').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'ed4-import-diagnostics',appVersion:'0.5.0',diagnosticRevision:'phase6-hotfix2',userAgent:navigator.userAgent,trace:importTrace()},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='ed4-import-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let controller: AbortController | undefined, draft: Registration | undefined, processing = false;
  const message = (text: string) => { find('simple-progress-text').textContent = text; };
  function controls(disabled: boolean) {
    processing = disabled;
    for (const id of ['simple-kind','simple-base','simple-folder','simple-zip','simple-executable','simple-conflicts','simple-confirm'])
      find<HTMLInputElement>(id).disabled = disabled;
    if (!disabled) updateChoice();
  }
  function updateChoice() {
    const candidate = draft?.analysis.candidates.find(c => c.path === find<HTMLSelectElement>('simple-executable').value);
    find<HTMLButtonElement>('simple-confirm').disabled = processing || !candidate || candidate.blocked || (!!draft?.conflicts.length && !find<HTMLInputElement>('simple-conflicts').checked);
  }
  async function discard() {
    controller?.abort();
    const prior = draft; draft = undefined;
    await discardRegistration(prior);
  }
  async function cancel() {
    try { await discard(); options.notify('등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.'); }
    catch (error) { options.notify('등록은 취소했지만 임시 음악 정리를 완료하지 못했습니다. ' + importAdvice(error), true); }
    dialog.close();
  }
  find('simple-cancel').onclick = () => void cancel();
  dialog.addEventListener('cancel', event => { event.preventDefault(); void cancel(); });
  const open = async () => {
    options.idle(); await discard(); controller = undefined;
    for (const id of ['simple-folder','simple-zip']) find<HTMLInputElement>(id).value = '';
    find<HTMLSelectElement>('simple-kind').value = 'vanilla';
    find('simple-base-row').hidden = true; find('simple-choice').hidden = true; find('simple-progress').hidden = true;
    const bases = options.profiles().filter(p => p.kind !== 'patch');
    find('simple-base').innerHTML = bases.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('');
    if (bases.some(p=>p.id===options.selected())) find<HTMLSelectElement>('simple-base').value = options.selected();
    controls(false); message('폴더 선택을 지원하면 게임 폴더를 먼저 선택하세요. RAW를 직접 분리할 필요가 없습니다.');
    dialog.showModal();
  };
  document.getElementById('simple-import')!.onclick = () => void options.run(open);
  for (const id of ['simple-kind','simple-base']) find(id).onchange = () => void options.run(async()=>{
    await discard(); find('simple-choice').hidden = true;
    find('simple-base-row').hidden = find<HTMLSelectElement>('simple-kind').value !== 'patch';
    message('등록할 폴더 또는 ZIP을 선택하세요.');
    for (const id of ['simple-folder','simple-zip']) find<HTMLInputElement>(id).value = '';
  });
  for (const id of ['simple-executable','simple-conflicts']) find(id).onchange = updateChoice;
  async function finish(manual: boolean) {
    if (!draft || !controller) return;
    const completed = draft;
    message('게임·프로필 IndexedDB 확정 중… 완료될 때까지 이 화면을 유지하세요.');
    const profile = await commitRegistration(completed, find<HTMLSelectElement>('simple-executable').value, manual, controller.signal);
    draft = undefined; controller = undefined;
    dialog.close();
    await options.done(profile);
    options.notify('등록 완료. 다음부터 파일을 다시 고르지 않고 «게임 실행»을 누르면 됩니다.' + (profile.music ? ' RAW 음악도 연결했습니다.' : ' 이 프로필에는 RAW 음악이 없습니다.'));
  }
  async function guarded(action: () => Promise<void>) {
    controls(true);
    try { await action(); }
    catch (error) {
      failImport(error);
      const prior = draft; draft = undefined;
      await discardRegistration(prior).catch(e => options.notify(importAdvice(e), true));
      message(importAdvice(error)); options.notify(importAdvice(error), true);
      find('simple-choice').hidden = true;
      for (const id of ['simple-folder','simple-zip']) find<HTMLInputElement>(id).value = '';
    } finally { controls(false); find('simple-progress').hidden = true; }
  }
  for (const selector of ['simple-folder','simple-zip']) find<HTMLInputElement>(selector).onchange = () => void options.run(()=>guarded(async()=>{
    options.idle(); await discard(); controller = new AbortController();
    const signal = controller.signal;
    const files = Array.from(find<HTMLInputElement>(selector).files ?? []); if (!files.length) return;
    const folder = selector === 'simple-folder';
    const input = folder ? files.map(file=>({file,path:file.webkitRelativePath.split('/').slice(1).join('/')})) : files[0];
    const name = folder ? files[0].webkitRelativePath.split('/')[0] : files[0].name;
    find('simple-choice').hidden = true; find('simple-progress').hidden = false;
    find<HTMLProgressElement>('simple-progress').removeAttribute('value');
    message('파일 구조와 저장 공간 확인 중…');
    const kind = find<HTMLSelectElement>('simple-kind').value as ProfileKind;
    const base = options.profiles().find(p=>p.id===find<HTMLSelectElement>('simple-base').value);
    draft = await prepareRegistration(input, name, kind, base, (text, details)=>{
      message(text);
      if (details) find<HTMLProgressElement>('simple-progress').value = details.totalBytes ? details.completedBytes/details.totalBytes : 0;
    }, signal);
    signal.throwIfAborted();
    find('simple-analysis').textContent = draft.analysis.reason;
    find('simple-issues').textContent = draft.analysis.candidates.map(c=>`${c.path}${c.missing.length ? '\n누락: '+c.missing.join(', ') : ''}${c.warnings.length ? '\n확인: '+c.warnings.join(' / ') : ''}`).join('\n\n') + (draft.conflicts.length ? '\n\n원본과 충돌: '+draft.conflicts.join(', ') : '');
    find('simple-executable').innerHTML = '<option value="">실행 파일을 선택하세요</option>' + draft.analysis.candidates.map(c=>`<option value="${escape(c.path)}" ${c.blocked?'disabled':''}>${escape(draft!.archive.originalPaths?.[c.path] ?? c.path)}${c.blocked?' · 누락/미지원':''}</option>`).join('');
    find<HTMLSelectElement>('simple-executable').value = draft.analysis.automatic ?? '';
    find('simple-conflict-row').hidden = !draft.conflicts.length; find<HTMLInputElement>('simple-conflicts').checked = false;
    if (draft.analysis.automatic && !draft.conflicts.length) await finish(false);
    else { find('simple-choice').hidden = false; message('파일 분석 완료. 아래 내용을 확인하고 실행 파일을 한 번만 선택하세요.'); }
  }));
  find('simple-confirm').onclick = () => void options.run(()=>guarded(async()=>{
    if (draft?.conflicts.length && !find<HTMLInputElement>('simple-conflicts').checked) throw Error('수정 파일 충돌 경로를 확인하세요.');
    await finish(true);
  }));
}
