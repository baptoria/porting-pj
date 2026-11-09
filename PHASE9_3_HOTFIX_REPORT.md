# Phase 9-3 Hotfix — 실험 Worker의 버전 혼합 방지

2026-11-09. 프로젝트 `D:\porting\ed4-mobile`, 배포 루트 `docs/ed4/`, 웹 경로 `/porting-pj/ed4/` 유지.

## 판정

**과거 공용 Worker 캐시와 새 Phase 9-3 진입 파일을 결합하면 사용자가 보고한 초기 로딩 오류를 재현할 수 있었다.** 공용 코드와 진입 파일을 각각 내용 해시가 들어간 경로로 고정했고, 같은 혼합 캐시에서 실제 Phase 9-3 WASM 실행과 공개 RETF 프로그램의 CPU 이력 수집을 확인했다. 온라인과 네트워크가 차단된 오프라인 시험 모두 통과했다.

이는 Worker bootstrap 수정이다. CPU 계측, DOS 실행 의미, Asyncify, WASM, 게임 원본·RAW·EFFECT·세이브는 변경하지 않았다. 영웅전설4 실행과 Galaxy 재시험은 수행하지 않았으며 게임의 Reset Vector 진입 원인은 여전히 별도 미확정이다. Git Commit/Push 및 배포 업로드는 하지 않았다.

## 원인 분석과 확인 범위

1. 기존 `dos-worker-phase9-3.js`는 Phase 9-3 ID를 설정하고 고정된 공용 경로 `importScripts('./dos-worker.js')`를 호출했다.
2. 기존 서비스 워커는 `cache.match(request) || fetch(request)` 방식이다. 캐시에 있는 공용 Worker를 최신 서버 파일과 재검증하지 않는다. 캐시에 없는 새 진입 파일만 네트워크에서 가져올 수 있다. CacheStorage와 브라우저 HTTP 캐시는 별개다.
3. 실제 과거 commit `e0416a0`의 공용 Worker는 173행에서 `selectedEngine !== 'phase9-2'`를 거부한다. 이 파일과 수정 전 Phase 9-3 진입 코드를 브라우저에서 결합한 공개 시험은 **Unknown diagnostic engine / stage import-engine / 프레임 0 / EXEC 요청 0 / CPU history 없음**으로 실패했다. 게임·CPU 실행 전의 오류다.
4. `importScripts`가 항상 최신 네트워크 파일을 받는다고 가정할 수 없다. 시험에서 동일 scope의 서비스 워커가 공급하는 캐시 응답을 실제 Worker가 사용했다. 단순 새로고침, 쿼리 문자열 또는 SW 캐시 이름만 바꾸는 방식에 의존하지 않는다.

현재 공개 Pages 파일은 인증 없는 HTTP GET으로 읽기만 했다. 2026-11-09 05:02:50 UTC 검사에서 `dos-worker.js`, `dos-worker-phase9-3.js`, `sw.js`, `index.html`, 실험 엔진 manifest **5개 모두 HTTP 200이며 로컬 수정 전 배포본과 바이트·SHA-256이 일치**했다. 응답 `Cache-Control: max-age=600`, Last-Modified `Mon, 09 Nov 2026 04:47:35 GMT`였다. 자료: `artifacts/phase9-3-hotfix/remote-check.json` 및 `remote-*`.

- 당시 공개 공용 Worker SHA-256: `468a75b5baf5667decfa25b4b0e54ae247577d72ffbbe5f471fa6ac833597bce`
- 당시 공개 Phase 9-3 진입 Worker: `a27cc5e04ddddef8c80b196f4f7a91cf2288bcf0a944c8f9009b0f61e6b5ba9a`
- 확인 주소: `https://baptoria.github.io/porting-pj/ed4/`

**현재 서버 파일이 맞다는 사실은 Galaxy 내부 캐시의 일치까지 증명하지 않는다.** 사용자의 실제 CacheStorage/HTTP 캐시를 직접 읽지는 않았다. 캐시 혼합은 현상과 일치하며 재현된 원인이고, 과거 특정 배포 시점의 부분 배포/CDN 혼합 여부까지 확정하지 않는다. Git 원격 재연결·인증·업로드는 수행하지 않았다.

## 실제 최소 수정

| 파일/영역 | 수정 |
| --- | --- |
| `public/dos-worker.js` | 공용 코드 끝에 호환성 marker 한 줄 추가. 기존 엔진/파일 시스템/오디오 동작 그대로 |
| `scripts/phase9-3-worker-bundle.mjs` | canonical 공용 코드의 SHA-256으로 파일명 생성. bootstrap도 자체 내용 SHA-256으로 파일명 생성. 바이트·해시·manifest 비교 함수 |
| `scripts/prepare-phase9-3-worker.mjs` | 공용 소스를 **그대로 복사**해 고정 파일 생성. 같은 해시 경로에 다른 내용이 있으면 중단. 진입 코드/호환 alias/manifest/TS 경로 상수 생성 |
| `scripts/check-phase9-3-worker.mjs` | Vite 빌드 후 public와 docs의 공용 바이트·진입 코드·전체 SHA-256·TS 상수·SW 캐시 포함 여부 검사 |
| `src/generated/phase9-3-worker.ts` | 빌드와 일치하는 경로/해시 상수. 수동 편집하지 않음 |
| `src/engine.ts` | Phase 9-3에만 해시 경로의 진입 Worker 사용. bootstrap 호환성 응답 검증과 명확한 실패 기록. 안정/Phase 9-2 선택 경로 유지 |
| `public/dos-worker-phase9-3.js` | 캐시되지 않은 구 런처를 위한 호환 alias도 새 공용 경로를 참조. 새 런처는 이 가변 alias에 의존하지 않음 |
| `scripts/prepare.mjs`, `package.json` | 생성 → TypeScript → GPL 소스 묶음 → Vite → SW → 배포 해시 검사 순서 |
| `scripts/package-source.mjs`, `.gitattributes` | 새 Worker/manifest의 대응 소스 포함 및 해시 대상 파일의 줄바꿈 보존 |

공용 코드 SHA-256:

`735ee752056417c87beb4c45ee9b23a38754c168026b947bd3d6446144fb03d7`

진입 코드 SHA-256:

`8ff28155444b0ef88a8b3e24b448d9458afa1adbe0a13f5dae565950b65cf33d`

실제 파일:

- `docs/ed4/dos-worker-common-phase9-3-735ee752056417c8.js`
- `docs/ed4/dos-worker-phase9-3-8ff28155444b0ef8.js`
- `docs/ed4/phase9-3-worker.json`

공용 코드가 바뀌면 공용 URL과 이를 참조하는 진입 URL이 모두 바뀐다. 진입 템플릿만 바뀌어도 진입 URL은 바뀐다. 기존 공용 URL/기존 alias를 캐시에 남겨도 새 런처가 이 파일들을 Phase 9-3용으로 요청하지 않는다. 생성된 공용 파일은 canonical과 바이트가 동일하며 별도 수동 fork가 아니다.

서비스 워커의 cache-first 정책·scope·활성화 방식은 바꾸지 않았다. 기존 자동 생성 캐시 목록에 새 공용/진입/manifest를 추가해 **41개 파일**을 포함한다. 기존 캐시나 IndexedDB/OPFS를 강제 삭제하지 않는다. 새 SW 정상 활성화 시 같은 앱 shell의 구 캐시를 정리하는 기존 동작도 그대로다.

## 불일치·실패 처리

진입 Worker는 고정 공용 파일의 `importScripts` 성공 후 `phase9-3-common-1` 호환성 marker를 확인한다. 실패하면 `worker-bootstrap` 오류를 전달하고 **Worker를 닫는다**. 안정 엔진이나 가변 공용 파일을 다시 시도하지 않는다.

- 파일 누락/네트워크/importScripts 실패: `stage=import-common-worker`, 요청한 고정 파일명과 원래 오류 메시지(상한 적용).
- 코드의 marker 불일치: `stage=check-common-worker`.
- 런처가 기대한 bootstrap 응답과 불일치: Worker terminate 및 시작 실패.
- 사용자 안내: 모든 실행기 탭/PWA를 닫고 온라인에서 업데이트, 사이트 데이터 삭제 금지, 안정 엔진으로 자동 대체하지 않았음을 명시.

진단 JSON의 `engine.artifact.worker`에 `entry`, `common`, `expectedSha256`, `revision`, `bootstrap=pending/ready/failed`를 기록한다. **expectedSha256은 빌드에서 검증한 공용 JS 해시이며 브라우저에서 공용 JS 전체를 다시 해싱했다는 의미가 아니다.** ready는 공용 코드 호환성 확인이며 DOS/게임 초기화 성공이 아니다. WASM은 기존처럼 실제 받은 바이트를 SHA-256 검증하고 동일 컴파일 모듈을 실행한다.

## 검증

TypeScript 및 production build, 생성 파일의 바이트·SHA-256·캐시 목록 검사는 통과했다. 기존 테스트 파일과 검증 조건은 수정하지 않았다. 단위/브라우저 결과 원본은 `artifacts/phase9-3-hotfix/`에 보관한다.

| 최종 검증 | 통과 | 결과 파일 |
| --- | --- | --- |
| 단위 | 238/238 | `unit-after.json` |
| 기존 Chrome E2E | 38/38 | `e2e-after.json` |
| 신규 혼합 캐시/로딩 | 8/8 | `cache-tests.json` |
| 기존 Phase 9-2 통합 | 4/4 | `phase9-2-ui.json` |
| 기존 Phase 9-3 통합 | 4/4 | `phase9-3-ui.json` |
| 기존 Phase 9-2 공개 A/B | 13/13 | `phase9-2-public.json` |
| 기존 Phase 9-3 공개 CPU A/B | 24/24 | `phase9-3-public.json` |
| 기존 Pages 경로/오프라인 | 2/2 | `pages.json` |

최종 결과에는 실패·skip·flaky가 없다. 최초 신규 시험 구성의 실패는 아래에 따로 기록했다. 기존 테스트 파일, CPU 계측 소스, vendor 및 대응 소스 등 **101개 보존 대상 파일**의 수정 전후 해시가 동일하다(`preservation.json`). 배포 파일의 100MiB 초과 및 game/RAW/EFFECT/save 파일 확장자 검사는 0건이었다(`deploy-files.json`). 기존 GPL 대응 소스와 고지문은 유지하고 런처 대응 소스 ZIP에 이번 생성 코드와 시험 소스를 포함했다.

Git HEAD는 `4f24765ee160b86070f95f96bb875ec13535420a` 그대로이며 staging/Commit/Push를 하지 않았다. 소스·빌드·시험 변경은 이 프로젝트 안에만 있다.

- 수정 전: 단위 **229/229**, 기존 Chrome E2E **38/38** 통과.
- 수정 후: 단위 **238/238** 통과. 신규 9개는 내용 변경 시 양쪽 URL 변경, 공용/진입/manifest 불일치 차단, marker 누락, import 실패, 명확한 종료/호환 응답을 검증한다.
- 신규 혼합 캐시 브라우저 시험 **8/8** 통과:
  1. 실제 과거 공용 Worker + 수정 전 최신 진입 코드로 사용자 오류 재현.
  2. 구 공용/구 alias가 남고 새 고정 파일은 캐시에 없는 온라인 상태에서 실제 새 WASM·CPU 이력 수집.
  3. 구 공용/구 alias와 검증된 새 파일이 공존하는 캐시에서 네트워크 차단 후 CPU 이력 수집.
  4. 기존 세이브 읽기, 합성 RAW 읽기, 진단 중 세이브 삭제 변경분 폐기, DB/OPFS snapshot 보존, 안정 및 Phase 9-2 복귀.
  5. 고정 공용 파일이 없고 네트워크도 없으면 명확한 시작 실패, 데이터 보존.
  6. 고정 경로에 과거 공용 코드가 잘못 들어 있으면 정확한 오류와 중단, 자동 대체 없음.
  7. 잘못된 marker 응답도 중단.
  8. HTTP로 제공되는 공용/진입/manifest 해시와 오프라인 목록 일치.

시험은 별도 test server와 Chrome 격리 프로필에서 실행했다. `tests/fixtures/phase9-3-hotfix/`에는 실제 과거 Git Worker 소스만 있다. 운영 Worker/CPU 동작을 mock하지 않고 cache-first SW 캐시를 조성했다. 오프라인 시험은 Playwright의 offline 설정뿐 아니라 **시험용 SW의 네트워크 전송도 차단**해, 캐시 누락이 네트워크로 보충되는 것을 막았다. 이 test SW/fixture는 운영 `docs/ed4/`에 독립 실행 파일로 배포하지 않는다(GPL 런처 소스 ZIP에는 테스트 소스로 포함).

최초 시험 5/8, 두 번째 7/8 통과 기록도 보존했다. 두 실패는 브라우저 evaluate에 Node 변수를 전달하지 않은 새 시험 코드 오류였고 수정했다. 파일 누락 시험은 CacheStorage 항목 삭제와 Playwright offline만으로 실행 중인 SW까지 네트워크가 차단됐다고 가정한 문제였다. HTTP 캐시까지 비워도 실패가 재현되지 않아, 시험 SW의 전송 차단을 명시한 뒤 같은 시작 실패 검증 조건이 통과했다. 제품 코드나 기존 테스트 조건을 낮춰 통과시키지 않았다. 자료: `cache-tests-first.json`, `cache-tests-second.json`, `cache-tests.json`, `browser-first/`.

성공 시험의 Phase 9-3 WASM SHA-256은 **a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b**로 기존과 동일하다. 공개 RETF의 `FFFF:0000` 전이와 CPU 이력을 JSON에 수집했고 기존 `Aborted()`는 유지한다. null function/Unknown diagnostic engine 없이 bootstrap ready를 확인했다. 이는 게임 성공 판정이 아니다.

재현 명령:

```powershell
npm run build
npm test
npx playwright test --config playwright.phase9-3-hotfix.config.ts
npx playwright test
npx playwright test --config playwright.phase9-2-ui.config.ts
npx playwright test --config playwright.phase9-3-ui.config.ts
npx playwright test --config playwright.pages.config.ts
npx playwright test --config playwright.phase9-2.config.ts
npx playwright test --config playwright.phase9-3.config.ts
node scripts/check-phase9-3-worker.mjs
```

## Galaxy 재확인 절차와 한계

1. 사용자가 GitHub Desktop으로 소스와 **전체 `docs/ed4/` 변경분**을 Commit/Push한다. 새 Worker 두 파일과 manifest를 빠뜨리지 않는다. Codex는 업로드하지 않았다.
2. 온라인 상태에서 실행기 탭/PWA를 모두 닫고 다시 열어 최신 앱/SW가 활성화되도록 한다. **게임 재등록·사이트 데이터 삭제·세이브 초기화는 하지 않는다.** 구 앱 JS 자체가 여전히 실행 중이면 구 진입 경로를 사용할 수 있으므로 앱 업데이트가 필요하다.
3. 기존 프로필/게임 폴더/RAW 그대로 임시 진단에서 Phase 9-3만 선택한다. CPU/사운드/메모리 등 다른 조건은 바꾸지 않는다.
4. 오류 또는 멈춤 후 진단 JSON을 내린다. `engine.artifact.worker.entry/common`이 위 해시 경로, `bootstrap=ready`, WASM 해시가 위 값인지 먼저 확인한다. 다음으로 기존 `engine.cpuHistory.history`와 reboot 이벤트를 확인한다.
5. 처음에는 온라인으로 업데이트와 실행을 확인한다. 새 파일을 한 번도 내려받지 않은 완전 오프라인 환경에서 파일을 만들어낼 수는 없다. 이때는 명확한 파일 로딩 오류로 중단한다. 최신 SW의 오프라인 캐시 준비가 끝난 뒤 오프라인 시험을 한다.
6. 진단 종료는 저장하지 않으며 다음 일반 실행의 기본 엔진은 안정 엔진이다.

이번 수정의 Galaxy 실기 결과 및 ED4 실행 성공은 **아직 미검증**이다. 공개 PC Chrome의 캐시·실행 시험을 Galaxy 성공으로 기록하지 않는다. 과거의 CPU 계측 로직과 모든 WASM, 기존 저장 구조는 유지했다. 코드가 확인한 사실보다 넓게 게임 원인을 추정하지 않는다.
