# GitHub Desktop / docs 배포 검사 보고서

2026-11-08 / Phase 3 앱 0.3.0 / 프로젝트 `D:\porting\ed4-mobile`.

## 준비 결과

- Vite base `/ed4-mobile/`, production 출력 `docs/`.
- `docs/index.html`, 빈 `.nojekyll`, WASM/Worker, manifest, 서비스 워커, 아이콘, 공개 DOS 테스트, 라이선스 및 대응 소스: 총 25개 파일.
- `GITHUB_DESKTOP_GUIDE.md`: 사용자 직접 Add local repository → Commit → Publish → Pages `main /docs` 안내.
- `.gitignore`: 의존성, 임시·테스트 결과, 이전 dist/ZIP, 게임·RAW·세이브, 개인/인증 파일 제외. `docs/` 및 필요한 대응 소스 ZIP은 Git 후보에 포함.
- `npm.cmd run check:desktop`: 배포 허용 목록·바이너리/소스 해시·Git 후보·100 MiB·제외 규칙을 재검사하는 명령.

GitHub 계정 인증, 원격 연결, 저장소 생성, 업로드, 커밋, Push는 수행하지 않았다. 기존 로컬 Git 저장소가 없음을 확인한 후 해당 프로젝트 폴더에서만 `git init -b main`을 실행했다. 스테이징 0개, 커밋 0개, 원격 설정 0개다. GitHub Desktop에 추가한 뒤 첫 커밋과 Publish는 사용자가 수행한다. **실제 HTTPS 배포 URL은 없으며 공개 배포 성공으로 간주하지 않는다.**

## 보존 및 변경 범위

앱 `src/`, DOS 어댑터, DB 스키마, 저장 형식, 기존 76개 단위 테스트와 17개 E2E 본문은 그대로 유지했다. 런타임 바이너리는 pinned npm 패키지와 해시가 일치한다. 변경 사항은 빌드 출력, 하위 경로 서버/배포 테스트의 파일 입력 폴더, 패키징·검사 스크립트, 제외 규칙과 안내 문서다.

이전 `dist/`, `ed4-mobile-deploy.zip`, Phase 1/2/3 아카이브를 보존했다. 변경 직전 소스 ZIP과 이전 검사 보고서는 `artifacts/desktop-deploy/source-before-docs.zip`, `previous-deploy-report.md`에 보관했다. 보존 해시 비교 `preservation-check.json`에서는 `src/`와 기존 단위/E2E 파일이 동일하며, 추가 Pages 테스트의 대상 폴더만 dist에서 docs로 바뀌었다. 보존 자료와 테스트 데이터는 Git에서 제외한다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| TypeScript `tsc --noEmit` 및 production build | 통과 |
| 기존 단위 테스트 | 76/76 통과 |
| 기존 Chrome E2E | 17/17 통과 (약 1.5분, 500 MiB 합성 폴더 포함) |
| 추가 Pages 통합 테스트 | 1/1 통과 |
| docs 배포 허용 목록 및 라이선스/소스 해시 | 통과, 25개 |
| Git 후보 파일·100 MiB·ignore 검사 | 통과 |

자동 테스트는 설치된 Windows Chrome headless와 로컬 `http://localhost:4173/ed4-mobile/`에서 수행한다. 서버는 `docs/`만 제공하며 루트 `/`, 잘못된 `/vendor/...`, `/sw.js`, 존재하지 않는 WASM은 404로 처리한다. 잘못된 자산 요청에 HTML을 대신 반환하지 않는다.

Pages 통합 테스트는 모든 배포 파일의 HTTP 200 및 디스크 SHA-256 일치, WASM magic/MIME, JS MIME, manifest의 id/start_url/scope·아이콘, 서비스 워커 경로 및 scope를 검사한다. 공개 DOS 실행·방향키·AudioContext running·IndexedDB 저장·OPFS 읽기·오프라인 새로고침과 세이브 복원도 검사한다. 입력 RAW는 테스트 중 생성한 12바이트 합성 자료이며 배포에는 들어가지 않는다.

캐시는 `/ed4-mobile/` 안의 셸 파일 22개다. 대응 소스 ZIP 2개는 온라인 제공하며 프리캐시하지 않는다. 같은 scope의 구버전 캐시만 정리하고 다른 프로젝트의 캐시는 유지한다. DB/OPFS를 삭제하거나 마이그레이션하는 변경은 없다.

검증 원자료는 `artifacts/desktop-deploy/e2e-last-run.json`, `pages-last-run.json`, `pages-check.json`, `pages-dos.png`에 보존했다.

## 파일 크기 및 공개 데이터 검사

일반 Git 저장소의 **파일당 100 MiB = 104,857,600 bytes**를 기준으로 추적 파일 및 ignore되지 않은 모든 미추적 파일을 검사했다. 최초 커밋 전이므로 기존 이력/추적 파일은 없다. 후보 106개와 docs 25개에서 **초과 파일 0개**, 50 MiB 초과도 없다. 가장 큰 파일은 `docs/sources/emulators-0.73.8-source.zip`과 동일한 `public/sources/emulators-0.73.8-source.zip`이며 각각 **2,674,342 bytes (2.550451 MiB)**다. 임의 분할·삭제나 LFS 전환은 하지 않았다. [GitHub 공식 크기 제한](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)

`docs/` 전체를 허용 목록과 대조했다. 유일한 DOS 프로그램은 직접 생성한 CC0 테스트이며 생성 코드와 COM 해시가 일치한다. 상용 게임 원본, RAW 음악(합성 RAW ZIP 포함), 실제 세이브, 개인 파일은 배포 및 Git 후보에 포함되지 않는다. upstream 소스 ZIP 내부도 게임 바이너리/번들 형식을 검사했다. API 키와 개인 홈 경로 패턴 일치는 없었다. 패턴 검사는 모든 종류의 비밀을 찾아내는 보증은 아니며 사용자가 이후 임의 이름의 파일을 추가하면 다시 검토해야 한다.

Git 후보 파일별 byte/SHA-256: `artifacts/desktop-deploy/git-file-audit.json`. docs 파일별 byte/SHA-256 및 검사: `artifacts/desktop-deploy/file-audit.json`. 디스크에 남아 있는 제외된 테스트 대용량 자료·보존 아카이브는 공개 후보가 아니다.

## GPL 대응 소스

`docs/licenses/NOTICE.html`, GPL/MIT/ISC 전문 및 `docs/sources/emulators-0.73.8-source.zip`, `docs/sources/ed4-mobile-source.zip`을 포함했다. Git 후보에도 루트 LICENSE/THIRD_PARTY_NOTICES, 앱·Worker·빌드·테스트 소스, lockfile, pinned upstream 소스가 유지된다. 앱 소스 ZIP에는 이번 빌드/검사 스크립트와 문서도 포함한다. 라이선스 페이지에서 두 소스 ZIP을 내려받을 수 있다.

에뮬레이터 소스 SHA-256: `884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840`. 엔진은 0.73.8 그대로이며 upstream 소스 재컴파일은 수행하지 않았다. 기존 고지의 빌드 방법과 원저작권 표시를 유지했다.

## 미검증 및 사용자 후속 작업

사용자가 GitHub Desktop으로 커밋·Publish하고 Pages를 `main /docs`로 설정해야 한다. GitHub가 실제로 표시하는 URL에서 HTTPS, 응답 MIME, Worker/WASM, 오프라인과 PWA를 다시 확인해야 한다. localhost 검증은 실제 GitHub 서버 검증이 아니다.

Galaxy 실기, Android 설치/방향 잠금/멀티터치·회전, 실제 ED4 시작 화면·한글·전투·내부 저장·모드·RAW BGM은 미검증이다. 실제 게임 파일 확보 후 사용자 기기에서 확인한다. 새로운 엔진 연구나 게임 기능 추가는 하지 않았다.

localhost 데이터는 HTTPS origin으로 자동 이동하지 않는다. 기존 세이브는 백업 후 새 주소에서 복원한다. 같은 계정의 Pages 프로젝트들은 origin을 공유할 수 있어 URL 경로별로 IndexedDB/OPFS가 분리된다고 가정하면 안 된다. 첫 온라인 셸 캐시 완료 후 오프라인 실행을 확인한다.

