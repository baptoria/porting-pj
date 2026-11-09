# Phase 9-8E — 배포 버전 검증 및 다중 장면 진단

작성: 2026-11-10 KST. 로컬 구현·검증 완료, Git Commit/Push 및 원격 배포 조작 없음.

## 1. 확인된 배포 실패 원인

GitHub에 파일이 있는 상태와 Pages가 그 파일을 제공하는 상태가 달랐다. **최신 커밋의 Pages build는 성공했으나 deploy가 파일 동기화 중 시간 초과로 실패했다.** Galaxy 캐시만으로 설명할 문제가 아니다. 단, 해당 Galaxy의 서비스 워커 상태를 직접 조회하지 않았으므로 캐시/활성화 지연이 함께 있었는지는 미확인이다.

- 조사한 main HEAD: `0ed2f1a0ec1d4ca0f8030c9ab587cc1319b9251b` (`2x check`, 2026-11-09 16:16:34 UTC).
- [실패한 Pages 실행 42653426310](https://github.com/baptoria/porting-pj/actions/runs/42653426310).
- build job `129285513933`: 성공. 로그에서 `ref: main`, `path: ./docs`, `INPUT_PATH: ./docs`, 26,933,971바이트 artifact 업로드를 확인했다. 이는 이 실행의 실제 소스이며, Settings 화면을 직접 조회한 결과는 아니다.
- deploy job `129285645213`: 실패. queued 이후 `syncing_files`가 지속되었고 16:29:15 UTC에 `Timeout reached, aborting!`, 16:29:16에 배포 취소. 설정된 timeout은 600000ms. 동기화 지연의 GitHub 내부 원인은 로그만으로 확정하지 않는다. 타임아웃 상향이나 앱 엔진 변경으로 해결 처리하지 않았다.
- 직전 성공 실행: `42614857710`, 커밋 `931276043f7490bea66331679f29ca0bdd3f26ae`.
- Pages 설정 REST 조회는 404여서 관리 설정의 현재 상태는 직접 확인하지 못했다. 위 build 로그로 main/docs 사용을 확인했다.

### 실제 HTTPS 파일 대조

마지막 직접 재조회: 2026-11-09 17:35 UTC (11월 10일 02:35 KST). HTTP GET으로 받은 응답 본문을 SHA-256으로 대조했다. 고정 커밋의 raw GitHub 파일을 비교 대상으로 사용했다.

| 대상 | 실제 Pages | main 커밋 배포 파일 |
|---|---|---|
| HTML 참조 JS | `assets/index-BNo9fq6M.js` | `assets/index-DLZJ9ICp.js` |
| JS의 phase9-8c / phase9-8d | 둘 다 없음 | 둘 다 있음 |
| CSS | `index-5olS-JCf.css` | `index-DRx_u8kW.css` |
| Phase9-8D Worker manifest | 404 | 200 |
| 9-8D 진입/공용 Worker | 모두 404 | 모두 200, 고정 해시 일치 |
| 9-8D WASM / 엔진 manifest | 모두 404 | 모두 200 |
| PWA manifest | 200, 동일 | 200, 동일 |
| 서비스 워커 | 이전 셸 코드 | 새 9-8D 자산 목록 포함 |

확인된 해시:

| 파일 | 실제 Pages SHA-256 | main 배포 파일 SHA-256 |
|---|---|---|
| index.html | `8629470dfe159c1edf28be91286b0419bd29e8124d39430b859aa697285d8928` | `5786fb3be1df15c7e25b30492a3dc68f7de8f1fffa973e07494a019378d40fed` |
| HTML이 참조하는 JS | `778759fda0a0e9cdde769801c98fbf9269027911b1ec55cd9021e0517c48c1f3` | `cec655f406198cf845a49d4f2e18946108a6f6b3f414728c3d9ab563d57005a1` |
| sw.js | `cf70f2b68585cadb6d3f18c60a7fbf3dab6765773acb2a8ac78c2a7833459fb3` | `3d58dcf7480433193979cf8a0c48277b0227fee6963aff4101f2ed733e3d6fea` |

온라인 HTML은 실제 존재하는 이전 JS를 가리켰다. 이번 조회에서 HTML/JS 혼합은 확인되지 않았고, **서버 자체가 이전 배포본**이었다. PWA manifest는 내용이 같으므로 그것만으로 최신 실행기를 판정할 수 없다.

원시 공개 HTTP 자료/메타데이터: `artifacts/phase9-8e/online/comparison.json`. Pages 로그 발췌: 같은 폴더의 `pages-build-excerpt.txt`, `pages-deploy-excerpt.txt`. 재현 스크립트: `scripts/inspect-phase9-8e-online.mjs` (비교 커밋을 고정한 감사 스크립트).

Galaxy JSON17 원문은 로컬에서 확보하지 못했다. 사용자 제공 `engine.artifact.id=phase9-7`은 해당 진단이 9-8D 실행 결과가 아니라는 증거다. 단말의 controller/waiting/cache 상태와 첫 다운로드 이후 문제가 발생한 직접 원인은 미확인이다.

## 2. 실행기 빌드 식별

최종 로컬 빌드:

- ID: `9-8e-20261109173930179-3980f9ae`
- 기준 Git SHA: `0ed2f1a0ec1d`, `dirty=true` (미커밋 구현 포함). 이것을 이미 배포된 커밋 SHA라고 표시하지 않는다.
- 시각: `2026-11-09T17:39:30.179Z`
- 프런트엔드 revision: `phase9-8e-1`
- 메인 번들: `assets/main-CjTaLlxc.js`
- 서비스 워커 SHA-256: `8386b44c6f90534f20cee31f55e5e3c262df571474fabbe3b6c1b9d04a785f6d`

`scripts/build-id.mjs`가 production build마다 시각+UUID 기반 새 ID를 생성한다. 컴파일된 프런트엔드, 별도 업데이트 페이지, `build-manifest.json`, 서비스 워커에 같은 ID가 들어간다. 설정 → **실행기 버전 · 업데이트**에서 현재 코드, Git SHA/dirty, 빌드 시각, 실제 controller의 버전, 온라인 배포, waiting 버전을 구별한다. 구버전 SW가 응답 프로토콜을 지원하지 않으면 미확인으로 표시한다. 버전 조회 실패만으로 게임 실행을 막지 않는다. 확인된 코드/SW 불일치나 전환 잠금은 혼합 실행을 막는다.

기존 `appVersion=0.5.0`, `diagnosticRevision=phase7-runtime-1` 필드는 하위 호환용으로 보존했다. 실제 프런트엔드 판정에는 새 `launcher.loadedFrontend`를 사용한다. **이번에는 새 WASM 엔진을 만들지 않았다. 실행기는 9-8E, BGM 계측 엔진은 기존 9-8D다.**

## 3. 안전한 업데이트 구현

`src/launcher-update.ts`, `scripts/sw.mjs`, `scripts/shell-worker.js`:

1. 캐시 우회 manifest 조회, 온라인 sw.js SHA-256 대조.
2. 새 SW install에서 자신에게 내장된 파일 목록과 manifest의 build ID/목록이 일치하는지 확인.
3. HTML/JS/CSS/Worker/WASM/manifest/아이콘/고지 등 101개 파일을 순차 다운로드하고 **각 바이트 길이와 SHA-256** 검증. 임시 메모리는 한 자산 단위로 처리한다.
4. 완성된 새 셸은 waiting 상태에서 유지. 설치/해시 검증 실패 시 새 캐시만 폐기하고 기존 active 셸은 유지. 가능한 경우 실패한 파일 경로를 UI에 전달한다.
5. 게임 종료 후 사용자가 **업데이트 적용**을 누른 경우에만 활성화 요청. 실행기 창이 하나인지, 해당 창이 현재 게임/등록/저장 작업 중이 아닌지 메시지 왕복으로 확인하고 새 게임 시작을 잠근 뒤 skipWaiting.
6. controllerchange 후 승인된 전환에 한해 새로고침. sessionStorage의 기대 ID와 실제 컴파일된 ID를 재대조하고 `launcher.postUpdate`에 기록.
7. 활성화 후 이 scope의 `ed4-shell-<scope>-` 캐시만 정리. 타 앱 캐시, IndexedDB, OPFS, localStorage/UI 설정에는 삭제/초기화 호출이 없다.
8. 새 SW는 자신이 검증한 셸 캐시의 자산만 제공한다. 캐시에 없는 JS/Worker/WASM을 새 네트워크 버전으로 조용히 대체하지 않고 503을 반환한다. manifest/SW 검사는 네트워크, GPL sources 다운로드는 기존 경로를 사용한다.

설치 검증은 완결성 검사이며 서명 기반 신뢰 체계는 아니다. Cache Storage 자체가 외부에서 변조/삭제되는 상황이나 브라우저의 저장소 퇴거까지 방지한다고 주장하지 않는다. 저장 공간 부족 시 업데이트 실패로 남고 기존 데이터 삭제를 요구하지 않는다.

구버전에는 버튼이 없으므로 `update.html`을 별도 제공한다. 게임 종료 및 다른 실행기 창 닫기 후 이 페이지에서 갱신할 수 있다. 초기 install 실패/구버전 SW 무응답/다중 창/실행 중/불완전한 배포를 구분한다. 활성화 응답 지연 시 업데이트 페이지로 복귀할 안내를 표시하며 잠금을 조용히 해제해 혼합 실행하지 않는다.

`.gitattributes`의 `/docs/ed4/** -text`로 모든 해시 대상 배포 파일의 Git 줄바꿈 변환을 막았다. 기존 license NOTICE의 내용은 그대로이며 해당 파일의 diff는 원시 줄바꿈 보존에 따른 것이다. `scripts/check-shell-release.mjs`는 manifest, JS 엔진 선택지, SW, Git clean-filter 전후 바이트 보존, 100MiB 제한을 검사한다.

## 4. 다중 장면 진단

전체화면 ☰ 메뉴 → **장면 진단**에 장면 선택(타이틀/필드/전투/복귀), 현재 장면 기록, 전체 진단 다운로드, 개수/마지막 시각/선택 및 실제 엔진/수집 상태를 추가했다. 패널은 닫아도 같은 세션 기록을 유지한다. 4방향 버튼과 Enter/ESC는 그대로다.

`src/scene-diagnostics.ts`, `src/scene-panel.ts`:

- 매 실행 새 UUID. 시작/종료 시각, 경과시간, 빌드, 선택 엔진과 실제 초기화 확인 엔진을 별도로 기록.
- 기존 실험 WASM의 실제 컴파일 대상 SHA-256와 고정 Worker bootstrap 검증 후 backend ready가 된 경우 실제 엔진으로 표시. 준비 중/실패 시 실제 엔진은 null. Stable의 기존 해시는 고정 릴리스 값이며 새 런타임 해시 측정으로 가장하지 않는다.
- 선택/실제 엔진 불일치 시 명확한 오류. 안정 엔진으로 자동 대체 없음.
- INT66 명령별 누계, INT69 누계/이벤트, RAW 누계/바이트, 버퍼/DMA 메타데이터, 오디오 상태/출력 통계, runtimeErrors 및 이전 장면 대비 증가량.
- query timeout 자료는 stale/unavailable이며 새 0으로 기록하지 않는다. 카운터 감소는 reset으로 표시하고 음수 증가량을 만들지 않는다.
- 첫 장면의 증가량은 기준이 없으므로 null. 나중 장면의 startup 통계는 **세션 시작 첫 60초 자료**라고 명시하며 해당 장면의 일반 audioOutput과 구별.
- 게임 파일 바이트, PCM 샘플, 세이브 내용, 프로필 전체/게임 메모리 덤프를 새 통합 JSON에 넣지 않는다. 파일 식별은 기존 검증된 상대 경로/해시 메타데이터 수준이다.

### 보존/성능 상한

- 기존 native first32 + tail256 링 버퍼 및 INT66/69 계측은 변경하지 않았다. CPU 명령 단위 추적 재도입 없음.
- 실행 시작 및 장면 버튼에서 수집하고, 화면이 보일 때 최대 10초 간격으로 기존 읽기 전용 쿼리를 배치 수집한다. 오디오 명령마다 JS 메시지를 보내지 않는다. 동시 쿼리는 합치며 이전 세션의 늦은 응답을 새 세션에 붙이지 않는다.
- host 이벤트는 first32 + 최근2016, 합계2048개 상한. 장면 최대16개, 세션 수집 최대2시간. 반복/중복 sequence는 다시 쌓지 않는다.
- 각 장면에 native overwritten, 관측 sequence gap, hostDiscarded를 기록한다. 누락 구간은 추측해서 복원하지 않는다. 짧은 폭주에서 10초 사이 native 이벤트가 덮어써질 수 있으므로 완전한 명령 로그라고 부르지 않는다.
- 통합 JSON 출력 상한8MiB. 초과/다운로드 실패 시 기존 메모리 기록은 유지한다. 새 게임 시작은 새 세션이므로 기존 장면은 먼저 다운로드해야 한다. 새로고침/브라우저 종료까지 기록을 영구 보관하는 기능은 아니다.
- 공개 폭주 probe의 최종 4장면 JSON은 1,738,898바이트, 쿼리5회 대기시간 합계 약53.6ms, native overwritten 및 관측 gap424개였다. 쿼리 왕복 대기시간은 CPU 비용이나 Galaxy FPS 측정이 아니다. 실제 기기 성능 영향은 미검증이다.

## 5. 다운로드 후 계속 실행

새 통합 다운로드는 이미 수집된 메타데이터를 사용한다. 클릭 직후 IndexedDB/OPFS 전체 조회나 비동기 진단을 기다리지 않으므로 Android 사용자 활성화 토큰 소실 위험을 줄인다. DOM에 anchor를 붙여 동기 클릭하고 정리하며 Blob URL은60초 후 해제한다. Worker 종료, pause, 전체화면 해제, AudioContext 중지 호출은 없다.

기존 단일 JSON 다운로드도 anchor 처리만 보강했다. 기존 async 진단 경로 자체는 호환용으로 보존했고 새 장면 수집을 권장한다. 브라우저가 다운로드를 요청받은 것과 실제 파일 저장 성공은 구분하며 UI도 '다운로드 요청'이라고 표시한다.

로컬 Chrome에서 반복 다운로드, 강제 download 거부 후 기록 유지/재시도, 이후 두 번째 장면 기록, 메뉴 닫기 후 방향 입력, Worker 실행 유지, 원래 종료 경로를 검증했다. Galaxy의 시스템 다운로드 화면 전환/앱 중단·복귀/오디오 지속을 실기 성공으로 보고하지 않는다. JSON17 사용자 문제의 정확한 재현 원인도 아직 확정되지 않았다.

## 6. 테스트 결과

기존 테스트 조건 삭제/완화 없음. 공개 COM/EXE와 합성 RAW만 사용했다. 상용 ED4 실행은 수행하지 않았다.

| 검증 | 결과 |
|---|---|
| 변경 전 단위 / 기존 Chrome E2E | 310 / 38 통과 |
| 변경 후 단위 | **322 통과** (기존310 + 신규12) |
| TypeScript / production build | 통과 |
| 기존 E2E | **38 통과** |
| 기존 Pages 통합 | 2 통과 |
| 기존9-8D 오디오/모딩/메모리/저장 | 14 통과 |
| 기존9-8C | 6 통과 |
| 기존9-7 UI/쿼리 timeout | 2 통과 |
| 기존4방향/멀티터치 UI | 3 통과 |
| 기존9-8B 시간/OPL/PCM/독립 BGM prototype | 7 통과 |
| 신규9-8E 브라우저 | **6 통과** |
| 브라우저 합계 | **78 통과** |
| 로컬 release 전체101파일/해시/Git바이트/100MiB | 통과 |

신규 브라우저 검증: A→B build waiting/수동 적용/실행 중 거부/다른 창 거부, 실제 공개 SAVE 복원과 OPFS RAW 읽기, unrelated cache/localStorage/IDB 보존, 불완전 WASM 설치 거부와 재시도, manifest/SW 불일치 거부, 이전 cache-first/9-7 메뉴에서 update.html을 통한 갱신, 실제9-8D WASM으로 INT66/69 장면 기록, 모바일 크기 전체화면 메뉴/반복 및 실패 다운로드/계속 입력.

중간 시험 실패도 구분한다. 새 테스트 서버의 불완전 파일 주입 경로가 `vendor/experimental`을 빠뜨린 문제, 미등록 화면에서 숨겨지는 play 버튼을 보이는 것으로 기대한 문제, 업데이트 버튼에 포커스가 남은 상태에서 문자키를 보낸 시험 문제가 있었다. 신규 fixture 경로/상태 기대/게임 Canvas 포커스를 바로잡았고 기존 테스트를 완화하지 않았다. 최종 신규6개 전부 통과했다.

증거: `artifacts/phase9-8e/unit.log`, `regression-e2e.log`, `playwright.*.log`, `update-final.log`, `tests.json`, `local-release.json`, `browser/`의 통합 JSON과 모바일 화면 캡처. 최종 UI 축소/업데이트 오류 안내 변경 후 해당 신규6개를 재검증했다.

## 7. 보존 및 배포 준비

- 기존 Stable/9-2/9-3/9-4/9-5B/9-6/9-7/9-8C/9-8D WASM과 DOS Worker 바이트를 교체하지 않았다. C++ 및 CPU/IRQ/DMA/게임 명령 의미 변경 없음.
- 9-8D WASM: `55d8e4f997785719a7dc2284b9962e12d4573a57b2ec29e0d7c62959ae1da440`.
- 9-8D 공용 Worker: `32f4b6d06fdadbacb5b500c454d02d374455ef604ead2c64d0e63ce466568781`; 진입 Worker: `2dc577fcc40e874976209e51595ea5a2fc63d5a176c21815beeed7d70a3fb6ff`.
- 9-7이 재사용하는9-6 WASM: `f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3`.
- VGA 호환성/CPU 추적 OFF/모노 오디오/예약 중첩 방지/수정 게임 해시 참고 정책은 기존 회귀 시험으로 확인했다. 게임 해시를 새 실행 차단 조건으로 추가하지 않았다.
- 저장 스키마, 게임·RAW·세이브 처리, 프로필 자동 변경 없음. 테스트는 격리된 Playwright 저장소만 사용했다. Galaxy의 기존 데이터에는 접근하거나 삭제하지 않았다.
- `docs/ed4/` 갱신. `.nojekyll`, GPL 고지 및 대응 소스 유지. 소스 ZIP은 최종 코드/테스트/보고서로 재포장한다. sources ZIP은 오프라인 셸 검사 대상에서 제외하며 온라인 제공 경로를 유지한다.
- 배포 폴더에 RAW/EFC/SAV/ISO/CUE 원본 파일 없음, 100MiB 초과 파일 없음. 기존 공개 테스트 ZIP/GPL 대응 소스 외 상용 게임 자료를 추가하지 않았다.
- 2× 버튼은 여전히 비활성. BGM 소유권/중복 출력 억제는 검증되지 않았으며9-8B prototype 보존. 이번 작업으로 게임2×/BGM1×가 완성된 것은 아니다.

## 8. 사용자가 수행할 최소 Galaxy 절차

1. GitHub Desktop에서 변경 파일을 검토하고 사용자가 Commit/Push한다. Pages 설정은 기존 `main / docs`를 유지한다. Actions에서 최신 **build와 deploy 둘 다 성공**했는지 확인한다. 같은 `syncing_files` timeout이면 실패 run의 Re-run failed jobs 또는 최신 배포 재시도를 사용자가 수행한다. 실패가 반복되면 그 run 로그가 필요하다. 로컬 구현만으로 GitHub 배포 성공을 대신할 수 없다.
2. 배포 성공 후 Galaxy 게임을 종료하고 다른 실행기 탭/PWA 창을 닫는다. 구버전 메뉴만 보이면 [안전한 업데이트 페이지](https://baptoria.github.io/porting-pj/ed4/update.html)를 열어 **업데이트 적용**을 누른다. 이 주소는 이번 배포가 성공한 뒤 제공되며 현재 서버에서 성공했다고 주장하지 않는다. 사이트 데이터 삭제/재설치/게임 재등록은 하지 않는다.
3. 설정 → 실행기 버전에서 위 `9-8e-...` ID와 서비스 워커 ID를 확인한다. **임시 실행 추적 → 이번 진단의 엔진 → Phase9-8D**를 명시적으로 선택한다. 새로운 Phase9-8E 엔진 항목은 없다. 기존 게임/음악 연결을 그대로 사용한다. 진단 세션의 게임 변경분은 저장하지 않는다.
4. 타이틀 음악이 나온 뒤 ☰ → 장면 진단 → 타이틀 → 현재 장면 기록. 메뉴를 닫고 이동한다. 필드 음악, 전투 음악, 전투 후 필드 복귀에서 같은 방법으로 각각 기록한다. 각 버튼을 누른 시점이 장면 기준이며 자동 장면 인식이 아니다.
5. 기록4개, 실제 엔진 `phase9-8d`를 확인하고 **전체 진단 다운로드**를 한 번 누른다. 메뉴를 닫고 이동/Enter/ESC/음악이 계속되는지 확인한다. 다운로드 후 문제가 생기면 화면 복귀 여부, 소리 여부, 마지막 장면 상태를 함께 알려준다. 필요한 경우 같은 JSON 다운로드를 다시 눌러도 내부 기록은 지워지지 않는다.
6. 받은 `ed4-scenes-<session>.json` 하나를 전달한다. 마지막에 '진단 종료 (저장 안 함)'로 종료한다. 일반 플레이9-7 경로와 기존 원본/음악은 유지된다.

## 9. 남은 미확인 사항

실제 최신 Pages 재배포 성공, Galaxy SW controller/waiting 상태, Android 시스템 다운로드 이후 오디오/전체화면 복귀, 장시간 실기 성능, 실제 타이틀·필드·전투 INT69와 BGM 버퍼 소유권은 아직 미검증이다. 정상한글/게임/소리 실기 성공은 기존 사용자 관측을 유지하며 이번 작업의 신규 실기 결과로 재사용하지 않는다. 통합 JSON을 확보한 뒤 실제 음악 제어 경계를 판단한다. 다음 Phase로 자동 진행하지 않는다.
