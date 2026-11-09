# Phase 7 — WASM RuntimeError 상세 진단

2026-11-09 / 앱 0.5.0 / `diagnosticRevision=phase7-runtime-1`

## 결과와 한계

Galaxy에서 관측된 `RuntimeError: null function`의 상세 스택을 확보하기 위한 진단 기능과 비교 실행을 구현했다. **실제 Galaxy 오류 함수와 근본 원인은 아직 미확정이다.** 실제 영웅전설4는 PC에서 실행하지 않았고, 게임 구동 성공을 가정하지 않는다. 사용자 관측인 Hotfix 2 진단 성공과 GAME.BAT 1·2행 반환, 3행 DRIVER 및 내부 프로그램 실행 요청은 확인된 현상으로 유지한다.

## 구현

- Worker 내부 `error`, `unhandledrejection`, factory 동기 예외/Promise 실패, Emscripten onAbort를 구분한다. 원래 오류와 기존 onAbort 처리를 유지하고 예외를 숨기거나 자동으로 계속 실행하지 않는다.
- name/message/stack, filename/lineno/colno, 수신 시각, Worker 단계, WASM heap 바이트 수, RAW 마운트 수·읽기 누계·마지막 어댑터 작업을 기록한다. JSON `engine.runtimeErrors.events`에 저장한다.
- main Worker.onerror의 부모 측 위치 정보도 별도 `parent-error`로 기록한다. 브라우저가 stack을 주지 않으면 `stackAvailable=false`로 표시한다. Promise 거부는 독립 filename/행 번호가 없을 수 있으며 실제 스택만 보존한다.
- 스택은 최대 8192자, 오류는 첫 16건으로 제한한다. 이후 메인 수집기의 누락 건수를 기록한다. Worker 전송 역시 최대 16건으로 제한한다. 원본 Error의 임의 필드·Promise payload를 직렬화하지 않는다. 파일 내용/게임 바이트/세이브/메모리 덤프를 수집하지 않는다. URL origin·query, 일반 개인 경로와 인증 문자열을 마스킹한다.
- WASM 함수 번호와 오프셋을 별도 목록으로 추출한다. 원래 스택에 있는 모듈 식별자·JS 호출 경로도 보존한다. `engine.artifact`에 고정 엔진 버전, WASM 해시, 대응 소스 commit을 기록한다.
- 시작 실패 후 Worker를 정리해도 마지막 엔진 진단을 보관한다. 일반 진단 생성에서 저장소 읽기 실패가 나도 오류 내보내기 fallback에 엔진 진단을 포함한다.
- 기존 진단 창에 기능용 비교 선택만 추가했다. 디자인/CSS는 변경하지 않았다. WASM 비교 3종은 현재 cycles/메모리/기존 prelude를 유지하고 모두 SB16을 사용한다. 기준 GAME.BAT → 같은 설치 폴더 NOSOUND.BAT만 변경, 또는 GAME.BAT에서 RAW 마운트만 생략한다. 비교 모드에서는 실행 파일·CPU·메모리·카드의 개별 변경을 잠근다. 기존 수동 진단은 호환성을 위해 유지한다.
- 원본/모드 파일, 프로필과 세이브를 수정하지 않는다. 진단 세션의 checkpoint와 종료 저장은 기존처럼 폐기한다. RAW 생략은 OPFS 음악의 일회성 미마운트이며 파일 삭제나 프로필 연결 해제가 아니다. 본체에 이미 들어 있는 RAW는 삭제하지 않는다.

`bootSettings.runtimeComparison`에 mode, entry, rawMounted, mountedFiles, 기준 BAT 및 변경 요인을 기록한다. NOSOUND가 실제로 없거나 GAME이 모호하면 차단한다. BAT 정적 검사와 Hotfix 2 스위치/리다이렉션 처리는 유지한다.

## 소스/WASM 조사

고정 npm 패키지의 `wdosbox.js.symbols`와 배포 WASM을 대조할 수 있는 읽기 전용 `scripts/inspect-wasm.mjs`를 추가했다. 바이너리와 동봉 심볼 수를 확인한 뒤 함수 번호·본문 오프셋·함수 이름을 보고한다. 실제 스택을 받으면 엔진 재빌드 전에 이 자료로 위치를 좁힐 수 있다. DOS_Execute, 보호 모드/콜백 간접 호출, Asyncify 및 RAW FS 경로의 구체적인 소스 근거와 조건부 최소 패치 검토는 `WASM_ERROR_ANALYSIS.md`에 기록했다.

WASM과 공급 엔진 JS는 기존 바이트 그대로다. 현재 증거만으로 RTM/DPMI 또는 RAW를 원인으로 확정하지 않았고 엔진 빌드 설정도 변경하지 않았다.

## 검증

| 검사 | 결과 |
| --- | --- |
| 수정 전 기존 단위 테스트 | 180/180 통과 |
| 수정 전 기존 Chrome E2E | 34/34 통과 |
| 수정 후 단위 테스트 | 200/200 통과 (신규 20) |
| 신규 Phase 7 Chrome 검증 | 4/4 통과 |
| 전체 Chrome E2E | 38/38 통과 (기존 34 + 신규 4), 3.0분 |
| TypeScript / production 빌드 | 통과 |
| Pages 하위 경로 | 2/2 통과: WASM/Worker, manifest, 캐시 격리, 오프라인 저장·OPFS 복원 |
| 배포 감사 | docs 28개 검사 통과, 상용 게임·RAW·세이브 0, 100 MiB 초과 0 |

신규 Chrome 검증은 독립된 소형 WASM의 미초기화 함수 테이블을 실제 간접 호출해 트랩을 만든다. Worker error와 Promise 거부 각각에서 RuntimeError 스택, `wasm-function[0]`, 오프셋, JS 호출 경로를 확인했다. 동기 오류의 filename은 실제 브라우저가 반환한 `wasm://wasm/...`, lineno/colno를 보존한다. 이는 에뮬레이터 장애 재현이 아니라 오류 수집 경로 검증이다. 테스트 응답에만 코드를 주입하고 배포 파일에는 주입하지 않는다.

초기 실패 뒤 진단 유지, 정상 실행 뒤 오류 기록, 진단 종료 후 기록 유지, 기준/NOSOUND/RAW 생략의 설정 분리, 진단 중 세이브 삭제 후 원본·프로필·기존 세이브 불변, 일반 재실행의 세이브·OPFS RAW 읽기를 확인했다. 신규 오류 주입 테스트만 서비스 워커 캐시를 차단해 라우팅된 테스트 Worker를 사용한다. 기존 오프라인·Pages 검증은 그대로 유지한다. 기존 테스트를 삭제하거나 조건을 완화하지 않았다.

## Galaxy에서 필요한 다음 자료

사용자가 GitHub Desktop으로 Commit·Push 후 배포를 확인한다. 사이트 데이터를 삭제하지 않고 다시 열어 JSON의 `phase7-runtime-1`을 확인한다. 이미 성공한 폴더 등록 프로필을 사용한다.

1. 기준 GAME.BAT + SB16 + 기존 RAW 마운트로 임시 진단한다. 오류 후 즉시 JSON과 화면 PNG를 저장한다.
2. 종료 후 NOSOUND만 비교한다. 실제 BAT 내용과 진입 단계가 기준과 어떻게 다른지 기록한다.
3. 다시 종료 후 RAW 마운트만 생략한다. CPU·메모리는 바꾸지 않는다.

각 실행의 Galaxy 모델/Chrome 버전, mode, 마지막 진입 명령, 오류 발생까지 시간, JSON을 전달한다. 오류가 안 나도 실제 게임 시작/입력/진행을 확인하기 전에는 성공으로 기록하지 않는다. 자세한 순서는 `GALAXY_TEST_GUIDE.md`를 따른다.

## 배포와 변경 파일

`docs/ed4/`, `/porting-pj/ed4/` 경로와 기존 DB를 유지한다. 갱신한 런처 번들, Worker 어댑터, 서비스 워커 캐시 및 GPL 대응 소스를 제공한다. 상용 게임/RAW/세이브를 배포에 추가하지 않는다. Git 원격 연결/Commit/Push를 수행하지 않는다.

런타임 번들 `index-q7M-3BcD.js`, 서비스 워커 캐시 식별자 `da5c06fbb7a32f67`. 공급 엔진 JS/WASM 및 GPL 대응 upstream 소스는 기존 해시와 동일하며 최신 런처 소스·테스트·보고서 ZIP을 포함한다. Pages 검증은 로컬 정적 서버에서 수행했으며 새 GitHub 배포 접속 또는 Galaxy 실기 성공으로 기록하지 않는다. 작업 전후 HEAD `5a1f4f5e821dd1e5368edb1adaf6ab0aa14e8f9a`와 Git 설정을 보존했고 스테이징 파일은 0개다.

로컬 증거는 Git 제외 경로 `artifacts/phase7/`에 보관한다: 수정 전후 E2E 결과, Worker 오류/Promise 거부 JSON, 3종 비교 결과, WASM 함수·심볼 목록과 소스 발췌, Pages 및 배포 감사 JSON. 신규 오류 테스트를 처음 실행할 때 서비스 워커 캐시로 인해 테스트 코드 주입이 우회된 문제를 바로잡았고, filename을 JS 파일로 가정한 신규 테스트도 브라우저 실제 값인 WASM URL과 별도 JS 스택을 검사하도록 정정했다. 이후 신규 4건 및 전체 38건이 모두 통과했다. 기존 테스트 조건은 변경하지 않았다.

- `public/dos-worker.js`: 오류·Promise·abort 수집과 어댑터 작업 메타데이터.
- `src/engine.ts`, `src/runtime-errors.ts`: 오류 전송 분리, 제한·마스킹, 엔진 식별과 상세 JSON.
- `src/main.ts`, `src/runtime-comparison.ts`, `src/simple-import-ui.ts`: 일회성 비교 실행, 시작 실패 기록 유지, 진단 리비전.
- `scripts/inspect-wasm.mjs`: 고정 바이너리와 동봉 심볼 맵 대조.
- `tests/phase7.test.ts`, `tests/e2e/phase7.spec.ts`: 신규 검증.
- 이 보고서, `WASM_ERROR_ANALYSIS.md`, `GALAXY_TEST_GUIDE.md`, `docs/ed4/`: 안내와 배포 결과.

Phase 7의 현재 달성 범위는 **실제 발생 위치를 좁힐 수 있는 상세 진단 기능과 비교 빌드 제공**이다. 실제 Galaxy 스택을 확보한 뒤에만 정확한 위치/원인을 판정하고, 엔진 패치가 필요하면 위치·최소 변경·부작용·재빌드 계획을 먼저 보고한다.
