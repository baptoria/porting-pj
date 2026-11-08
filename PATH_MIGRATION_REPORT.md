# Pages 경로 이전 보고서

2026-11-09 / 앱 0.3.0 / 기존 프로젝트 `D:\porting\ed4-mobile`.

## 배포 구조

| 용도 | 저장소 파일 | URL 경로 |
|---|---|---|
| Pages 안내 페이지 | `docs/index.html` | `/porting-pj/` |
| 영웅전설4 실행기 | `docs/ed4/index.html` | `/porting-pj/ed4/` |
| Jekyll 비활성화 | `docs/.nojekyll` | `/porting-pj/.nojekyll` |
| ED4 서비스 워커 | `docs/ed4/sw.js` | `/porting-pj/ed4/sw.js` |
| 이전 루트 워커 종료 | `docs/sw.js` | `/porting-pj/sw.js` |

Vite base는 `/porting-pj/ed4/`, outDir는 `docs/ed4`다. 빌드는 ED4 출력 폴더만 비운 뒤 새 파일을 생성하고, 루트 안내 페이지·.nojekyll·이전 워커 종료 스크립트를 생성한다. 향후 다른 게임 폴더를 지우는 전체 docs 초기화는 하지 않는다. 현재 안내 페이지에는 ED4 링크만 있다.

## 기존 코드와 Git 보존

작업 시작 시 Git 작업 트리는 깨끗했고 HEAD는 `705d13f80d4d778d82c9e644d696603fec1d6a36`이었다. 기존 저장소, 커밋 이력, origin 설정을 유지한다. 재초기화·원격 연결·원격 저장소 생성·스테이징·커밋·Push는 수행하지 않았다. 이전 배포 폴더는 `artifacts/path-migration/docs-before/`에 보존했다.

`src/` 전체, `public/dos-worker.js`, DB 스키마, 저장 형식, 게임 실행 기능, 단위 테스트 본문은 변경하지 않았다. 기존 17개 E2E의 URL만 새 경로로 변경했다. manifest의 `./` 기반 id/start_url/scope와 아이콘 경로, DOS Worker의 상대 vendor 로딩은 새 위치에서 해석되므로 원본을 변경할 필요가 없었다.

## 변경 파일

- `vite.config.ts`: base/outDir, 배포용 합성 RAW 제외 대상 경로 변경.
- `scripts/sw.mjs`: ED4 폴더만 프리캐시하고 새 루트 생성 스크립트 호출.
- `scripts/pages-root.mjs` (신규): 한국어 안내 HTML 및 이전 루트 서비스 워커 종료 스크립트의 소스.
- `scripts/serve-pages.mjs`, `package.json`: docs 전체를 `/porting-pj/`에 제공하는 로컬 preview, 디렉터리 trailing slash 리다이렉트.
- `scripts/package-manual.mjs`, `scripts/package-release.mjs`, `scripts/check-desktop.mjs`: ED4 하위 경로, 루트 허용 파일, GPL/데이터 검사 및 Git에서 이동·삭제된 파일 처리.
- `.gitignore`: 허용하는 공개 DOS/대응 소스 ZIP 경로를 docs/ed4로 이동.
- `playwright.config.ts`, `tests/e2e/{launcher,memory,phase2,phase3}.spec.ts`: 접속 경로 변경.
- `tests/pages/deployment.spec.ts`: 전체 정적 파일, 중첩 경로·캐시 범위·루트 안내·데이터 보존 검사.
- `README.md`, `GITHUB_DESKTOP_GUIDE.md`, `THIRD_PARTY_NOTICES.md`: 현재 경로/사용자 Push 절차 안내. 이전 `DEPLOY_CHECK_REPORT.md`, `MANUAL_DEPLOY_GUIDE.md`에는 최신 보고서를 가리키는 이력 안내 추가.
- `PATH_MIGRATION_REPORT.md` (신규): 본 보고서.
- `docs/index.html`, `docs/sw.js`: 안내 페이지와 이전 루트 워커 종료용으로 변경.
- `docs/ed4/**` (신규): 앱 25개 배포 파일. 기존 docs 루트의 앱 전용 파일 22개는 이동에 따라 삭제 상태가 되며, 원본은 보존본과 기존 커밋에 남아 있다. GitHub Desktop에서 삭제와 새 파일을 함께 커밋해야 한다.

## 경로 및 PWA

ED4 manifest의 id/start_url/scope는 `/porting-pj/ed4/`, 서비스 워커 scope도 동일하다. JS/CSS, DOS·ZIP·런타임·폴더 Worker, WASM 및 아이콘은 해당 경로에서 요청한다. 셸 캐시 22개 URL은 ED4 경로 안에 한정되고 GPL 소스 ZIP 2개는 온라인 제공한다. 루트 안내 페이지는 PWA 설치나 오프라인 캐시를 등록하지 않는다. 오프라인 실행 및 홈 화면 추가는 ED4 주소에서 진행한다.

기존 루트 URL에 서비스 워커가 등록되었다면 `/porting-pj/sw.js`의 종료용 스크립트로 업데이트할 수 있다. 이 스크립트는 자기 루트 scope의 `ed4-shell-...` 캐시만 정리한 뒤 등록을 해제한다. 하위 ED4 워커/캐시, 다른 프로젝트 캐시, IndexedDB, OPFS는 건드리지 않고 실행 중 페이지를 강제로 이동시키지 않는다. 브라우저의 워커 업데이트 확인 시점에 따라 온라인 상태에서 탭을 닫고 다시 열어야 이전 화면이 사라질 수 있다. 새 주소로 직접 접속하여 준비 완료를 확인한다.

같은 origin에서 경로만 바뀌면 기존 IndexedDB/OPFS를 그대로 사용한다. 이번 변경은 DB 이름이나 스키마를 바꾸지 않는다. 다른 origin(예: localhost에서 실제 Pages 도메인으로 이동)으로는 자동 이전되지 않으므로 세이브 백업/복원을 이용한다. 기존 설치 PWA의 시작 주소는 자동으로 바뀐다고 가정하지 말고 새 ED4 주소에서 다시 홈 화면에 추가한다. 브라우저 사이트 데이터 전체 삭제는 하지 않는다.

## 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript 및 production build | 통과 |
| 기존 단위 테스트 | 76/76 통과 |
| 기존 Chrome E2E | 17/17 통과 (약 1.3분) |
| 새 경로 Pages 통합 테스트 | 2/2 통과 |
| 배포 허용 목록·엔진/대응 소스 해시 | 통과 |
| 100 MiB 초과 파일 | 0개 |

검증 주소는 로컬 `http://localhost:4173/porting-pj/ed4/`이며 GitHub 원격 HTTPS 배포를 검증한 결과가 아니다. 공개 CC0 DOS 프로그램으로 실제 Worker/WASM 실행, 방향키, 오디오 활성화, 저장/종료/재실행, IndexedDB·OPFS, 오프라인 저장 복원을 검증한다. 기존 테스트에는 모드 저장 격리, tombstone, 백업, 모바일 화면·멀티터치와 500 MiB 합성 자료 처리도 포함된다.

추가 Pages 검사는 docs 전체 28개 파일의 응답 200·로컬 파일 SHA-256 일치, WASM/JS MIME, manifest 경로, 이전/잘못된 자산 경로 404, 루트 안내 링크 및 디렉터리 리다이렉트를 검사한다. 루트 워커 종료 검사에서는 하위 캐시·등록과 별도 IndexedDB/OPFS 표식이 보존되는지 확인한다. 실제 사용자 기기의 기존 설치 업그레이드는 별도 확인이 필요하다.

## 배포 데이터 및 라이선스

배포 28개 파일은 루트 3개와 ED4 25개다. 상용 게임 원본, RAW 음악(합성 RAW 샘플 ZIP 포함), 실제 세이브, 개인 파일은 포함하지 않는다. 공개 DOS 테스트는 직접 생성한 CC0 프로그램이며 COM 해시를 생성 소스와 대조한다. 테스트 중 합성 RAW/세이브는 테스트 결과 폴더 및 임시 브라우저 저장소에만 생성된다.

GPL 대응 소스와 GPL/MIT/ISC 고지는 `docs/ed4/sources/`, `docs/ed4/licenses/`에 포함하고, 수정된 배포 스크립트·Worker·설정·테스트·문서도 런처 소스 ZIP에 담는다. upstream 소스와 엔진 바이너리 해시는 기존 고정 버전과 일치한다. 가장 큰 파일은 upstream 소스 ZIP 2,674,342 bytes (약 2.55 MiB)로 100 MiB 이하다. 배포 외 의존성·임시 파일·게임 형식은 기존 ignore 규칙을 유지한다.

## 사용자 Commit / Push 및 미검증 항목

GitHub Desktop의 기존 프로젝트에서 소스 변경, docs 루트 앱 파일 삭제, docs/ed4 새 파일을 함께 검토하여 사용자가 Commit 후 Push origin 한다. Pages는 기존처럼 **main /docs**를 유지한다. 새 저장소나 원격 재연결은 필요 없다.

GitHub Pages에 실제 게시된 루트에서 ED4 링크를 열고, 최종 주소의 경로가 `/porting-pj/ed4/`인지 확인한다. 이번 작업은 실제 URL 생성·접속 검증·업로드를 하지 않았다. Galaxy 실기, 실제 ED4 한글·전투·게임 저장·BGM 호환성도 미검증이다. 게임 자료는 사용자의 브라우저 안에서만 등록한다.

검증 원자료: `artifacts/path-migration/preservation-check.json`, `e2e-last-run.json`, `pages-last-run.json`, `pages-check.json`, `pages-dos.png`, `file-audit.json`, `git-file-audit.json`, `changed-files.txt`. 이 폴더는 Git에서 제외된다.

