import {EnvironmentObservation,observeEnvironmentBatch,executableIdentities,type EnvironmentMode} from './environment-comparison';
import "./style.css";
import {
  compose,
  executables,
  buildBundle,
  validateExecutable,
  analyzeFiles,
  dosConfig,
} from "./archive";
import { DEFAULT_SETTINGS, id, type Archive, type Profile } from "./model";
import {
  listCatalog,
  getArchive,
  getProfileArchives,
  reconnectArchive,
  putProfile,
  getSave,
  putSave,
  deleteSave,
  deleteProfile,
  deleteArchive,
  saveLibrary,
  storageError,
  recoverSave,
} from "./storage";
import { exportBackup, importBackup, recoverProfile } from "./backup";
import { importArchive } from "./importer";
import { identity, checkIdentity, checkRequirements } from "./integrity";
import { reconcileSave, overlayFiles, deletedFiles } from "./save-state";
import { conflicts, layerFiles, orderImpact } from "./compatibility";
import { buildRuntime } from "./runtime-builder";
import { measurements, record } from "./telemetry";
import { PRESETS } from "./presets";
import { DosEngine } from "./engine";
import {installPlayUi} from "./play-ui";
import {installLauncherUpdate} from './launcher-update';
import {installScenePanel} from './scene-panel';
import { bindControls, KEY } from "./controls";
import { importGameZip, importSources } from "./source-import";
import {
  listMusic,
  musicDirectory,
  musicMounts,
  musicReferences,
  removeMusic,
  type MusicPack,
} from "./music";
import { RawPreview, rawInfo } from "./raw-audio";
import { enterLandscape } from "./mobile";
import { inspectGame } from "./file-analysis";
import { installSimpleImport } from "./simple-import-ui";
import { importTrace } from './import-trace';
import { bootPlan, BootTrace } from './boot-trace';
import { runtimeComparison, type ComparisonMode } from './runtime-comparison';
import type { Files, DosSettings } from './model';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const size = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;
const kindName = {
  vanilla: "바닐라",
  patch: "수정 파일 모드",
  standalone: "독립 모드",
};
let archives: Archive[] = [],
  profiles: Profile[] = [],
  selected = "";
let engine: DosEngine | undefined,
  running: Profile | undefined,
  busy = false,
  paused = false,
  writable = false;
let checkpointPromise: Promise<void> | undefined;
let activeSourcePaths: string[] = [];
let imported: Archive | undefined;
let installPrompt: (Event & { prompt(): Promise<void> }) | undefined;
const logs: string[] = [];
const rawPreview = new RawPreview();
let lastEngineMetrics: ReturnType<DosEngine["diagnostics"]> | undefined;
let lastError = "";
let diagnosticRun=false;
let bootTrace:BootTrace|undefined;
let environmentObservation:EnvironmentObservation|undefined;
let bootSettings:{environment?:{id:EnvironmentMode;requestedNosound:boolean;observations:EnvironmentObservation["samples"];files:Awaited<ReturnType<typeof executableIdentities>>;note:string};profileId:string;original:DosSettings;comparison:DosSettings;config:string;runtimeComparison?:{mode:ComparisonMode;entry:string;rawMounted:boolean;mountedFiles:number;baselineEntry?:string;changedFactor?:string}}|undefined;

$("#app").innerHTML = `
<header class="topbar"><a class="brand" href="./"><span class="brand-mark">E<span>4</span></span><span>ED4 <b>MOBILE</b><small>PERSONAL DOS LIBRARY</small></span></a><div class="header-right"><span class="phase">PHASE 02</span><span id="offline" class="badge">온라인 준비</span><button id="install" class="quiet">앱 설치</button></div></header>
<main class="workspace">
<aside class="library"><div class="section-heading"><span class="eyebrow">내 라이브러리</span><span id="profile-count">00</span></div><h1>오래된 모험,<br>새로운 화면.</h1><p class="intro">구영웅전설4 · DOS 에디션<br>내 파일로 만드는 나만의 실행 공간</p><button id="open-import" class="primary wide">＋ 게임 / 모드 등록</button><nav id="profiles" aria-label="실행 프로필"></nav><button id="demo" class="demo"><span>◇</span><div>먼저 실행 환경 확인하기<small>공개 DOS 테스트 프로그램</small></div><span>↗</span></button><div class="library-bottom"><span class="small-label">LOCAL FIRST</span><p>게임 파일은 이 브라우저에만 저장됩니다.<br>게임 원본은 제공하지 않습니다.</p><button id="storage-open" class="quiet">저장 공간 관리 ↗</button></div></aside>
<section class="main-panel"><div class="title-row"><div><span id="profile-kind" class="eyebrow">실행 준비</span><h2 id="profile-title">모험을 준비하세요</h2></div><span class="engine-chip">js-dos <b>v7</b></span></div>
<div id="play-area" class="play-area"><div class="screen-frame"><div class="screen-top"><span class="led"></span><span id="screen-label">DOS DISPLAY</span><span id="run-state">대기 중</span></div><div class="screen"><canvas id="canvas" width="640" height="400" tabindex="0" aria-label="DOS 실행 화면"></canvas><div id="empty-screen"><span class="pixel-emblem">Ⅳ</span><h3>당신의 모험을 이어서</h3><p>보유한 게임 ZIP을 등록하거나<br>공개 테스트 프로그램으로 시작하세요.</p><span class="screen-footnote">Galaxy 원본 실행·한글·오디오 확인 · 저장 실기 검증 필요</span></div></div></div>
<div id="touch-controls" class="touch-controls"><div id="direction-pad" role="group" aria-label="4방향 버튼"><button class="up" data-key="265" aria-label="위">↑</button><button class="left" data-key="263" aria-label="왼쪽">←</button><button class="right" data-key="262" aria-label="오른쪽">→</button><button class="down" data-key="264" aria-label="아래">↓</button></div><div class="action-pad"><button id="cancel-key" data-key="256" aria-label="ESC">ESC<small hidden>Esc</small></button><button id="confirm-key" data-key="257" aria-label="Enter">Enter<small hidden>Enter</small></button></div><button id="menu-key" data-key="32" hidden>메뉴<small>Space</small></button></div>
<div class="player-toolbar"><button id="play" class="primary">▶ 실행</button><button id="pause">일시 정지</button><button id="stop">저장 후 종료</button><span class="toolbar-spacer"></span><button id="keyboard-toggle" aria-expanded="false">키보드</button><button id="fullscreen">전체 화면 ⛶</button></div>
<div id="virtual-keyboard" class="virtual-keyboard" hidden></div></div>
<div id="status" role="status" aria-live="polite">게임 원본 없이도 공개 테스트 프로그램으로 실행 환경을 확인할 수 있습니다.</div>
<div class="detail-grid"><section class="card"><div class="card-heading"><h3>실행 프로필</h3><button id="edit-profile" class="quiet">설정 ↗</button></div><dl><div><dt>실행 파일</dt><dd id="exe-label">등록 전</dd></div><div><dt>적용 순서</dt><dd id="layers-label">원본 → 수정 파일 → 저장 변경분</dd></div><div><dt>저장 공간</dt><dd id="save-label">프로필마다 독립적으로 보관</dd></div></dl><div class="card-actions"><button id="add-patch">수정 ZIP 추가</button><button id="backup">저장 백업</button><button id="restore">백업 가져오기</button></div></section>
<section class="card"><div class="card-heading"><h3>터치 컨트롤</h3><span class="subtle">가로 화면 권장</span></div><label class="range-row">버튼 크기<input id="control-size" type="range" min="38" max="76" value="50"><output id="size-value">50</output></label><label class="range-row">가장자리 간격<input id="control-inset" type="range" min="0" max="72" value="16"><output id="inset-value">16</output></label><label class="range-row">소리<input id="volume" type="range" min="0" max="100" value="60"><button id="audio" class="quiet">소리 켜기</button></label><p class="hint">확인 Enter · 취소 Esc · 메뉴 Space는 임시 매핑입니다. 실제 게임 입력키는 검증 후 조정합니다.</p></section></div>
<details class="diagnostics"><summary>실행 기록 / 입력 설정</summary><div class="mapping"><label>확인<select id="map-confirm"></select></label><label>취소<select id="map-cancel"></select></label><label>메뉴<select id="map-menu"></select></label></div><pre id="logs" aria-label="실행 기록">엔진 시작 대기</pre></details>
<footer><span>ED4 MOBILE / PHASE 2</span><a href="./licenses/NOTICE.html" target="_blank" rel="noopener">오픈소스 및 라이선스 ↗</a></footer></section></main>
<dialog id="import-dialog"><form id="import-form"><div class="dialog-heading"><div><span class="eyebrow">ADD TO LIBRARY</span><h2>게임 / 모드 등록</h2></div><button type="button" data-close="import-dialog" class="quiet">닫기 ✕</button></div><p>사용 권한이 있는 게임 ZIP을 선택하세요. ZIP 내부 경로를 그대로 사용하며, 실행 파일은 직접 확인합니다.</p><label>등록 방식<select id="import-kind"><option value="vanilla">바닐라 · 원본 게임</option><option value="patch">모드 A · 원본에 수정 파일 적용</option><option value="standalone">모드 B · 수정된 게임 전체</option></select></label><label id="base-row" hidden>기반 원본<select id="import-base"></select></label><label class="file-drop">ZIP 선택<input id="zip-file" type="file" accept=".zip"></label><div id="zip-info" class="import-info">본체 최대 256 MiB · RAW 분리 경로 전체 768 MiB · ASCII 경로</div><label>프로필 이름<input id="import-name" maxlength="60" required placeholder="예: 구영웅전설4 · 바닐라"></label><label>실행 파일<select id="import-exe" required><option value="">ZIP을 먼저 선택하세요</option></select></label><label id="conflict-row" class="check-row" hidden><input id="allow-conflicts" type="checkbox">표시된 경로는 수정 ZIP이 우선 적용되는 것을 확인했습니다.</label><p class="hint">한글 구동용 배치 파일이 있으면 그 파일을 선택하세요. 별도 초기화 명령은 등록 후 실행 설정에서 편집할 수 있습니다.</p><button id="import-submit" class="primary wide" type="submit">프로필 등록</button></form></dialog>
<dialog id="settings-dialog"><form id="settings-form"><div class="dialog-heading"><h2>실행 설정</h2><button type="button" data-close="settings-dialog" class="quiet">닫기 ✕</button></div><label>이름<input id="edit-name" maxlength="60" required></label><label>실행 파일<select id="edit-exe"></select></label><div class="form-grid"><label>CPU cycles<input id="cycles" type="number" min="1000" max="100000" step="1000"></label><label>메모리<select id="memory"><option>8</option><option>16</option><option>32</option><option>64</option></select></label><label>사운드 카드<select id="sound"><option value="sb16">Sound Blaster 16</option><option value="sbpro2">Sound Blaster Pro 2</option><option value="none">사용 안 함</option></select></label></div><label>실행 전 DOS 명령 (선택한 실행 파일의 폴더 기준)<textarea id="prelude" rows="4" maxlength="4000" placeholder="예: 한글 드라이버 / 초기화 배치 실행"></textarea></label><p class="hint">직접 확인한 DOS 명령만 입력하세요. 게임별 적정 설정은 아직 미검증입니다.</p><h3>수정 파일 우선순위</h3><p class="hint">아래 항목이 위 항목보다 나중에 적용됩니다. 저장 변경분은 마지막에 적용됩니다.</p><div id="patch-list"></div><button class="primary wide" type="submit">설정 저장</button><button type="button" id="remove-profile" class="danger wide">프로필 삭제 (게임 데이터와 저장 백업은 유지)</button></form></dialog>
<dialog id="storage-dialog"><div class="dialog-heading"><h2>저장 공간 관리</h2><button data-close="storage-dialog" class="quiet">닫기 ✕</button></div><p id="storage-estimate"></p><button id="persist-storage">영구 저장 요청</button><p class="hint">브라우저 데이터 삭제 시 게임과 저장이 함께 사라질 수 있습니다. 중요한 저장은 ZIP으로 백업하세요. 런처 저장은 게임 내부 저장 후에 눌러야 합니다.</p><button id="recover-profile">백업에서 프로필 복구</button><h3>게임 데이터 ZIP</h3><div id="archive-list"></div><h3>프로필별 저장 변경분</h3><div id="save-list"></div></dialog>
<input id="recover-file" type="file" accept=".zip" hidden><input id="patch-file" type="file" accept=".zip" hidden><input id="restore-file" type="file" accept=".zip" hidden><input id="relink-file" type="file" accept=".zip" hidden>
`;

$(".phase").textContent = "PHASE 09 · 플레이";
$("footer span").textContent = "ED4 MOBILE / LOCAL PLAY";
$("#play-area").insertAdjacentHTML(
  "afterbegin",
  '<div id="rotate-notice" role="status">기기를 가로로 회전하면 게임 화면이 더 크게 표시됩니다.</div><div id="session-notice" role="status"></div>',
);
$("#zip-file").parentElement!.insertAdjacentHTML(
  "afterend",
  '<label class="file-drop">폴더 선택 (지원 브라우저)<input id="folder-file" type="file" webkitdirectory multiple></label><p class="hint">선택 폴더의 최상위 이름만 제외하고 내부 경로를 유지합니다. RAW는 OPFS에 별도 보관합니다. 대용량 ZIP은 최대 768 MiB, 본체는 해제 후 256 MiB입니다. 작은 ZIP은 기존 검사 경로를 사용합니다.</p>',
);
$("#app").insertAdjacentHTML(
  "beforeend",
  '<input id="relink-folder" type="file" webkitdirectory multiple hidden>',
);
$("#control-inset").parentElement!.insertAdjacentHTML(
  "afterend",
  '<label class="range-row">버튼 불투명도<input id="control-opacity" type="range" min="20" max="100" value="85"><output id="opacity-value">85</output></label><label class="range-row">버튼 세로 위치<input id="control-y" type="range" min="0" max="35" value="0"><output id="y-value">0</output></label>',
);
$(".diagnostics").insertAdjacentHTML(
  "beforebegin",
  `<section class="card phase3-card"><h3>RAW 음악 · 별도 보관</h3>${import.meta.env.VITE_INCLUDE_SYNTHETIC_RAW !== "false" ? '<a href="./synthetic-raw.zip" download>합성 RAW 2곡 테스트 ZIP 다운로드 (CC0)</a>' : ""}<p class="hint">본체와 음악 버전을 직접 확인하세요. 간편 등록에 포함된 음악은 자동 연결합니다. 여기서 별도 추가한 음악은 직접 연결하세요. DOS 내부 재생을 위한 읽기 전용 파일로 제공하며 실제 ED4 연동은 Galaxy 검증 대상입니다.</p><label>RAW 파일 추가<input id="music-files" type="file" accept=".raw" multiple></label><label>RAW 폴더 추가<input id="music-folder" type="file" webkitdirectory multiple></label><label>RAW ZIP 추가<input id="music-zip" type="file" accept=".zip"></label><label>공유 음악 보관함<select id="music-pack"><option value="">음악 없음</option></select></label><label>DOS 배치 경로 (예: ED4, 루트면 빈칸)<input id="music-prefix" maxlength="150" placeholder="음악 파일이 필요한 폴더"></label><div class="card-actions"><button id="music-link">현재 프로필에 연결</button><button id="music-delete" class="danger">선택 음악 삭제</button></div><label>진단용 곡 선택<select id="music-track"></select></label><div class="card-actions"><button id="raw-preview">선택 곡 시험 재생</button><button id="raw-stop">시험 재생 중지</button></div><pre id="music-info">음악 없이 게임 본체만 실행할 수 있습니다.</pre><p class="hint">시험 재생: 22050 Hz · signed PCM16 LE · 스테레오 · 헤더 8바이트 가정. 헤더 의미는 미확인입니다. 게임 음악 명령과 동기화되지 않으며 임의 자동 선곡하지 않습니다.</p></section>`,
);
let musicPacks: MusicPack[] = [];
async function refreshMusic() {
  musicPacks = await listMusic();
  $("#music-pack").innerHTML =
    '<option value="">음악 없음</option>' +
    musicPacks
      .map(
        (p) =>
          `<option value="${p.id}">${esc(p.name)} · ${p.tracks.length}곡 · ${size(p.bytes)}</option>`,
      )
      .join("");
  const p = profiles.find((p) => p.id === selected);
  $<HTMLSelectElement>("#music-pack").value = p?.music?.packId ?? "";
  $<HTMLInputElement>("#music-prefix").value = p?.music?.prefix ?? "";
  showTracks();
}
function showTracks() {
  const pack = musicPacks.find(
    (p) => p.id === $<HTMLSelectElement>("#music-pack").value,
  );
  $("#music-track").innerHTML =
    pack?.tracks
      .map((t, i) => `<option value="${i}">${esc(t.originalPath ?? t.path)}</option>`)
      .join("") ?? "";
  $("#music-info").textContent = pack
    ? `${pack.tracks.length}곡 / ${size(pack.bytes)} / OPFS / SHA-256 파일별 기록`
    : "음악 없음";
}
$("#music-pack").addEventListener("change", () => {
  rawPreview.stop();
  showTracks();
});
for (const selector of ["#music-files", "#music-folder", "#music-zip"])
  $<HTMLInputElement>(selector).onchange = () =>
    void task(async () => {
      idle();
      rawPreview.stop();
      const files = Array.from($<HTMLInputElement>(selector).files ?? []);
      if (!files.length) return;
      const input =
        selector === "#music-zip"
          ? files[0]
          : files.map((file) => ({
              file,
              path: file.webkitRelativePath
                ? file.webkitRelativePath.split("/").slice(1).join("/")
                : file.name,
            }));
      const result = await importSources(
        input,
        files[0].webkitRelativePath.split("/")[0] || files[0].name,
        true,
        (s) => ($("#music-info").textContent = s),
      );
      await refreshMusic();
      $<HTMLSelectElement>("#music-pack").value = result.pack?.id ?? "";
      showTracks();
      status(
        "음악을 별도 보관했습니다. 경로와 버전을 확인한 뒤 현재 프로필에 연결하세요.",
      );
    });
on("#music-link", async () => {
  idle();
  const p = structuredClone(current()),
    packId = $<HTMLSelectElement>("#music-pack").value;
  p.music = packId
    ? { packId, prefix: $<HTMLInputElement>("#music-prefix").value.trim() }
    : undefined;
  await musicMounts(p, await profileFiles(p), await getSave(p.id));
  await putProfile(p);
  await refresh();
  status(
    packId
      ? "선택한 음악을 이 프로필에 연결했습니다."
      : "이 프로필은 음악 없이 실행합니다.",
  );
});
on("#music-delete", async () => {
  idle();
  const packId = $<HTMLSelectElement>("#music-pack").value;
  if (!packId) return;
  if (profiles.some((p) => musicReferences(p).some(r => r.packId === packId)))
    throw Error("사용 중인 프로필의 음악 연결을 먼저 해제하세요.");
  if (
    !confirm(
      "선택한 음악 원본 보관함을 삭제할까요? 게임과 세이브는 유지합니다.",
    )
  )
    return;
  rawPreview.stop();
  await removeMusic(packId);
  await refreshMusic();
});
on("#raw-preview", async () => {
  idle();
  const pack = musicPacks.find(
      (p) => p.id === $<HTMLSelectElement>("#music-pack").value,
    ),
    track = pack?.tracks[Number($<HTMLSelectElement>("#music-track").value)];
  if (!pack || !track) throw Error("시험 재생할 곡을 선택하세요.");
  const file = await (
    await (await musicDirectory(pack.id)).getFileHandle(track.key)
  ).getFile();
  $("#music-info").textContent = JSON.stringify(
    rawInfo(file.size, new Uint8Array(await file.slice(0, 8).arrayBuffer())),
    null,
    2,
  );
  await rawPreview.play(file);
  $("#music-info").dataset.state = "playing";
});
on("#raw-stop", async () => {
  rawPreview.stop();
  $("#music-info").dataset.state = "stopped";
});
$<HTMLInputElement>("#folder-file").onchange = () =>
  void task(async () => {
    idle();
    imported = undefined;
    $("#import-exe").innerHTML = "";
    const files = Array.from($<HTMLInputElement>("#folder-file").files ?? []);
    if (!files.length) return;
    const root = files[0].webkitRelativePath.split("/")[0];
    const result = await importSources(
      files.map((file) => ({
        file,
        path: file.webkitRelativePath.split("/").slice(1).join("/"),
      })),
      root,
      false,
      (s) => ($("#zip-info").textContent = s),
    );
    imported = result.archive;
    $<HTMLInputElement>("#import-name").value = root;
    await inspectImport();
  });

$("#edit-exe").parentElement!.insertAdjacentHTML(
  "afterend",
  `<label>범용 DOSBox 프리셋 (ED4 미검증)<select id="preset"><option value="">직접 설정</option>${Object.entries(
    PRESETS,
  )
    .map(([key, v]) => `<option value="${key}">${v.name}</option>`)
    .join(
      "",
    )}</select></label><label>모드 참고 원본 버전 ID (달라도 실행 허용)<input id="required-version" maxlength="100"></label><label>저장 경로 규칙 (쉼표 구분, *.SAV / SAVE/ / 정확한 경로)<input id="save-paths" maxlength="1000"></label><p class="hint">규칙은 파일 분류용이며 삭제/보관 여부를 결정하지 않습니다. 기존 원본 경로의 비세이브 변경은 별도 리소스 변경 공간에 보관됩니다.</p>`,
);
$("#import-name").parentElement!.insertAdjacentHTML(
  "afterend",
  '<label>원본 버전 별칭 (선택, 영문/숫자)<input id="version-label" maxlength="80" placeholder="예: public-test-v2 · 비우면 SHA-256 사용"></label>',
);
$(".diagnostics").insertAdjacentHTML(
  "beforebegin",
  '<section class="card phase2-card"><div class="card-heading"><h3>게임 버전 참고 / 모드 호환성 진단</h3><button id="inspect-profile">파일 구조·충돌 검사</button></div><pre id="compatibility-report">프로필을 선택해 원본 버전, 경로, 레이어 및 저장 충돌을 확인하세요.</pre><button id="export-diagnostics">실행 로그·진단 JSON 내보내기</button><p class="hint">게임 파일 내용은 내보내지 않습니다. 파일 경로·프로필 설정·실행 로그는 포함됩니다. 메모리 수치는 정확한 버퍼 크기와 지원 브라우저의 관측값이며 전체 peak/RSS가 아닙니다.</p></section>',
);
$("#preset").addEventListener("change", () => {
  const preset = PRESETS[$<HTMLSelectElement>("#preset").value];
  if (!preset) return;
  $<HTMLInputElement>("#cycles").value = String(preset.settings.cycles);
  $<HTMLSelectElement>("#memory").value = String(preset.settings.memory);
  $<HTMLSelectElement>("#sound").value = preset.settings.sound;
});
async function diagnostic() {
  await engine?.refreshAudioDiagnostics();
  const p = selected ? current() : undefined;
  const save = p ? await getSave(p.id) : undefined;
  const input = p ? await loadProfile(p) : [];
  return {
    format: "ed4-diagnostics",
    launcher:launcherUpdate.report(),
    sceneSession:scenePanel.report(),
    version: 2,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    profile: p,
    archives: input.map((a) => ({
      id: a.id,
      name: a.name,
      identity: identity(a),
      analysis: a.analysis ?? analyzeFiles(a.files),
    })),
    conflicts: p ? conflicts(p, input, save) : [],
    save: save
      ? {
          schemaVersion: save.schemaVersion,
          savedPaths: Object.keys(save.files),
          resourcePaths: Object.keys(save.resources ?? {}),
          tombstones: deletedFiles(save),
        }
      : undefined,
    measurements: [...measurements],
    importTrace: importTrace(),
    bootTrace: bootTrace ? {...bootTrace.report(),active:diagnosticRun,scope:'마지막 임시 진단 세션 (현재 선택 프로필과 다를 수 있음)'} : undefined,
    bootSettings,
    playUi:playUiSnapshot(),
    engine: engine?.diagnostics() ?? lastEngineMetrics,
    rawPreview: {
      state: rawPreview.state,
      samples: rawPreview.samples,
      audioState: rawPreview.audioState,
    },
    music: (await listMusic()).map((p) => ({
      id: p.id,
      name: p.name,
      bytes: p.bytes,
      tracks: p.tracks.map(({path, originalPath, size, sha256, previewCompatible}) =>
        ({path, originalPath, size, sha256, previewCompatible})),
    })),
    storage: await navigator.storage?.estimate(),
    screen: {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      fullscreen: !!document.fullscreenElement,
      orientation: screen.orientation?.type,
    },
    staticAnalysis: input.map((a) => {
      const report = inspectGame(a.files);
      return {
        ...report,
        batches: report.batches.map((b) => ({
          path: b.path,
          truncated: b.truncated,
        })),
      };
    }),
    logs: [...logs],
    appVersion: "0.5.0",
    diagnosticRevision: 'phase7-runtime-1',
    runStage: $("#run-state").textContent,
    lastError,
    verification: "사용자 실기 확인: Galaxy Phase9-7에서 원본 게임 실행·한글·이동·모노 오디오 정상, RAW53개 연결·읽기 관측. JSON16 원문이 아닌 사용자 확인 결과를 반영. 세이브 영구 저장 및 게임 2×와 BGM1× 동시 보존은 미검증.",
  };
}
on("#inspect-profile", async () => {
  const data = await diagnostic();
  const files = selected ? await profileFiles(current()) : {};
  $("#compatibility-report").textContent = JSON.stringify(
    { ...data, batchContents: inspectGame(files).batches },
    null,
    2,
  );
});
on("#export-diagnostics", async () => {
  let data;
  try {
    data = await diagnostic();
  } catch (error) {
    data = {
      format: "ed4-diagnostics",
      version: 2,
      profile: selected ? current() : undefined,
      measurements,
      importTrace: importTrace(),
      bootTrace: bootTrace ? {...bootTrace.report(),active:diagnosticRun,scope:'마지막 임시 진단 세션 (현재 선택 프로필과 다를 수 있음)'} : undefined,
      bootSettings,
      engine:engine?.diagnostics()??lastEngineMetrics,
      appVersion:'0.5.0',diagnosticRevision:'phase7-runtime-1',
      logs,
      error: storageError(error),
    };
  }
  download(
    new TextEncoder().encode(JSON.stringify(data, null, 2)),
    "ed4-diagnostics.json",
  );
});

function status(message: string, error = false) {
  if (error) lastError = message;
  $("#session-notice").textContent = message;
  $("#session-notice").classList.toggle("error", error);
  $("#status").textContent = message;
  $("#status").classList.toggle("error", error);
  document.querySelectorAll(".dialog-status").forEach((node) => node.remove());
  const dialog = document.querySelector("dialog[open]");
  if (error && dialog) {
    const notice = document.createElement("p");
    notice.className = "dialog-status";
    notice.setAttribute("role", "alert");
    notice.textContent = message;
    dialog.querySelector(".dialog-heading")?.after(notice);
  }
}
function log(message: string) {
  if(diagnosticRun && bootTrace){
    renderBootStatus();
  }
  logs.push(message);
  if (logs.length > 120) logs.shift();
  $("#logs").textContent = logs.join("\n");
}
function renderBootStatus(){
  if(!diagnosticRun||!bootTrace)return;
  const r=bootTrace.report(),e=engine?.diagnostics().execution;
  const bat=r.lastEntered?`진단 ${r.lastEntered.id} · ${r.lastEntered.command} · ${r.returned?'반환 확인':'진입 확인 / 반환 미확인'}`:'진단 마커 대기';
  $('#trace-status').textContent=bat+(e?.latestRequest?` | DOS 실행 요청: ${e.latestRequest.program} (성공 미확정) · 이후 ${Math.floor((e.sinceLatestRequest?.elapsedMs??0)/1000)}초, 프레임 ${e.sinceLatestRequest?.framePackets??0}, 오디오 패킷 ${e.sinceLatestRequest?.audioPackets??0}`:' | DOS 실행 요청 로그 미수신')+(e?.workerError?' | '+e.workerError:'');
}
setInterval(renderBootStatus,1000);
function current() {
  const p = profiles.find((p) => p.id === selected);
  if (!p) throw new Error("먼저 프로필을 선택하세요.");
  return p;
}
function idle() {
  if (engine) throw new Error("저장 후 종료한 다음 변경하세요.");
}
async function task(action: () => Promise<void>) {
  if (busy) return;
  if (!writable) {
    status(
      "다른 탭에서 실행 중이거나 안전한 저장 잠금을 사용할 수 없습니다. 이 주소를 HTTPS 또는 localhost의 한 탭에서 여세요.",
      true,
    );
    return;
  }
  busy = true;
  document.body.classList.add("busy");
  updateButtons();
  try {
    await action();
  } catch (e) {
    status(storageError(e), true);
    log(storageError(e));
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    updateButtons();
  }
}
function on(id: string, action: () => Promise<void>) {
  $(id).addEventListener("click", () => void task(action));
}
function updateButtons() {
  $("#play").toggleAttribute("disabled", !!engine || !selected || busy);
  for (const button of ["#pause", "#stop"])
    $(button).toggleAttribute("disabled", !running || busy);
  for (const button of ["#edit-profile", "#add-patch", "#restore", "#boot-open"])
    $(button).toggleAttribute("disabled", !selected || !!engine || busy);
  $("#backup").toggleAttribute("disabled", !selected || busy);
}
async function refresh() {
  ({ archives, profiles } = await listCatalog());
  if (!profiles.some((p) => p.id === selected))
    selected = profiles[0]?.id ?? "";
  await refreshMusic();
  $("#profile-count").textContent = String(profiles.length).padStart(2, "0");
  $("#profiles").innerHTML = profiles.length
    ? profiles
        .map(
          (p) =>
            `<button class="profile-item ${p.id === selected ? "selected" : ""}" data-profile="${p.id}"><span class="profile-icon">${p.kind === "vanilla" ? "Ⅳ" : "◇"}</span><span>${esc(p.name)}<small>${kindName[p.kind]} · ${p.patchIds.length}개 수정 ZIP</small></span><span class="profile-dot"></span></button>`,
        )
        .join("")
    : '<div class="empty-library">아직 등록한 프로필이 없습니다.<br>첫 번째 모험을 추가해 보세요.</div>';
  if (selected) {
    const p = current(),
      saved = await getSave(p.id);
    $("#profile-title").textContent = p.name;
    $("#profile-kind").textContent = kindName[p.kind];
    $("#exe-label").textContent = p.executable;
    $("#save-label").textContent = saved
      ? `${new Date(saved.updatedAt).toLocaleString("ko-KR")} · ${Object.keys(saved.files).length}개 저장/새 파일 · ${Object.keys(saved.resources ?? {}).length}개 리소스 · ${deletedFiles(saved).length}개 삭제`
      : "아직 저장된 변경분 없음";
    $("#layers-label").textContent =
      `원본 + ${p.patchIds.length}개 수정 ZIP + 이 프로필의 저장 변경분`;
  } else {
    $("#profile-title").textContent = "모험을 준비하세요";
    $("#exe-label").textContent = "등록 전";
    $("#save-label").textContent = "프로필마다 독립적으로 보관";
  }
  document.body.classList.toggle("has-profile", !!selected);
  $("#recent-save").textContent = $("#save-label").textContent;
  if (selected && [current().baseId, ...current().patchIds].some(key => !archives.some(a => a.id === key)))
    $("#recent-save").textContent = "게임 데이터가 없습니다. 설정 → 저장 공간 관리 → 다시 연결을 이용하세요. 세이브는 유지됩니다.";
  try { localStorage.setItem("ed4-selected", selected); } catch {}
  updateButtons();
}
$("#profiles").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-profile]",
  );
  if (button)
    void task(async () => {
      idle();
      selected = button.dataset.profile!;
      await refresh();
    });
});
document
  .querySelectorAll<HTMLElement>("[data-close]")
  .forEach(
    (b) =>
      (b.onclick = () => $<HTMLDialogElement>(`#${b.dataset.close}`).close()),
  );
$<HTMLDialogElement>("#import-dialog").addEventListener("close", () => {
  imported = undefined;
});

function baseOptions() {
  $("#import-base").innerHTML = archives
    .filter(
      (a) =>
        profiles.some((p) => p.baseId === a.id) ||
        (a.analysis?.executables.length ?? 0) > 0,
    )
    .map((a) => `<option value="${a.id}">${esc(a.name)}</option>`)
    .join("");
  const base = profiles.find((p) => p.id === selected)?.baseId;
  if (base && archives.some((a) => a.id === base))
    $<HTMLSelectElement>("#import-base").value = base;
}
async function inspectImport() {
  if (!imported) return;
  const kind = $<HTMLSelectElement>("#import-kind").value;
  const base = archives.find(
    (a) => a.id === $<HTMLSelectElement>("#import-base").value,
  );
  if (kind === "patch" && !base)
    throw new Error("수정 파일 모드는 원본 ZIP을 먼저 등록해야 합니다.");
  const merged =
    kind === "patch"
      ? compose((await getArchive(base!.id)).files, [imported.files])
      : { files: imported.files, conflicts: [] };
  $("#import-exe").innerHTML = executables(merged.files)
    .map((e) => `<option>${esc(e)}</option>`)
    .join("");
  $("#zip-info").textContent =
    `${Object.keys(imported.files).length}개 본체 파일 · ${size(imported.size)}\n${imported.sourceKind === "folder" ? "폴더 manifest" : "ZIP"} SHA-256: ${imported.sha256 ?? imported.manifestSha256}\n${imported.musicPackId ? "RAW 별도 보관·동일 패키지로 연결됨\n" : ""}${JSON.stringify(imported.analysis, null, 2)}\n${merged.conflicts.length ? `덮어쓰기 ${merged.conflicts.length}건: ${merged.conflicts.join(", ")}` : ""}`;
  $("#conflict-row").hidden = !merged.conflicts.length;
  $<HTMLInputElement>("#allow-conflicts").checked = false;
}
on("#open-import", async () => {
  idle();
  imported = undefined;
  $<HTMLFormElement>("#import-form").reset();
  $("#import-exe").innerHTML =
    '<option value="">ZIP을 먼저 선택하세요</option>';
  $("#zip-info").textContent = "본체 최대 256 MiB · RAW 분리 경로 전체 768 MiB";
  $("#base-row").hidden = true;
  $("#conflict-row").hidden = true;
  baseOptions();
  $<HTMLDialogElement>("#import-dialog").showModal();
});
for (const selector of ["#import-kind", "#import-base"])
  $(selector).addEventListener(
    "change",
    () =>
      void task(async () => {
        $("#base-row").hidden =
          $<HTMLSelectElement>("#import-kind").value !== "patch";
        await inspectImport();
      }),
  );
$<HTMLInputElement>("#zip-file").onchange = () =>
  void task(async () => {
    imported = undefined;
    $("#import-exe").innerHTML = "";
    const file = $<HTMLInputElement>("#zip-file").files?.[0];
    if (!file) return;
    $("#zip-info").textContent = "ZIP 내부 경로와 크기 검사 중…";
    imported = (
      await importGameZip(file, (s) => ($("#zip-info").textContent = s))
    ).archive;
    $<HTMLInputElement>("#import-name").value = file.name.replace(
      /\.zip$/i,
      "",
    );
    await inspectImport();
  });
$("#import-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void task(async () => {
    if (!imported) throw new Error("ZIP을 먼저 선택하세요.");
    if (
      !$("#conflict-row").hidden &&
      !$<HTMLInputElement>("#allow-conflicts").checked
    )
      throw new Error("수정 파일의 덮어쓰기 경로를 확인하세요.");
    const kind = $<HTMLSelectElement>("#import-kind").value as Profile["kind"];
    const baseId =
      kind === "patch"
        ? $<HTMLSelectElement>("#import-base").value
        : imported.id;
    const merged =
      kind === "patch"
        ? compose((await getArchive(baseId)).files, [imported.files]).files
        : imported.files;
    const label = $<HTMLInputElement>("#version-label").value.trim();
    if (label) {
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(label))
        throw new Error(
          "버전 별칭은 영문·숫자·점·밑줄·하이픈 80자 이내로 입력하세요.",
        );
      imported.versionId = label;
    }
    const executable = $<HTMLSelectElement>("#import-exe").value;
    validateExecutable(executable, merged);
    const p: Profile = {
      id: id(),
      gameId: "ed4",
      engineId: "js-dos-v7",
      name: $<HTMLInputElement>("#import-name").value.trim() || "새 프로필",
      kind,
      baseId,
      patchIds: kind === "patch" ? [imported.id] : [],
      executable,
      settings: { ...DEFAULT_SETTINGS },
      createdAt: Date.now(),
      music: imported.musicPackId
        ? { packId: imported.musicPackId, prefix: "" }
        : undefined,
      requiredBaseVersion:
        kind === "patch"
          ? identity(archives.find((a) => a.id === baseId)!).versionId
          : undefined,
    };
    await putProfile(p, [imported]);
    imported = undefined;
    selected = p.id;
    $<HTMLDialogElement>("#import-dialog").close();
    await refresh();
    status(
      "프로필이 등록되었습니다. 실행 파일과 DOSBox 설정을 확인한 뒤 실행하세요.",
    );
  });
});
on("#demo", async () => {
  idle();
  const response = await fetch(`${import.meta.env.BASE_URL}test-program.zip`);
  if (!response.ok) throw new Error("테스트 ZIP을 찾지 못했습니다.");
  const a = await importArchive(await response.blob(), "public-dos-test.zip");
  const p: Profile = {
    id: id(),
    gameId: "ed4",
    engineId: "js-dos-v7",
    name: "공개 DOS 테스트",
    kind: "vanilla",
    baseId: a.id,
    patchIds: [],
    executable: "ED4TEST.COM",
    settings: { ...DEFAULT_SETTINGS },
    createdAt: Date.now(),
  };
  await putProfile(p, [a]);
  selected = p.id;
  await refresh();
  status(
    "공개 테스트 준비 완료. 실행 후 S 저장 → 저장 후 종료 → 재실행 → L 읽기로 확인하세요.",
  );
});

async function checkpoint() {
  if(diagnosticRun) return; // Disposable session: no save, tombstone or generated BAT enters IDB.
  if (checkpointPromise) return checkpointPromise;
  if (!engine || !running) return;
  const e = engine,
    p = running;
  checkpointPromise = (async () => {
    const changed = await e.save();
    const previous = await getSave(p.id);
    if (changed.measurement) record(changed.measurement);
    await putSave(reconcileSave(p, previous, changed, activeSourcePaths));
    status(
      "게임 파일 변경분을 브라우저에 저장했습니다. 게임 내부 저장 여부도 확인하세요.",
    );
    await refresh();
  })();
  try {
    await checkpointPromise;
  } finally {
    checkpointPromise = undefined;
  }
}
async function startGame(traceOptions?:{entry:string;settings:DosSettings;rawMounted?:boolean;mode?:ComparisonMode;baselineEntry?:string;changedFactor?:string;environment?:EnvironmentMode;experimentalEngine?:'phase9-2'|'phase9-3'|'phase9-4'|'phase9-5b'|'phase9-6'|'phase9-7'|'phase9-8c'|'phase9-8d'}) {
  idle();
  if(launcherUpdate.locked||launcherUpdate.incompatible)throw Error('실행기 업데이트 중이거나 코드/서비스 워커 버전이 다릅니다. 업데이트 상태를 확인하세요. 게임 데이터는 유지됩니다.');
  scenePanel.start(traceOptions?.experimentalEngine??'stable');
  window.dispatchEvent(new Event("ed4-release-input"));
  rawPreview.stop();
  if (matchMedia("(pointer: coarse)").matches)
    void enterLandscape($("#play-area"), (message) => {
      log(message);
      $("#rotate-notice").textContent = message;
    });
  let p = current();
  diagnosticRun=!!traceOptions;
  bootTrace=undefined;bootSettings=undefined;environmentObservation=undefined;
  lastEngineMetrics=undefined;
  $('#trace-status').textContent=diagnosticRun?'진단 마커 대기':'';
  logs.length = 0;
  $('#logs').textContent='엔진 시작 대기';
  engine = new DosEngine($<HTMLCanvasElement>("#canvas"), log, text=>{
    if(diagnosticRun){bootTrace?.accept(text);environmentObservation?.accept(text);renderBootStatus();}
  });
  engine.activateAudio();
  engine.setVolume(Number($<HTMLInputElement>("#volume").value) / 100);
  status("DOS 실행 환경을 준비하고 있습니다…");
  $("#run-state").textContent = "시작 중";
  try {
    const save = await getSave(p.id);
    const input = await loadProfile(p);
    for(const note of checkRequirements(p, input))log(note);
    const risks = conflicts(p, input, save).filter((c) => c.saveOverride);
    if (
      risks.length &&
      !confirm(
        `저장 변경분 또는 삭제 표시가 원본/모드 파일 ${risks.length}개에 우선합니다.\n${risks.map((r) => r.path + " → " + r.winner).join("\n")}\n이 프로필의 변경분을 적용하여 실행할까요?`,
      )
    ) {
      await engine.stop();
      engine = undefined;
      $("#run-state").textContent = "대기 중";
      return;
    }
    activeSourcePaths = Object.keys(layerFiles(p, input));
    const mountedMusic = traceOptions?.rawMounted===false?[]:await musicMounts(p, layerFiles(p, input), save);
    const inspection = inspectGame(layerFiles(p, input));
    if (inspection.windowsExecutables.includes(p.executable))
      throw Error(
        "선택한 실행 파일은 PE/NE 형식입니다. Windows/OS2 프로그램은 지원하지 않습니다. DOS EXE/BAT를 선택하세요.",
      );
    let temporary:Files={};
    if(traceOptions){
      const effective={...layerFiles(p,input)};
      for(const path of deletedFiles(save))delete effective[path];
      Object.assign(effective,overlayFiles(save));
      const plan=bootPlan(effective,traceOptions.entry,p.settings.prelude);
      if(plan.issues.length)throw Error('안전한 자동 추적 범위를 벗어납니다. 원본은 변경하지 않았습니다.\n'+plan.issues.join('\n'));
      bootTrace=new BootTrace(plan);
      p={...p,executable:plan.executable,settings:{...traceOptions.settings,prelude:''}};
      temporary=plan.generated;
      bootSettings={profileId:current().id,original:{...current().settings},comparison:{...traceOptions.settings},config:dosConfig(p,traceOptions.environment),
        runtimeComparison:{mode:traceOptions.mode??'manual',entry:traceOptions.entry,rawMounted:traceOptions.rawMounted!==false,mountedFiles:mountedMusic.length,baselineEntry:traceOptions.baselineEntry,changedFactor:traceOptions.changedFactor}};
    }
    if(traceOptions?.environment&&bootSettings){
      environmentObservation=new EnvironmentObservation();
      const effective={...layerFiles(p,input)};for(const path of deletedFiles(save))delete effective[path];Object.assign(effective,overlayFiles(save));
      bootSettings.environment={id:traceOptions.environment,requestedNosound:traceOptions.environment==='pc-mixer-nosound',observations:environmentObservation.samples,files:await executableIdentities(effective,traceOptions.entry),note:'CONFIG -get samples are before entry and after return only; absent AFTER means unobserved. Guest CONFIG environment variable is set equally in both trials. Later guest commands can override cycles. Hashes describe effective files, not an authenticated original installation.'};
      temporary=observeEnvironmentBatch(temporary,p.executable);
    }
    const bundle = await buildRuntime(p, input, save, temporary,traceOptions?.environment);
    await engine.start(bundle, mountedMusic,traceOptions?.experimentalEngine?{id:traceOptions.experimentalEngine,discardWrites:true}:undefined);
    scenePanel.ready();
    running = structuredClone(p);
    paused = false;
    $("#empty-screen").hidden = true;
    $("#run-state").textContent = "실행 중";
    $("#screen-label").textContent = p.executable;
    document.body.classList.add("running");
    $("#canvas").focus();
    $('#stop').textContent=diagnosticRun?'진단 종료 (저장 안 함)':'저장 후 종료';
    status(diagnosticRun?'임시 진단 실행 중 · 변경분은 저장하지 않습니다. 검은 화면에서 진단 JSON과 화면 PNG를 내려받으세요.':'DOS 실행 중 · 게임 내부 저장 후 «저장 후 종료»를 눌러 주세요.');
  } catch (e) {
    scenePanel.end();
    lastEngineMetrics=engine?.diagnostics(); // Retain early WASM failures after cleanup.
    await engine?.stop();
    engine = undefined;
    diagnosticRun=false;
    $("#run-state").textContent = "시작 실패";
    throw Error(storageError(e) + "\n설정에서 실행 파일·음악 연결을 확인하세요. 해결되지 않으면 실행 로그·진단 JSON을 내려받으세요. 기존 세이브는 유지됩니다.");
  }
}
on('#play',()=>startGame());
on("#pause", async () => {
  if (!engine) return;
  paused = !paused;
  engine.pause(paused);
  $("#pause").textContent = paused ? "계속 실행" : "일시 정지";
  $("#run-state").textContent = paused ? "일시 정지" : "실행 중";
});
on("#stop", async () => {
  if (!engine) return;
  await checkpoint();
  scenePanel.end();
  lastEngineMetrics = engine.diagnostics();
  await engine.stop();
  engine = undefined;
  running = undefined;
  diagnosticRun=false;
  $('#stop').textContent='저장 후 종료';
  paused = false;
  $("#pause").textContent = "일시 정지";
  $("#run-state").textContent = "종료됨";
  document.body.classList.remove("running");
  screen.orientation?.unlock?.();
  if (document.fullscreenElement)
    await document.exitFullscreen().catch(() => {});
});
setInterval(() => {
  if (running && !busy && !paused)
    void checkpoint().catch((e) => status(storageError(e), true));
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running) {
    engine?.releaseKeys();
    void checkpoint().catch((e) => status(storageError(e), true));
  }
});
window.addEventListener("beforeunload", (e) => {
  if (running) {
    e.preventDefault();
    e.returnValue = "";
  }
});
bindControls($("#play-area"), () => engine);
const keyboardRows = [
  ["Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"],
  Array.from("1234567890", (n) => "Digit" + n).concat([
    "Minus",
    "Equal",
    "Backspace",
  ]),
  [
    "Tab",
    ...Array.from("QWERTYUIOP", (c) => "Key" + c),
    "BracketLeft",
    "BracketRight",
  ],
  [
    "ControlLeft",
    ...Array.from("ASDFGHJKL", (c) => "Key" + c),
    "Semicolon",
    "Quote",
    "Enter",
  ],
  [
    "ShiftLeft",
    ...Array.from("ZXCVBNM", (c) => "Key" + c),
    "Comma",
    "Period",
    "Slash",
  ],
  [
    "AltLeft",
    "Space",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Insert",
    "Delete",
    "Backslash",
  ],
];
$("#virtual-keyboard").innerHTML = keyboardRows
  .map(
    (row) =>
      `<div>${row
        .map(
          (code) =>
            `<button data-key="${KEY[code]}" aria-label="${code}">${code
              .replace(/^Key|^Digit/, "")
              .replace("Left", "")
              .replace("Escape", "Esc")}</button>`,
        )
        .join("")}</div>`,
  )
  .join("");
on("#keyboard-toggle", async () => {
  const kb = $("#virtual-keyboard");
  kb.hidden = !kb.hidden;
  $("#keyboard-toggle").setAttribute("aria-expanded", String(!kb.hidden));
});
on("#fullscreen", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else
    await enterLandscape($("#play-area"), (message) => {
      log(message);
      $("#rotate-notice").textContent = message;
    });
});
on("#audio", async () => {
  engine?.activateAudio();
  if (engine) status("오디오 활성화를 요청했습니다.");
});
const optionKeys = [
  "Enter",
  "Escape",
  "Space",
  "ControlLeft",
  "AltLeft",
  "Tab",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
];
for (const [name, code] of [
  ["confirm", "Enter"],
  ["cancel", "Escape"],
  ["menu", "Space"],
]) {
  const select = $<HTMLSelectElement>(`#map-${name}`);
  select.innerHTML = optionKeys
    .map((k) => `<option value="${KEY[k]}">${k}</option>`)
    .join("");
  select.value = String(KEY[code]);
  select.onchange = () => {
    engine?.releaseKeys();
    if(name!=="menu"){saveControls();return;}
    const b = $(`#${name}-key`);
    b.dataset.key = select.value;
    b.querySelector("small")!.textContent =
      select.selectedOptions[0].textContent;
    saveControls();
  };
}
function saveControls() {
  try {
    localStorage.setItem(
      "ed4-controls",
      JSON.stringify({
        size: $<HTMLInputElement>("#control-size").value,
        inset: $<HTMLInputElement>("#control-inset").value,
        opacity: $<HTMLInputElement>("#control-opacity").value,
        y: $<HTMLInputElement>("#control-y").value,
        volume: $<HTMLInputElement>("#volume").value,
        confirm: $<HTMLSelectElement>("#map-confirm").value,
        cancel: $<HTMLSelectElement>("#map-cancel").value,
        menu: $<HTMLSelectElement>("#map-menu").value,
      }),
    );
  } catch {
    status(
      "조작 설정 저장에 실패했습니다. 브라우저 저장 공간을 확인하세요.",
      true,
    );
  }
}
function applyControls() {
  document.documentElement.style.setProperty(
    "--control-opacity",
    String(Number($<HTMLInputElement>("#control-opacity").value) / 100),
  );
  document.documentElement.style.setProperty(
    "--control-y",
    $<HTMLInputElement>("#control-y").value + "dvh",
  );
  $("#opacity-value").textContent =
    $<HTMLInputElement>("#control-opacity").value;
  $("#y-value").textContent = $<HTMLInputElement>("#control-y").value;
  document.documentElement.style.setProperty(
    "--button-size",
    `${$<HTMLInputElement>("#control-size").value}px`,
  );
  document.documentElement.style.setProperty(
    "--control-inset",
    `${$<HTMLInputElement>("#control-inset").value}px`,
  );
  $("#size-value").textContent = $<HTMLInputElement>("#control-size").value;
  $("#inset-value").textContent = $<HTMLInputElement>("#control-inset").value;
  engine?.setVolume(Number($<HTMLInputElement>("#volume").value) / 100);
}
for (const name of [
  "control-size",
  "control-inset",
  "volume",
  "control-opacity",
  "control-y",
])
  $(`#${name}`).addEventListener("input", () => {
    applyControls();
    saveControls();
  });
try {
  const saved = JSON.parse(localStorage.getItem("ed4-controls") ?? "null");
  if (saved) {
    for (const [name, key] of [
      ["control-size", "size"],
      ["control-inset", "inset"],
      ["volume", "volume"],
      ["control-opacity", "opacity"],
      ["control-y", "y"],
    ])
      if (saved[key] !== undefined)
        $<HTMLInputElement>(`#${name}`).value = saved[key];
    for (const name of ["confirm", "cancel", "menu"]) {
      const select = $<HTMLSelectElement>(`#map-${name}`);
      if (optionKeys.some((k) => String(KEY[k]) === saved[name])) {
        select.value = saved[name];
        if(name!=="menu")continue;
        $(`#${name}-key`).dataset.key = saved[name];
        $(`#${name}-key small`).textContent =
          select.selectedOptions[0].textContent;
      }
    }
  }
} catch {
  /* Defaults are safe when settings were removed/corrupt. */
}
applyControls();

async function loadProfile(p: Profile) {
  const keys = [p.baseId, ...p.patchIds];
  const bytes = archives
    .filter((a) => keys.includes(a.id))
    .reduce((n, a) => n + a.size, 0);
  if (bytes > 256 * 1024 * 1024)
    throw new Error("원본·모드 합계가 256 MiB 메모리 안전 제한을 초과합니다.");
  return getProfileArchives(p);
}
async function profileFiles(p: Profile) {
  return layerFiles(p, await loadProfile(p));
}
function renderPatches() {
  const p = current();
  $("#patch-list").innerHTML =
    p.patchIds
      .map(
        (key, i) =>
          `<div class="data-row"><span>${i + 1}. ${esc(archives.find((a) => a.id === key)?.name ?? "누락된 ZIP")}</span><button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-remove-patch="${i}">제거</button></div>`,
      )
      .join("") || '<p class="hint">수정 ZIP 없음</p>';
}
on("#edit-profile", async () => {
  idle();
  const p = current();
  $<HTMLInputElement>("#edit-name").value = p.name;
  $("#edit-exe").innerHTML = executables(await profileFiles(p))
    .map((e) => `<option>${esc(e)}</option>`)
    .join("");
  $<HTMLSelectElement>("#edit-exe").value = p.executable;
  $<HTMLInputElement>("#cycles").value = String(p.settings.cycles);
  $<HTMLSelectElement>("#memory").value = String(p.settings.memory);
  $<HTMLSelectElement>("#sound").value = p.settings.sound;
  $<HTMLTextAreaElement>("#prelude").value = p.settings.prelude;
  $<HTMLInputElement>("#required-version").value = p.requiredBaseVersion ?? "";
  $<HTMLInputElement>("#save-paths").value = (
    p.savePaths ?? ["*.SAV", "SAVE/", "SAVES/"]
  ).join(", ");
  $<HTMLSelectElement>("#preset").value = "";
  renderPatches();
  $<HTMLDialogElement>("#settings-dialog").showModal();
});
$("#settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void task(async () => {
    idle();
    const p = structuredClone(current());
    p.name = $<HTMLInputElement>("#edit-name").value.trim() || p.name;
    p.executable = $<HTMLSelectElement>("#edit-exe").value;
    validateExecutable(p.executable, await profileFiles(p));
    p.settings = {
      cycles: Number($<HTMLInputElement>("#cycles").value),
      memory: Number($<HTMLSelectElement>("#memory").value),
      sound: $<HTMLSelectElement>("#sound")
        .value as Profile["settings"]["sound"],
      prelude: $<HTMLTextAreaElement>("#prelude").value,
    };
    p.requiredBaseVersion =
      $<HTMLInputElement>("#required-version").value.trim() || undefined;
    p.savePaths = $<HTMLInputElement>("#save-paths")
      .value.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    dosConfig(p);
    await putProfile(p);
    $<HTMLDialogElement>("#settings-dialog").close();
    await refresh();
    status("실행 설정을 저장했습니다.");
  });
});
$("#patch-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  void task(async () => {
    idle();
    const p = structuredClone(current());
    if (b.dataset.up !== undefined) {
      const i = Number(b.dataset.up);
      [p.patchIds[i - 1], p.patchIds[i]] = [p.patchIds[i], p.patchIds[i - 1]];
    } else if (b.dataset.removePatch !== undefined) {
      if (
        !confirm(
          "이 수정 ZIP 적용을 제거할까요? 기존 저장 변경분은 유지됩니다.",
        )
      )
        return;
      p.patchIds.splice(Number(b.dataset.removePatch), 1);
    }
    const input = await loadProfile(current());
    const affected = orderImpact(current(), p, input);
    if (
      !confirm(
        `레이어 변경 영향 파일 ${affected.length}개:\n${affected.join("\n") || "(내용 변화 없음)"}\n저장 변경분은 별도 공간에 유지됩니다. 적용할까요?`,
      )
    )
      return;
    validateExecutable(p.executable, layerFiles(p, input));
    await putProfile(p);
    await refresh();
    renderPatches();
    status(
      "수정 파일 적용 순서를 저장했습니다. 저장 변경분은 계속 마지막에 적용됩니다.",
    );
  });
});
on("#add-patch", async () => {
  idle();
  current();
  $<HTMLInputElement>("#patch-file").value = "";
  $<HTMLInputElement>("#patch-file").click();
});
$<HTMLInputElement>("#patch-file").onchange = () =>
  void task(async () => {
    idle();
    const file = $<HTMLInputElement>("#patch-file").files?.[0];
    if (!file) return;
    const p = structuredClone(current());
    if (p.kind === "vanilla")
      throw new Error(
        "원본 프로필은 바닐라로 유지됩니다. 게임 / 모드 등록에서 모드 A 프로필을 만드세요.",
      );
    const a = (await importGameZip(file, (s) => status(s))).archive;
    if (a.musicPackId)
      throw Error(
        "RAW 포함 수정 ZIP의 음악은 별도 보관함에 등록했습니다. 본체 수정 ZIP과 음악 보관함을 분리해 연결하세요.",
      );
    const combined = compose(await profileFiles(p), [a.files]);
    const saved = await getSave(p.id);
    const shadow = Object.keys(a.files).filter(
      (path) => overlayFiles(saved)[path] || deletedFiles(saved).includes(path),
    );
    if (
      !confirm(
        `${file.name}을 마지막 수정 ZIP으로 추가할까요?\n레이어 덮어쓰기 ${combined.conflicts.length}개: ${combined.conflicts.join(", ")}\n저장이 새 모드를 가리는 경로 ${shadow.length}개: ${shadow.join(", ")}`,
      )
    )
      return;
    p.patchIds.push(a.id);
    await putProfile(p, [a]);
    await refresh();
    status("수정 ZIP을 추가했습니다.");
  });
on("#remove-profile", async () => {
  idle();
  const p = current();
  if (
    !confirm(
      `«${p.name}» 프로필을 삭제할까요? 게임 데이터와 저장 변경분은 저장 공간 관리에 남습니다.`,
    )
  )
    return;
  await deleteProfile(p.id);
  $<HTMLDialogElement>("#settings-dialog").close();
  await refresh();
  status("프로필을 삭제했습니다. 게임 데이터와 저장 변경분은 유지됩니다.");
});
function download(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)]));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  try { a.click(); } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
on("#backup", async () => {
  const p = current();
  if (running?.id === p.id) await checkpoint();
  const save = await getSave(p.id);
  if (!save) throw new Error("백업할 저장 변경분이 없습니다.");
  download(exportBackup(p, save), `ed4-save-${p.id}.zip`);
  status(
    "저장 백업 ZIP을 내보냈습니다. 게임 원본 전체가 아닌 파일 변경분입니다.",
  );
});
on("#restore", async () => {
  idle();
  current();
  $<HTMLInputElement>("#restore-file").value = "";
  $<HTMLInputElement>("#restore-file").click();
});
$<HTMLInputElement>("#restore-file").onchange = () =>
  void task(async () => {
    idle();
    const file = $<HTMLInputElement>("#restore-file").files?.[0];
    if (!file) return;
    if (file.size > 128 * 1024 * 1024)
      throw new Error("백업 ZIP이 너무 큽니다.");
    const p = current(),
      save = importBackup(new Uint8Array(await file.arrayBuffer()), p);
    if (!confirm("이 프로필의 저장 변경분을 백업 내용으로 교체할까요?")) return;
    await putSave(save);
    await refresh();
    status("백업을 복원했습니다. 다음 실행부터 적용됩니다.");
  });

let relinkId = "";
on("#recover-profile", async () => {
  idle();
  $<HTMLInputElement>("#recover-file").value = "";
  $<HTMLInputElement>("#recover-file").click();
});
$<HTMLInputElement>("#recover-file").onchange = () =>
  void task(async () => {
    idle();
    const file = $<HTMLInputElement>("#recover-file").files?.[0];
    if (!file) return;
    if (file.size > 128 * 1024 * 1024)
      throw new Error("백업 ZIP이 너무 큽니다.");
    const { profile, save } = recoverProfile(
      new Uint8Array(await file.arrayBuffer()),
    );
    if (
      !confirm(
        `«${profile.name}» 프로필과 저장 변경분을 복구할까요? 게임 ZIP은 별도로 다시 연결해야 합니다. 백업의 DOS 초기화 명령도 실행 설정에서 확인하세요.`,
      )
    )
      return;
    await recoverSave(profile, save);
    selected = profile.id;
    await showStorage();
    status(
      "프로필과 저장을 복구했습니다. 누락된 원본/수정 ZIP을 다시 연결하세요.",
    );
  });
async function showStorage() {
  await refresh();
  const estimate = await navigator.storage?.estimate();
  $("#storage-estimate").textContent = estimate
    ? `브라우저 사용량 ${size(estimate.usage ?? 0)} / 예상 한도 ${size(estimate.quota ?? 0)}`
    : "브라우저가 저장 용량 정보를 제공하지 않습니다.";
  const missing = [
    ...new Set(profiles.flatMap((p) => [p.baseId, ...p.patchIds])),
  ].filter((key) => !archives.some((a) => a.id === key));
  $("#archive-list").innerHTML =
    archives
      .map(
        (a) =>
          `<div class="data-row"><span>${esc(a.name)}<small>${a.fileCount ?? Object.keys(a.files).length}개 파일 · ${size(a.size)}<br>버전: ${esc(identity(a).versionId)}<br>${a.manifestSha256 ? "폴더 manifest" : "ZIP"} SHA-256: ${a.sha256 ?? a.manifestSha256 ?? "미확인 (Phase 1)"}</small></span><button data-verify="${a.id}">원본 ZIP 확인</button><button data-delete-archive="${a.id}" class="danger">데이터 삭제</button></div>`,
      )
      .join("") +
    missing
      .map(
        (key) =>
          `<div class="data-row"><span>누락된 ZIP<small>${key}</small></span><button data-relink="${key}">다시 연결</button></div>`,
      )
      .join("");
  const saves = await saveLibrary();
  $("#save-list").innerHTML =
    saves
      .map(
        (s) =>
          `<div class="data-row"><span>${esc(profiles.find((p) => p.id === s.profileId)?.name ?? "삭제된 프로필")}<small>${s.profileId}<br>${Object.keys(s.files).length}개 저장/새 파일 · ${Object.keys(s.resources ?? {}).length}개 리소스 변경 · ${deletedFiles(s).length}개 삭제 · ${new Date(s.updatedAt).toLocaleString("ko-KR")}</small></span><button data-export="${s.profileId}">백업</button><button data-delete-save="${s.profileId}" class="danger">세이브 삭제</button></div>`,
      )
      .join("") || '<p class="hint">저장된 변경분 없음</p>';
}
on("#storage-open", async () => {
  await showStorage();
  $<HTMLDialogElement>("#storage-dialog").showModal();
});
on("#persist-storage", async () => {
  const granted = await navigator.storage?.persist();
  status(
    granted
      ? "브라우저 영구 저장이 허용되었습니다. 외부 백업도 유지하세요."
      : "영구 저장이 허용되지 않았습니다. ZIP 백업을 유지하세요.",
  );
});
$("#storage-dialog").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  void task(async () => {
    if (b.dataset.deleteArchive) {
      idle();
      if (
        !confirm(
          "이 게임 ZIP 데이터만 삭제할까요? 저장 변경분은 남지만 ZIP을 다시 연결할 때까지 실행할 수 없습니다.",
        )
      )
        return;
      await deleteArchive(b.dataset.deleteArchive);
      await showStorage();
    }
    if (b.dataset.deleteSave) {
      idle();
      if (
        !confirm(
          "이 프로필의 저장 변경분을 영구 삭제할까요? 게임 데이터는 유지됩니다.",
        )
      )
        return;
      await deleteSave(b.dataset.deleteSave);
      await showStorage();
    }
    if (b.dataset.export) {
      const save = await getSave(b.dataset.export);
      if (save)
        download(
          exportBackup(
            profiles.find((p) => p.id === save.profileId) ?? {
              id: save.profileId,
              name: "삭제된 프로필",
            },
            save,
          ),
          `ed4-save-${save.profileId}.zip`,
        );
    }
    if (b.dataset.relink || b.dataset.verify) {
      idle();
      relinkId = (b.dataset.relink || b.dataset.verify)!;
      const folder = profiles.some(
        (p) => p.archiveIdentities?.[relinkId]?.manifestSha256,
      );
      const input = $<HTMLInputElement>(
        folder ? "#relink-folder" : "#relink-file",
      );
      input.value = "";
      input.disabled = false;
      input.click();
    }
  });
});
$<HTMLInputElement>("#relink-file").onchange = () =>
  void task(async () => {
    idle();
    const file = $<HTMLInputElement>("#relink-file").files?.[0];
    if (!file) return;
    const p = profiles.find(
      (p) => p.baseId === relinkId || p.patchIds.includes(relinkId),
    );
    if (!p) throw new Error("해당 프로필이 없습니다.");
    const a = (await importGameZip(file, (s) => status(s))).archive;
    a.id = relinkId;
    const verdict = checkIdentity(p.archiveIdentities?.[relinkId], a);
    if (
      !confirm(
        verdict === "matched"
          ? "SHA-256이 일치합니다. 원본 ZIP을 다시 연결할까요?"
          : verdict==='different' ? "등록 당시 해시와 다른 수정본입니다. 손상으로 판단하지 않습니다. 이 파일을 사용하는 프로필에 연결할까요? 기존 세이브는 유지됩니다." : "기존 자료에는 비교할 해시가 없습니다. 선택한 ZIP을 연결할까요? 기존 세이브는 유지됩니다.",
      )
    )
      return;
    await reconnectArchive(a);
    await showStorage();
  });
$<HTMLInputElement>("#relink-folder").onchange = () =>
  void task(async () => {
    idle();
    const files = Array.from($<HTMLInputElement>("#relink-folder").files ?? []);
    if (!files.length) return;
    const result = await importSources(
      files.map((file) => ({
        file,
        path: file.webkitRelativePath.split("/").slice(1).join("/"),
      })),
      files[0].webkitRelativePath.split("/")[0],
      false,
      (s) => status(s),
    );
    const a = result.archive;
    a.id = relinkId;
    const p = profiles.find(
      (p) => p.baseId === relinkId || p.patchIds.includes(relinkId),
    );
    if (!p) throw Error("해당 프로필이 없습니다.");
    const verdict=checkIdentity(p.archiveIdentities?.[relinkId], a);
    if (
      !confirm(
        verdict==='matched'?"폴더 manifest 해시가 일치합니다. 폴더를 다시 연결할까요?":"등록 당시와 다르거나 비교할 해시가 없는 폴더입니다. 수정본으로 연결할 수 있습니다. 기존 세이브를 유지하고 연결할까요?",
      )
    )
      return;
    await reconnectArchive(a);
    await showStorage();
  });
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
});
on("#install", async () => {
  if (installPrompt) await installPrompt.prompt();
  else
    status(
      "브라우저 메뉴에서 «앱 설치» 또는 «홈 화면에 추가»를 선택하세요. HTTPS 연결과 오프라인 준비 완료가 필요합니다.",
    );
});
async function init() {
  await refresh();
  if (!navigator.locks) {
    status(
      "안전한 저장을 위해 HTTPS 또는 localhost와 Web Locks 지원 브라우저가 필요합니다.",
      true,
    );
    return;
  }
  void navigator.locks.request(
    "ed4-mobile-writer",
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        status(
          "다른 탭에서 ED4 Mobile이 열려 있습니다. 해당 탭을 닫은 뒤 새로고침하세요.",
          true,
        );
        return;
      }
      writable = true;
      await new Promise(() => {});
    },
  );
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        {updateViaCache:'none'},
      );
      await navigator.serviceWorker.ready;
      $("#offline").textContent = "오프라인 준비 완료";
      $("#offline").classList.add("ready");
    } catch (e) {
      $("#offline").textContent = "오프라인 준비 실패";
      status(
        `온라인 실행은 가능하지만 오프라인 캐시를 준비하지 못했습니다: ${storageError(e)}`,
        true,
      );
    }
  } else $("#offline").textContent = "개발 모드";
}
// Phase 5: keep the existing advanced tools, make the default path simple.
$("#profiles").insertAdjacentHTML("beforebegin", '<button id="simple-import" class="primary wide">게임 등록</button>');
$("#play").textContent = "▶ 게임 실행";
$("#empty-screen p").textContent = "게임 폴더 또는 ZIP을 한 번 등록하면 다음부터 바로 실행할 수 있습니다.";
$("#status").textContent = "게임 등록을 눌러 폴더 또는 ZIP을 선택하세요. RAW 음악도 함께 선택할 수 있습니다.";
$("#status").insertAdjacentHTML("afterend", '<div class="simple-summary"><span id="recent-save">아직 등록된 게임이 없습니다.</span><button id="settings-toggle" aria-expanded="false">설정 · 백업</button></div><details id="advanced-settings"><summary>고급 설정 · 모드 · 저장 관리</summary><div id="advanced-content"></div></details>');
for (const selector of ["#open-import", "#demo", "#storage-open", ".detail-grid", ".phase3-card", ".phase2-card", ".diagnostics"])
  $("#advanced-content").append($(selector));
$("#open-import").textContent = "고급 등록 / 모드 관리";
$("#advanced-content").insertAdjacentHTML("afterbegin", '<p class="hint">게임 내부 저장 후 «저장 후 종료»를 누르세요. 브라우저 데이터는 삭제될 수 있으므로 저장 백업 ZIP을 기기 밖에도 보관하세요. CPU·메모리·사운드·실행 파일 변경은 실행 프로필의 설정에서 합니다.</p>');
$("#play-area").before($(".simple-summary"));
const advanced = $<HTMLDetailsElement>("#advanced-settings");
try { advanced.open = localStorage.getItem("ed4-advanced") === "open"; selected = localStorage.getItem("ed4-selected") ?? ""; } catch {}
advanced.addEventListener("toggle", () => {
  $("#settings-toggle").setAttribute("aria-expanded", String(advanced.open));
  try { localStorage.setItem("ed4-advanced", advanced.open ? "open" : "closed"); } catch {}
});
$("#settings-toggle").onclick = () => { advanced.open = !advanced.open; if (advanced.open) advanced.scrollIntoView({block:"nearest"}); };
installSimpleImport({run: task, idle, profiles: () => profiles, selected: () => selected,
  done: async p => { selected = p.id; await refresh(); }, notify: status});

// Phase 6: diagnostic controls reuse the existing UI; never persist a diagnostic profile.
$('.phase2-card').insertAdjacentHTML('beforeend','<button id="boot-open">BAT 실행 순서 · 임시 진단</button>');
$('.player-toolbar').insertAdjacentHTML('beforeend','<button id="screen-export">화면 PNG</button><button id="run-diagnostics">진단 JSON</button><button id="run-performance" title="게임 메뉴가 안정된 뒤 30초 측정. 화면 콜백과 표시 기회는 실제 모니터 FPS와 다릅니다.">30초 성능 측정</button>');
$('#play-area').insertAdjacentHTML('afterbegin','<div id="trace-status" role="status"></div>');
$('#app').insertAdjacentHTML('beforeend',`<dialog id="boot-dialog"><div class="dialog-heading"><h2>임시 실행 추적</h2><button id="boot-close">닫기</button></div>
<p>원본·세이브·프로필 설정을 바꾸지 않는 일회용 진단입니다. 진단 중 게임 저장은 종료 시 폐기됩니다.</p>
<label>이번 진단의 엔진<select id="boot-engine"><option value="stable">기존 안정 엔진 (기본값)</option><option value="phase9-2">실험: Phase 9-2 BIOS 경로 계측 · 저장 안 함</option><option value="phase9-3">실험: Phase 9-3 CPU 실행 이력 · 저장 안 함</option><option value="phase9-4">실험: Phase 9-4 최초 주소·모드 관측 · 저장 안 함</option><option value="phase9-5b">실험: Phase 9-5B 텍스트 메모리 호환 · 저장 안 함</option><option value="phase9-6">실험: Phase 9-6 추적 OFF · 저장 안 함</option><option value="phase9-7">실험: Phase 9-7 모노 출력 수정 (9-6 WASM) · 저장 안 함</option><option value="phase9-8c">실험: Phase 9-8C BGM 명령 관측 · 1× · 저장 안 함</option><option value="phase9-8d">실험: Phase 9-8D INT69·시작 오디오 관측 · 1× · 저장 안 함</option></select></label>
<p>실험 엔진은 재부팅 진입 경로·CPU 상태를 기록합니다. 원래 abort() 오류는 유지됩니다. 엔진만 바꾸고 BAT·CPU·메모리·음악 조건은 먼저 그대로 비교하세요. 닫거나 종료하면 안정 엔진으로 돌아갑니다.</p>
<label>WASM 비교 진단<select id="boot-comparison"><option value="manual">기존 수동 진단</option><option value="baseline">기준: GAME.BAT + SB16 + 기존 RAW 마운트</option><option value="nosound">비교: NOSOUND.BAT만 변경</option><option value="no-raw">비교: RAW 마운트만 생략</option><option value="pc-baseline">PC 환경 기준: 현재 설정 · 믹서 출력 켬</option><option value="pc-mixer-nosound">PC 환경 비교: mixer.nosound=true만 변경</option></select></label>
<p>WASM 비교 3종은 현재 CPU·메모리를 유지하고 동일 SB16을 사용합니다. 기준 결과부터 수집하고 한 번에 BAT 또는 RAW 마운트 하나만 비교하세요. RAW 생략은 OPFS 연결 음악에만 적용되며 본체 파일을 삭제하지 않습니다. NOSOUND의 실제 명령 순서를 먼저 확인하세요.</p>
<p>PC 환경 비교는 같은 엔진에서 기준을 먼저 실행한 뒤 mixer.nosound 하나만 바꿉니다. SB16·BAT·CPU·RAW는 유지하며 저장하지 않습니다. CONFIG 조회와 실행 파일 해시는 진단 JSON에 남깁니다. 이는 Debug 성공 설정의 확정 복원이 아닌 run02 기록에 근거한 후보입니다.</p>
<label>실제 등록된 실행 파일<select id="boot-entry"></select></label>
<p>NOSOUND.BAT가 있을 때 아래 실제 명령 순서를 먼저 확인하고 비교하세요. 이름만으로 무음 동작을 보장하지 않습니다. 한글 로더·CD 필요 여부는 참조 증거로만 판단합니다.</p>
<pre id="boot-analysis"></pre>
<label>비교용 CPU cycles<input id="boot-cycles" type="number" min="1000" max="100000"></label>
<label>비교용 메모리<select id="boot-memory"><option>8</option><option>16</option><option>32</option><option>64</option></select></label>
<label>비교용 Sound Blaster<select id="boot-sound"><option value="sb16">SB16</option><option value="sbpro2">SB Pro 2</option><option value="none">카드 비활성 (NOSOUND.BAT와 다름)</option></select></label>
<p>기본값은 현재 프로필과 같습니다. sbbase=220 / IRQ=7 / DMA=1 / HDMA=5. 변경값은 이번 진단에만 적용됩니다.</p>
<p id="boot-block-reason" role="status"></p><button id="boot-start" aria-describedby="boot-block-reason">임시 진단 실행 (저장 안 함)</button></dialog>`);
$('#run-diagnostics').onclick=()=>$('#export-diagnostics').click();
$('#run-performance').onclick=async()=>{
  if(!engine){status('게임 메뉴에 진입한 뒤 측정하세요.',true);return;}
  const button=$<HTMLButtonElement>('#run-performance');button.disabled=true;button.textContent='30초 측정 중…';
  try{const result=await engine.measurePerformance();log(result.valid?`성능 측정 완료: 화면 콜백 ${result.frameCallbacksPerSecond.toFixed(2)}/초 · 표시 기회 ${result.canvasPaintOpportunitiesPerSecond.toFixed(2)}/초. 진단 JSON에 별도 구간을 기록했습니다.`:'성능 측정 무효: 종료·일시정지·백그라운드 여부를 확인하고 같은 장면에서 다시 측정하세요.');}
  catch(e){status(String(e),true);}
  finally{button.disabled=false;button.textContent='30초 성능 측정';}
};
$('#boot-close').onclick=()=>$<HTMLDialogElement>('#boot-dialog').close();
let bootFiles:Files={};
function selectedComparison(){
  const mode=$<HTMLSelectElement>('#boot-comparison').value as ComparisonMode;
  return mode==='manual'?undefined:runtimeComparison(mode,bootFiles,current().executable,current().settings);
}
$('#boot-comparison').onchange=()=>{
  try{
    const comparison=selectedComparison(),p=current();
    for(const id of ['#boot-entry','#boot-cycles','#boot-memory','#boot-sound'])$<HTMLInputElement>(id).disabled=!!comparison;
    $<HTMLSelectElement>('#boot-entry').value=comparison?.entry??p.executable;
    $<HTMLInputElement>('#boot-cycles').value=String(p.settings.cycles);
    $<HTMLSelectElement>('#boot-memory').value=String(p.settings.memory);
    $<HTMLSelectElement>('#boot-sound').value=comparison?.settings.sound??p.settings.sound;
    showBootAnalysis();
  }catch(e){$('#boot-block-reason').textContent=String(e);$<HTMLButtonElement>('#boot-start').disabled=true;}
};
function showBootAnalysis(){
  const plan=bootPlan(bootFiles,$<HTMLSelectElement>('#boot-entry').value,current().settings.prelude);
  $('#boot-analysis').textContent=plan.steps.map(s=>`${s.id}. ${s.batch}:${s.line} [${s.category}] ${s.command}${s.afterExpected?'':' (BAT 연결: 반환 마커 없음)'}`).join('\n')+
    '\n\n확인 사항: '+(plan.issues.join('\n')||'지원하는 직선 실행 흐름. 실제 동작은 Galaxy에서 확인하세요.')+
    '\n\n한글 관련 파일 이름 후보: '+(plan.evidence.koreanCandidates.join(', ')||'발견 안 됨 (필요 없음의 증거는 아님)')+
    '\nCD 이미지 확장자 후보: '+(plan.evidence.cdImages.join(', ')||'없음')+'\n드라이브 참조: '+plan.evidence.driveCommands.map(s=>s.command).join(', ')+
    '\n한글 깨짐은 별도 문제입니다. LOADER.COM이나 CD가 필수라고 가정하지 않습니다.';
  $<HTMLButtonElement>('#boot-start').disabled=!!plan.issues.length;
  $('#boot-block-reason').textContent=plan.issues.length?'임시 진단 실행 불가:\n'+plan.issues.join('\n'):'실행 가능: 직접 실행하는 EXE/COM의 단일 > NUL은 원문을 보존합니다. BAT 전체 리다이렉션·그 외 확장 문법은 허용하지 않습니다.';
  $('#boot-start').title=plan.issues.join('\n');
}
$('#boot-entry').onchange=showBootAnalysis;
on('#boot-open',async()=>{
  idle();const p=current(),save=await getSave(p.id);
  bootFiles={...await profileFiles(p)};
  for(const path of deletedFiles(save))delete bootFiles[path];
  Object.assign(bootFiles,overlayFiles(save));
  $('#boot-entry').innerHTML=executables(bootFiles).map(path=>`<option value="${esc(path)}">${esc(path)}</option>`).join('');
  $<HTMLSelectElement>('#boot-entry').value=p.executable;
  $<HTMLInputElement>('#boot-cycles').value=String(p.settings.cycles);
  $<HTMLSelectElement>('#boot-memory').value=String(p.settings.memory);
  $<HTMLSelectElement>('#boot-sound').value=p.settings.sound;
  $<HTMLSelectElement>('#boot-comparison').value='manual';
  $<HTMLSelectElement>('#boot-engine').value='stable';
  for(const id of ['#boot-entry','#boot-cycles','#boot-memory','#boot-sound'])$<HTMLInputElement>(id).disabled=false;
  showBootAnalysis();$<HTMLDialogElement>('#boot-dialog').showModal();
});
on('#boot-start',async()=>{
  const entry=$<HTMLSelectElement>('#boot-entry').value;
  const settings:DosSettings={...current().settings,cycles:Number($<HTMLInputElement>('#boot-cycles').value),memory:Number($<HTMLSelectElement>('#boot-memory').value),sound:$<HTMLSelectElement>('#boot-sound').value as DosSettings['sound']};
  dosConfig({...current(),settings}); // validate before closing or starting
  const comparison=selectedComparison();
  const selectedEngine=$<HTMLSelectElement>('#boot-engine').value;
  const experimentalEngine=selectedEngine==='phase9-2'||selectedEngine==='phase9-3'||selectedEngine==='phase9-4'||selectedEngine==='phase9-5b'||selectedEngine==='phase9-6'||selectedEngine==='phase9-7'||selectedEngine==='phase9-8c'||selectedEngine==='phase9-8d'?selectedEngine:undefined;
  $<HTMLSelectElement>('#boot-engine').value='stable';
  $<HTMLDialogElement>('#boot-dialog').close();bootFiles={};
  await startGame({...comparison??{entry,settings,mode:'manual'},experimentalEngine});
});
on('#screen-export',async()=>{
  const blob=await new Promise<Blob|null>(resolve=>$<HTMLCanvasElement>('#canvas').toBlob(resolve,'image/png'));
  if(!blob)throw Error('화면 저장 실패. 진단 JSON을 내려받거나 기기 화면 캡처를 사용하세요.');
  download(new Uint8Array(await blob.arrayBuffer()),'ed4-dos-screen.png');
});

void init().catch((e) => status(storageError(e), true));

// Phase 9-8: UI preferences are separate from profiles/saves/legacy controls.
const playUiSnapshot=installPlayUi($("#play-area"));
$('#advanced-content').insertAdjacentHTML('afterbegin','<section id="launcher-update"></section>');
const launcherUpdate=installLauncherUpdate($('#launcher-update'),()=>!!engine||!!running||busy);
const scenePanel=installScenePanel($('.player-toolbar'),()=>engine,download);
for(const id of ['map-confirm','map-cancel','map-menu']){const field=$<HTMLSelectElement>('#'+id);field.disabled=true;field.title='기존 설정은 보존됩니다. ED4 오버레이는 Enter/ESC 고정입니다.';}
