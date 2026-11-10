# Phase 9-8P — 공개/개발 실행기 독립 운영

작성: 2026-11-11. 작업 시작 HEAD `8285547`. 기존 O/후속/기본 배속 소스를 유지하고 빌드·저장 이름·업데이트 상태 키만 분리했다. Git Add/Commit/Push, 원격 접속·배포는 수행하지 않았다. 아래 URL은 **사용자가 배포한 뒤 사용할 경로**이며 이번 작업에서 온라인 배포 성공을 주장하지 않는다.

## 1. 빌드와 URL

|구분|명령|산출물|예정 URL|
|---|---|---|---|
|공개|`npm run build`|`docs/ed4/`|https://baptoria.github.io/porting-pj/ed4/|
|개발|`npm run build:developer`|`docs/ed4-dev/`|https://baptoria.github.io/porting-pj/ed4-dev/|

Vite base, JS/CSS, Source Worker, DOS Worker/WASM/AudioWorklet, manifest, SW, update 페이지는 각 하위 경로를 사용한다. 개발 빌드에는 기존 개발 기능을 컴파일하고 상단에 **개발 빌드 · 진단 전용**을 표시한다. 공개 런처 디자인과 개발 기능 호출 차단은 그대로다. 양쪽 모두 기존 일반 K 실행과 저장 가능한 1×/2×를 제공한다. 실험 실행의 쓰기 폐기 정책은 바꾸지 않았다.

각 산출물에는 라이선스와 해당 런처/GPL 엔진 대응 소스 ZIP을 포함한다. 개발 빌드는 공개 `docs/index.html`을 다시 만들지 않는다. 각 빌드는 자신의 출력 폴더만 정리한다. `src/build-info.json`과 `public/sources/ed4-mobile-source.zip`은 마지막 빌드의 준비 파일이지만, 각 출력 폴더에는 해당 빌드 시점의 독립 사본이 남는다. 검증기는 해당 폴더 manifest와 그 안의 소스 ZIP build ID를 비교한다.

명령은 순차 실행한다. 두 npm 빌드를 동시에 실행하는 방식은 공유 준비 파일 때문에 지원/검증하지 않았다. 순서를 바꾸어 연속 실행하는 경우는 형제 폴더의 모든 파일 SHA-256으로 검증한다.

## 2. 저장 격리

`src/app-storage.ts`의 빌드 시점 정책을 사용한다. URL 쿼리나 사용자가 저장한 설정으로 공개/개발 저장소를 바꾸지 않는다.

|대상|공개 — 기존 이름 유지|개발|
|---|---|---|
|게임 DB, schema 3|`ed4-mobile-v1`|`ed4-mobile-dev-v1`|
|음악 DB, schema 1|`ed4-music-v1`|`ed4-music-dev-v1`|
|OPFS 음악 루트|`ed4-music/`|`ed4-dev-music/`|
|Web Locks 쓰기 잠금|`ed4-mobile-writer`|`ed4-mobile-dev-writer`|
|localStorage|기존 키 그대로|기존 키 앞에 `ed4-dev:`|
|업데이트 확인 sessionStorage|`ed4-expected-build`|`ed4-dev:ed4-expected-build`|

게임 DB의 archives/profiles/saves/recovery/recoveryPolicies/catalog가 함께 분리되므로 게임 등록·모드·세이브·복구 메타데이터도 분리된다. 음악 DB의 packs와 OPFS 파일도 함께 분리된다. 선택 프로필, 엔진 선호, 화면/조작 설정, 고급 메뉴 상태, 등록 진단 상태 키를 모두 적용했다. 등록 Source Worker 역시 같은 music 모듈을 사용하여 개발 OPFS에 기록한다.

공개 이름·버전·기존 마이그레이션·tombstone·저장 트랜잭션은 변경하지 않았다. 개발에서 공개 DB/OPFS를 탐색하거나 복사하거나 대체 읽기하는 경로를 추가하지 않았다. 개발 최초 실행은 빈 목록이다. 처음 한 번 폴더를 별도 선택하면 이후 개발 실행에서 재사용한다. 두기 상위 폴더와 ISO 음악 자동 등록, 별도 RAW 연결은 기존 경로를 재사용한다.

개발 삭제는 기존 저장 공간 관리/음악/프로필 삭제 도구로 개발 자료만 처리한다. 앱 전체 origin 초기화 기능은 만들지 않았다. 공개 데이터를 자동 이전하지 않는다.

## 3. SW·캐시·업데이트

등록 scope는 각각 `/porting-pj/ed4/`, `/porting-pj/ed4-dev/`다. 기존 SW 템플릿의 scope 기반 캐시 접두어를 그대로 재사용한다.

```
ed4-shell-%2Fporting-pj%2Fed4%2F-<release hash>
ed4-shell-%2Fporting-pj%2Fed4-dev%2F-<release hash>
```

자기 접두어의 이전 셸 캐시만 정리하고 자기 경로의 클라이언트와 업데이트를 조율한다. SW 실행/활성화 정책 자체는 변경하지 않았다. manifest의 id/start_url/scope는 상대 `./`로 각각 해석되며 개발 PWA 이름만 구분했다. 업데이트 후 build ID 확인용 sessionStorage도 분리했다.

같은 브라우저 origin에서 공개 게임 실행 중 개발 업데이트, 반대 방향을 모두 시험한다. 형제 실행의 Worker/입력과 캐시가 유지되고 양쪽 오프라인 재접속에서 저장·RAW 읽기가 이어지는 것을 확인한다. manifest 전체 자산 해시, SW 해시, 버전 고정 Worker, 대응 소스를 각 출력별로 검사한다.

## 4. 변경 범위

- 저장 이름: 신규 `src/app-storage.ts`, `storage.ts`, `music.ts`, `main.ts`, `play-preference.ts`, `play-ui.ts`, `import-trace.ts`, `launcher-update.ts`.
- 개발 표시: `launcher-layout.ts` 및 기존 초기화의 배지 덮어쓰기 제거.
- 빌드: `vite.config.ts`, 신규 `scripts/build-target.mjs`, `build-id.mjs`, `sw.mjs`, `check-shell-release.mjs`, 기존 Phase별 Worker 검증 스크립트의 출력 경로.
- Git 산출물 규칙: `.gitignore`, `.gitattributes`에 개발 폴더도 공개 폴더와 같은 검증된 소스 ZIP 허용/바이트 보존 규칙.
- 검증: 신규 storageNames 단위 테스트, `playwright.dev-split.config.ts`, 동일 origin 두 릴리스 시험 서버, 격리 E2E, 빌드 전후 해시 도구. 기존 메뉴/LOAD 진단 E2E의 대상 URL만 개발 경로로 변경.

엔진 바이너리/공용 DOS Worker/AudioWorklet/CPU/오디오/배속 알고리즘, `save-state.ts` 의미, 프로필 모델, 저장 스키마, 원본 게임/ISO/RAW/세이브는 수정하지 않았다. 최초 메뉴 무음 원인 해결은 이번 작업에 포함하지 않는다.

## 5. 자동 검증

최종 실행 결과와 빌드 ID는 아래 최종 검증 절에 기록한다. 테스트는 격리된 Playwright 브라우저의 공개 DOS 프로그램 및 합성 ISO/RAW만 사용한다. 사용자 Galaxy 저장 공간이나 상용 게임 실행 시험이 아니다.

새 격리 시험은 공개 자료 생성 → 개발 빈 목록 → 개발 ISO 등록 → 양쪽 저장/재접속 → 서로 독립 업데이트 → 오프라인 저장 불러오기/RAW 읽기 → 개발 음악·세이브·프로필·게임 삭제 → 공개 전체 상태 불변을 검증한다. 공개 DB/음악 DB/OPFS 루트/선호 키를 개발 메인 코드가 접근하면 즉시 실패하도록 감시한다. RAW는 저장 바이트의 SHA-256, 저장/복구/프로필은 전체 상태를 비교한다. 두 쓰기 잠금도 동시에 관측한다.

기존 단위 테스트와 관련 공개 실행·K 저장/복구·등록·ISO·오디오·진단 E2E를 실행한다. 모든 과거 Phase 개발 E2E를 새 경로로 재작성하거나 엔진 성능 벤치마크를 반복하지는 않는다.

## 6. Galaxy 최소 확인 절차

1. 사용자가 두 산출물을 검토 후 직접 배포한다. 기존 공개 URL에서 기존 게임 목록과 세이브가 유지되는지 확인한다.
2. 개발 URL을 직접 연다. 상단 `개발 빌드 · 진단 전용` 및 별도 빌드 ID, 빈 게임 목록을 확인한다. 개발 페이지는 인터넷에 공개되는 페이지이며 인증된 비공개 서비스가 아니다.
3. 개발에서만 게임 폴더를 한 번 선택한다. 두기 ISO는 선택 폴더 범위 안에 포함해야 한다. 공개 등록을 삭제하거나 다시 할 필요가 없다.
4. 개발 일반 실행 1× → 2× → 1×를 확인하고 기존 게임 내부 저장/런처 종료 절차를 따른다. 개발 재접속에서 같은 프로필과 음악이 남는지 확인한다.
5. 메뉴 BGM 조사 시 기존 인게임 진단 패널에서 **최초 메뉴**와 **LOAD 직후** 두 시점만 기록하고 통합 JSON을 내려받는다. 실험 엔진은 기존 임시 실행 추적 메뉴에서 명시적으로 선택한다.
6. 공개 URL로 돌아가 기존 게임·저장·음악·조작 설정이 그대로인지 확인한다. 사이트 데이터 삭제나 공개 자료 재등록은 하지 않는다.

## 7. 한계

- 경로별 네임스페이스는 앱의 논리적 분리다. 같은 origin이므로 보안 격리/권한 경계는 아니다. 브라우저 할당량·지속 저장 권한·브라우저 자체 데이터 삭제는 origin 단위다. 개발 등록으로 여유 공간이 줄 수 있으며, 오류 시 기존 원자적 저장 정책을 유지한다.
- 두 환경에 게임/음악을 별도로 등록하면 기기 저장 공간을 각각 사용한다. 자동 복사·공유 OPFS·마이그레이션은 없다.
- 실제 Galaxy, 실제 ED4의 메뉴 음악, GitHub Pages 온라인 제공 상태는 이번 로컬 테스트로 확인하지 않았다.
- GPL 소스 ZIP은 기존 정책대로 오프라인 셸 캐시에서 제외된다. 엔진과 실행 자산은 캐시에 포함한다.
- 기존 삭제 UI는 게임 원본을 먼저 제거하면 프로필 편집에서 원본 파일을 읽을 수 없어 오류를 낼 수 있다. 격리 시험은 음악/세이브 → 프로필 → 게임 자료 순서로 삭제했다. 이 기존 관리 동작은 이번 범위에서 변경하지 않았다.

## 최종 검증 및 빌드 ID

|검증|실제 결과|
|---|---|
|TypeScript `tsc --noEmit`|통과|
|전체 단위 테스트 `npm test`|448 통과, 기존 조건부 1 건너뜀|
|공개/개발 격리 E2E `playwright.dev-split.config.ts`|1 통합 시나리오 통과. 최종 두 빌드로 재확인|
|개발 메뉴/LOAD 진단 `playwright.menu-audio.config.ts`|1 통과. 실제 K 이벤트·통합 JSON·다운로드 후 입력 유지|
|일반 K 저장/복구/오디오 `playwright.phase9-8o-followup.config.ts`|8 통과. 2× 저장, 재실행, tombstone, 복구, 저장 실패 보존, 9-7 교환, 초기 공개 합성 PCM|
|기본 실행 `playwright.default-speed.config.ts`|2 통과. 기존/신규 기본 K 및 명시적 호환 재시도|
|공개 UI/등록 `playwright.phase9-8m.config.ts`|13 통과. 5 화면 크기·개발 호출 차단·프로필/저장 보존|
|ISO 등록 `playwright.phase9-8n.config.ts`|5 통과, 실제 상용 배포본 opt-in 1 건너뜀. 합성 ISO·RAW·오프라인·취소·용량 실패 보존|
|빌드 순서 독립성|개발→공개, 공개→개발 각각 형제 산출물 **158개 전체 해시 불변**|
|최종 배포 무결성|각 폴더의 SW 대상 **143개 자산** 및 SW 해시, 대응 소스, Worker 검증 모두 통과|
|기존 엔진 보존|배포 Native/Worker/Worklet **113개**가 HEAD 및 양쪽 폴더에서 동일 해시. 원본 보호 대상 35파일도 코드 변경 없음(기존 `engine.ts` 체크아웃 줄바꿈 차이 제외)|
|상용 자료/대형 파일|새 게임/ISO/RAW/세이브를 추가하지 않음. 배포 검사 금지 확장자 0, 100MiB 초과 0, Git 필터에 의한 배포 바이트 변경 0|
|Git|diff 공백 검사 통과. Stage 목록 비어 있음. Add/Commit/Push/원격 배포 없음|

관련 Chrome 결과는 **30 통과, 상용 자료 opt-in 1 건너뜀**이다. 같은 테스트의 재실행을 중복 합산하지 않았다. 공개 합성 프로그램 결과이며 Galaxy ED4 실기 성공을 새로 판정하지 않는다.

최종 공개 빌드:

```
9-8p-public-20261110190925475-eaea0c86
revision: phase9-8p-isolated-builds-1
entry: assets/main-gaz2pQDu.js
SW SHA-256: 7ad8ea2dbe5b910fbf73ee27fe8a377d965ce072bd3f7d0541c19f65c82bcd90
```

최종 개발 빌드:

```
9-8p-dev-20261110190943522-70ff3973
revision: phase9-8p-isolated-builds-1
entry: assets/main-92MUOjTf.js
SW SHA-256: a04c993f5612ab148db68082568d1a44416845f0901de9b2348196a9bb005d25
```

두 manifest의 commit은 `8285547d3985`, dirty는 true다. ID의 시각은 UTC이며 한국 시간으로 2026-11-11 빌드다. 공개/개발 각각 약55MiB인 158파일을 로컬에 준비했다.

증거는 `artifacts/phase9-8p/`의 unit-final.log, browser-results.json, preservation.json, 빌드/회귀 로그와 빌드 전후 전체 해시 JSON에 남겼다. 최종 release 검사 결과는 `artifacts/phase9-8e/local-release-public.json`, `local-release-developer.json`이다. 개발/공개 844×390 Chrome 화면은 `artifacts/phase9-8p/browser/isolation-same-origin-buil-543eb-cks-updates-and-offline-use/developer.png`, `public.png`에 저장하고 검토했다. 배지와 기존 화면 구성을 유지했으며 모바일 실물 검증을 대신하지 않는다.
