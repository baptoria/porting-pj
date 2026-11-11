# Phase 9-8R-HF2 — 안전한 자동 업데이트

작업일: 2026-11-11 (한국). 기준 HEAD: `d677cbfb6e2ece710caee8c5d1df9bcc892d9234`.
기존 HF1 작업은 사용자가 커밋한 상태였으며 이번 변경은 모두 미커밋이다. Git Add/Commit/Push, 병합, 원격 배포는 수행하지 않았다.

## 1. 기존 수동 적용의 정확한 이유

`launcher-update.ts`는 접속 시 온라인 manifest/SW를 확인하고 새 SW를 설치했지만, `consent=true`와 `applying=true`는 `#update-apply` 클릭에서만 설정했다. `ED4_UPDATE_LOCK` 응답도 consent를 요구했다. 따라서 검증된 waiting worker가 있어도 사용자가 버튼을 누르지 않으면 활성화를 요청하지 않았다.

이 검증·잠금 구조를 재사용했다. 게임 엔진을 종료하거나 브라우저 데이터를 지워 업데이트하는 방식은 사용하지 않는다.

## 2. 자동 적용 흐름

1. 접속 시 온라인이면 nonce + `cache:'no-store'`로 manifest와 SW를 조회한다. 요청당20초 제한, 동시에 진행 중인 검사는 공유한다.
2. manifest 형식·상대 경로·중복 항목·해시·공개/개발 audience를 검증한다. 온라인 SW SHA-256이 manifest와 다르면 설치/적용을 진행하지 않는다.
3. 정확한 앱 scope에 등록된 SW를 확인한다. 기존 다른 상위 scope 등록을 해당 앱 등록으로 오인하지 않는다. `main.ts`의 중복 register는 제거하고 같은 업데이트 관리자의 검증 경로를 사용한다.
4. SW install은 기존처럼 필수 자산 전부를 순차 다운로드하여 길이와 SHA-256을 확인한다. 전체 성공 후에만 완료 manifest를 캐시에 기록한다. 일부 파일이 다른 배포본이면 install이 실패한다.
5. 검증된 waiting worker와 온라인 배포의 빌드 ID/SW 해시가 일치하고 앱이 유휴 상태이면 자동 `ED4_APPLY` 요청을 보낸다. 버튼 동의는 필요하지 않다.
6. SW가 현재 scope의 창이 정확히 하나인지 검사하고 그 창에 요청별 `ED4_UPDATE_LOCK`을 보낸다. 창은 선택한 waiting worker 객체·빌드 ID·요청 ID·현재 유휴 상태가 모두 맞을 때만 응답한다.
7. SW는 잠금 응답 후 창 목록을 다시 검사한다. `skipWaiting()` 요청 완료 후 accepted ACK를 반환한다. 이 응답은 활성화 완료와 구분한다.
8. 프런트엔드는 실제 controller의 빌드 ID·검증 상태·SW 해시까지 확인한 다음 한 번만 경로 루트로 갱신한다. 새 페이지에서 **실행된 BUILD.id**를 기대 ID 및 활성 SW·최신 manifest와 대조한다.

기존 `update.html`, 수동 확인/적용 버튼은 고급 관리 메뉴에 남긴다. 일상적인 HF2 이후 업데이트는 이 메뉴를 열 필요가 없다. 최신 상태에는 불필요한 안내를 표시하지 않고, 기존 작은 업데이트 상태 영역에 진행·완료·보류·실패를 표시한다.

## 3. 작업 중 전환 금지

유휴 조건은 `engine`, `running`, 공용 `busy`, `checkpointPromise`, 열린 dialog 모두 없음이다. 따라서 아래를 보류한다.

- DOS 실행·일시 정지·시작 준비·종료 대기
- 체크포인트·저장 확정·복구 작업
- 폴더/ISO 등록·정리·프로필 삭제
- 등록 선택창이나 복구/삭제 확인창이 열린 상태

자동 적용 직전에 동기적으로 적용 잠금을 잡는다. 그 이후 `task()`와 `recoveryAction()`이 새 작업을 거절한다. 기존 `startGame()`의 버전 혼합/업데이트 잠금 검사도 유지한다. 게임 중 강제 종료·Worker 교체·새로고침은 없다.

기존 저장 후 종료 절차를 바꾸지 않았다. 저장 성공, `engine.stop()` 완료, 실행 상태 해제, 공용 작업 종료 뒤에 유휴 전환을 관측한다. waiting worker가 있으면 최신 배포를 다시 검사한다. 저장 실패·종료 취소는 engine이 계속 존재하므로 자동 적용하지 않는다. 다른 탭에서 다운로드한 waiting worker도 종료 시 새로 검증한다.

## 4. 검사 주기·다중 탭·경합

- 접속: 즉시 검사.
- 온라인 복귀: 즉시 재검사.
- focus/visibility 재진입: 마지막 검사로부터60초 미만이면 중복 요청하지 않음.
- 보이는 유휴 페이지:5분마다 검사. 대기 SW와 온라인 정보가 다른 경우60초 이후 재검사.
- 검증된 waiting worker 적용이 다른 탭 때문에 거절되면15초 간격으로 활성화만 재시도. 매번 다시 설치하지 않는다.
- 게임 종료/열린 작업창 닫힘: 필요할 때 즉시 배포 재검증 후 적용.

다른 탭이 실행 중이거나 유휴 상태여도 같은 scope에 창이 둘이면 보수적으로 보류한다. 다른 창을 강제로 닫지 않는다. 공개와 개발 scope는 서로 다른 실행기이므로 공개 업데이트가 실행 중인 개발 탭을 기다리거나 바꾸지 않는다.

요청 ID와 MessageChannel 응답을 연결하여 오래된 ACK로 성공 처리하지 않는다. 무한 새로고침 방지를 위해 앱별 sessionStorage에 기대 빌드와 이번 전환의 갱신 여부만 기록한다. 새 프런트엔드가 기대 ID와 다르면 자동 반복을 막고 수동 복구를 안내한다. 저장한 게임 설정 키나 IDB 스키마를 변경하지 않는다.

초기 브라우저 시험에서 실제로 발견해 수정한 경합:

1. 활성화 요청보다 accepted ACK가 먼저 전달될 때 전환 대기가 멈췄다. 요청 완료 후 ACK 순서로 바꾼 후보에서 같은 시험을 통과했다. 활성화 요청/실제 controller 교체/새 프런트엔드 실행은 계속 별도로 검증한다.
2. 다른 탭에서 설치된 waiting SW는 첫 탭의 최신 manifest 정보와 달라 적용이 보류됐다. 작업 종료 시 재검증을 추가했다.
3. 설치 실패가 비동기적으로 전달되는 사이 동일 검사에서 다시 update를 요청할 수 있었다. 설치 세대 번호와 실패 상태로 중복 설치를 막는다.
4. 설치 완료와 버전 조회가 겹치면 오래된 worker 조회 결과로 끝나지 않도록 조회를 순서대로 다시 수행한다.

Service Worker의 활성화에는 pending event와 대기/활성 상태가 관여한다. 단순한 `skipWaiting()` 호출만 성공 판정으로 쓰지 않은 근거는 [W3C Service Workers의 활성화 절차](https://www.w3.org/TR/service-workers/#activation-algorithm)와 [MDN skipWaiting 설명](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)이다. 위 로컬 경합의 내부 브라우저 원인을 사양만으로 확정한 것은 아니다.

## 5. 실패·오프라인·캐시 보존

manifest/SW 불일치, 필수 파일 해시 불일치, 다운로드 중 단절 시 기존 활성 캐시는 유지된다. install 실패가 지우는 것은 해당 후보의 캐시뿐이다. activate 정리도 기존 `ed4-shell-<정확한 scope>-` 접두어에 한정한다. 다른 앱 캐시·반대 빌드 캐시·IndexedDB·OPFS·localStorage 게임 설정에는 접근하지 않는다.

오프라인에서는 새 업데이트를 시작하지 않고 기존 검증된 캐시로 실행한다. 온라인 복귀 후 검사를 재개한다. 적용이 확실히 거절됐으면 앱 잠금을 해제하고 현재 버전을 계속 사용한다. 반대로 활성화가 진행됐는지 불확실한 경우에는 구버전 코드로 새 게임을 시작하지 못하게 보호하고 수동 업데이트 경로를 안내한다.

동일 배포 ID인데 CDN 자산이 섞인 상태도 install 검증에서 차단한다. waiting worker는 설치 성공 정보와 최신 온라인 manifest/SW 해시가 일치해야 적용한다. 사용자에게 사이트 전체 데이터 삭제·게임 재등록·캐시 전체 초기화를 요구하지 않는다.

## 6. HF1에서 최초 전환

HF1에 없는 자동 적용 코드를 이미 실행 중인 HF1 페이지에 소급할 수는 없다.

- 확실한 최초 절차: 게임을 정상 종료하고 다른 **같은 주소**의 창을 닫은 뒤, 기존 고급 관리의 `새 버전 확인 → 업데이트 적용`을 한 번 사용한다. byte-exact HF1 → HF2 시험으로 검증한다.
- 기존 HF1이 새 SW를 설치한 뒤 해당 scope의 모든 창이 닫히면 브라우저의 정상 SW 수명주기에 따라 다음 방문부터 새 코드가 사용될 수도 있다. 다운로드/활성화 여부를 확인하지 않고 모든 사용자에게 자동 전환이 보장된다고 말하지 않는다.
- HF2 진입 후에는 이후 HF2 호환 빌드 간 검증·유휴 적용·갱신이 자동이다.
- `update.html`은 수동 복구용이며, 현재 SW가 제공하는 코드 버전에 따라 최초에는 기존 버튼 절차가 남을 수 있다.

새 SW는 HF1의 토큰 없는 기존 수동 잠금 요청도 같은 단일 창·유휴 응답 검증 하에서 받는다. HF2 요청에는 새 요청 ID 일치를 요구한다.

## 7. 검증 결과

최종 실행 로그와 검토 자료는 `artifacts/phase9-8r-hf2/`에 보관한다. 자동 시험은 실제 Chrome Service Worker/CacheStorage/IndexedDB/OPFS와 공개 CC0 DOS 프로그램을 사용한다. 업데이트 A/B는 로컬 테스트 서버가 검증용 이전/현재 manifest와 자산을 제공하며 원격 Pages를 변경하지 않는다. 첫 전환 시험은 합성 이전 버전뿐 아니라 작업 전 HF1 공개 산출물의 실제 바이트를 사용한다.

단위 테스트는 43개 파일 **509/509 통과**했다. 실제 로컬 두기 폴더·ISO를 읽기 전용 구조 검사 대상으로 지정했으며 게임 실행 성공으로 해석하지 않는다.

신규 자동 업데이트 Chrome 시험 **13/13 통과**:

| 시험 | 확인 결과 |
|---|---|
| 기존 캐시 → 새 버전 | 확인/적용 버튼 없이 전환, 최초 진입 포함 navigation 2회(자동 갱신 1회) |
| 게임 중 새 버전 설치 | 실행 지속, 입력·K 2× ACK 유지, 자동 갱신 없음 |
| 저장 실패 / 정상 저장 종료 | 실패 시 실행 유지·보류, 성공 후 엔진 종료를 확인하고 자동 갱신 |
| 등록 dialog / 적용 중 새 작업 | 선택창이 열려 있으면 보류, 적용 잠금 후 새 등록 진입 차단 |
| 오래된 ACK | 요청 ID 불일치 응답으로 갱신하지 않음 |
| 다중 탭 | 실행 중인 다른 창을 보호, 창 정리·정상 종료 후 자동 적용 |
| 자산/SW 각각 손상 | 기존 캐시·데이터 보존, 정상 온라인 배포로 재시도 |
| 자산 다운로드 중 단절 | 기존 오프라인 실행 가능, 온라인 복귀 후 적용 |
| 실제 HF1 산출물 | 한 번의 기존 수동 적용으로 HF2 전환·실제 빌드 재검증 |
| 공개 업데이트 + 개발 실행 | 개발 엔진·입력·데이터·캐시 유지 |
| 잘못된 기대 빌드 기록 | 자동 갱신 루프 차단, 수동 복구 가능 |
| 일회성 세이브 소비 후 종료 취소 | 실행·대기 업데이트 유지, 나중에 명시적으로 종료하면 적용 |
| focus/visibility 연속 이벤트 | 60초 제한 내 manifest 중복 조회 없음 |

기존 HF1 배속 복구 Chrome 시험 **11/11 통과**했다. PC·모바일 크기의 단발 공백, 반복 장애, 같은 세션 재시도, native/Worklet 응답 불일치, 일시 정지·종료 경합 보호를 그대로 검증했다. 실제 PCM을 변경하지 않는 합성 관측값 주입을 사용하며 Galaxy 결과는 아니다.

기존 저장·복구·오디오 Chrome 회귀 **8/8 통과**: 일회성 저장 소비/복구, 저장 실패 시 유지와 내보내기, K 2× 저장·삭제·백업 복원·9-7 교환, 주기 체크포인트, 누락된 native snapshot 거절, 두 일반 엔진의 공개 합성음 초기 출력/반복 출력.

공개/개발 격리 Chrome 회귀 **1/1 통과**: catalog·RAW·save·설정·쓰기 잠금 분리, 양방향 자동 업데이트 중 반대 엔진 계속 실행, 독립 오프라인 실행, 개발 데이터 삭제 뒤 공개 데이터 보존.

합계 **Chrome 33/33 통과**. 기존 모든 역사적 E2E 전체를 재실행한 것은 아니며, 변경 영향이 있는 업데이트·배속·저장·격리 회귀를 실행했다. 명령과 로그는 다음과 같다.

```text
npm test                                                   unit-final.log (509)
npx playwright test --config playwright.auto-update.config.ts        browser-final.log (13)
ED4_TEST_PUBLIC=1 + playwright.speed-recovery.config.ts recovery.spec.ts  speed-regression.log (11)
npx playwright test --config playwright.phase9-8o-followup.config.ts   save-regression.log (8)
npx playwright test --config playwright.dev-split.config.ts           isolation.log (1)
```

단위 검사 환경에는 `ED4_Q_LOCAL_FOLDER`, `ED4_LOCAL_ISO`를 지정했다. 앱 코드에 로컬 게임 경로를 추가하지 않았다. 브라우저 산출물의 `running-update.png`, `idle-update.json`, `recovery.json`, `isolation.json`으로 실제 자동 갱신·입력 유지·격리를 재검토할 수 있다. 단위 테스트의 기존 조건을 삭제하거나 저장 assertions를 완화하지 않았다.

## 8. 변경 파일

- `src/launcher-update.ts`: 자동 검사·유휴 적용·재시도·요청/버전 검증·한 번 갱신·수동 복구.
- `src/main.ts`: 작업 시작의 적용 잠금, 작업 중 판정, 중복 SW 등록 제거. 저장 알고리즘과 배속 코드는 그대로.
- `scripts/shell-worker.js`: 검증된 SW 정보에 해시 제공, 요청 ID/창 재검사, 활성화 요청/ACK 순서 및 최소 전환 단계.
- `scripts/build-id.mjs`, `src/build-info.json`: HF2 식별자.
- `scripts/serve-auto-update-test.mjs`, `playwright.auto-update.config.ts`, `tests/auto-update/update.spec.ts`: 로컬 A/B·손상·단절 서버와 실제 브라우저 시험.
- `tests/auto-update-worker.test.ts`: 잘못된 토큰/창/동의/검증 상태 거절 및 정확한 캐시 정리 범위.
- `tests/dev-split/isolation.spec.ts`: 기존 데이터 격리 assertion은 유지하고 수동 적용 단계만 자동 갱신 기대값으로 전환.
- `docs/ed4/`, `docs/ed4-dev/`: 각각 로컬 공개/개발 후보와 라이선스·GPL 대응 소스.

상세 소스 diff는 `artifacts/phase9-8r-hf2/source.diff`. Git index는 비어 있는 상태로 유지한다.

## 9. Galaxy 추가 확인과 한계

1. 사용자가 원격 배포를 수행한 뒤 HF1에서 위 최초 전환을 완료하고 HF2 빌드 ID를 확인한다. 사이트 데이터는 삭제하지 않는다.
2. 이후 새 후보가 배포되었을 때 게임을 실행하지 않은 상태로 접속하여 버튼 없이 갱신되는지 확인한다.
3. 게임 중 업데이트가 준비되어도 방향키·Enter/ESC·음악·1×/2×가 계속 작동해야 한다. 게임 내부 저장 후 런처 종료가 성공하면 자동 갱신되는지 확인한다.
4. 같은 주소를 두 탭에서 열면 적용이 보류되어야 한다. 다른 탭을 안전하게 닫고 유휴 상태에서 재시도되는지 확인한다.
5. 오프라인에서 기존 게임/RAW/세이브가 유지되고 온라인 복귀 시 검사되는지 확인한다.

PC의844×390 테스트는 Galaxy 실기 성공이 아니다. Android 앱 백그라운드 제한·장시간 다운로드·실제 CDN의 배포 지연은 추가 실기 대상이다. OS가 페이지를 강제 종료하는 문제나 실제 게임 메모리 상태 보존을 업데이트 기능이 보장하지 않는다. 다중 탭은 모두 유휴여도 자동 강제 갱신하지 않는 보수적인 정책이다.

게임 엔진, HF1 복구 정책, PCM/AudioWorklet, 두기 감지, 저장 스키마·tombstone·삭제 규칙은 변경 대상이 아니다. 이 작업에서는 상용 게임을 실행하거나 게임 원본을 수정하지 않는다.

## 10. 빌드 및 보존 기록

| 출력 | 이전 HF1 ID | 최종 HF2 ID |
|---|---|---|
| 공개 `docs/ed4/` | `9-8r-hf1-public-20261111050546382-fc001b87` | `9-8r-hf2-public-20261111064643689-ba9b67f4` |
| 개발 `docs/ed4-dev/` | `9-8r-hf1-dev-20261111050204267-5d594a7c` | `9-8r-hf2-dev-20261111064624154-dcaee601` |

`npm run build:developer`, `npm run build` 모두 성공했고 TypeScript 검사도 포함한다. 공개/개발 base와 audience는 기존 경로를 유지한다.

변경 전 산출물은 `artifacts/phase9-8r-hf2/previous-public/`, `previous-developer/`에 보존했다. 양쪽의 vendor/실행 Worker/AudioWorklet **226개 파일**을 이전 바이트와 대조하여 모두 동일함을 확인했다. 보호 대상 핵심 소스 11개도 HEAD와 diff가 없다(`preservation.json`). `main.ts`의 저장·종료 본문은 변경하지 않고 업데이트 시작 잠금과 유휴 판정만 추가했다.

새 Chrome 프로필의 합성 데이터로 공개 archives/profiles/saves/recovery 내용, OPFS RAW SHA-256, 조작 설정을 전환 전후 대조했다. 실제 사용자의 브라우저 저장 공간에는 접근하지 않았다. 보존 시험 통과가 사용자 기기의 전체 데이터 상태를 직접 확인했다는 뜻은 아니다.

최종 배포 무결성 검사는 각 manifest에 명시된 전체 파일·SW 해시·HTML 진입 경로·대응 소스 빌드 ID를 검사한다. 상용 `.iso/.raw/.efc/.sav` 파일, 100MiB 초과 파일, Git 바이트 정규화 불일치도 검사한다. 기존 GPL 고지·에뮬레이터 소스는 유지하고 최종 보고서/테스트를 포함한 런처 대응 소스를 각 빌드 ID로 다시 묶었다. 결과: `check-public-final.log`, `check-dev-final.log`.

HF1 산출물의 보존본은 로컬 복구 및 byte-exact 전환 시험용이다. 다른 체크아웃에서 이 시험을 재현하려면 위 기준 HEAD의 `docs/ed4/`를 해당 `previous-public/` 위치에 먼저 복사해야 한다. Git 이력 복원/작업 트리 덮어쓰기 명령은 자동 수행하지 않았다. 기존 버전 소스로 되돌려 배포할 때도 새 식별자의 검증된 빌드를 준비하는 방식이 권장되며, 구형 SW 프로토콜로의 자동 다운그레이드는 이번 검증 범위가 아니다.
