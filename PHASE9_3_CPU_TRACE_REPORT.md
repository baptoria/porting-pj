# Phase 9-3 — Reset Vector 직전 CPU 실행 이력

2026-11-09. `D:\porting\ed4-mobile`, `/porting-pj/ed4/`. 앱 버전과 `phase7-runtime-1`은 유지한다. 새 자료는 `engine.cpuHistory.revision=phase9-3-cpu-1`로 구분한다.

## 결론과 증거 범위

Phase 9-2와 별도인 실험 엔진에 제한된 CPU 이력을 구현했다. **상용 영웅전설4는 실행하지 않았다. 게임의 최초 비정상 전이와 실제 원인은 아직 미확정이다.** 이번 결과는 공개 합성 COM의 알려진 전이와 실기 수집 수단에 관한 것이다. BIOS 재부팅이나 원래 `abort()`를 정상 종료로 바꾸지 않았다.

Phase 8 ROOT_CAUSE / WASM_SYMBOL_MAP / FIX_PLAN, Phase 9-1 ASYNCIFY_REPORT, Phase 9-2 REBOOT_REPORT 및 실제 대응 소스를 확인했다. 사용자 제공 실기 관측은 Phase 9-2 해시 `d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc`, ED4.EXE `loader-prepared`, real mode `FFFF:0000`, CR0 `0x10`, resetLinear `0xFFFF0`, originSequence 0이다. 새로운 Galaxy JSON을 확보했다고 가정하지 않았다.

## 기존 계측이 직전 이동을 놓칠 수 있는 이유

Phase 9-2 `ED4_Fetch()`는 normal core가 실제 reset 선형 주소를 fetch할 때 `reset-entry`를 기록한다. 따라서 그 순간의 normal core / real-mode 진입은 관측되지만, 과거 실행 core와 명령 전체를 증명하지 않는다.

기존 `ED4_FarJump()`는 **CPU_JMP의 제한된 실주소/v86 목적지**만 연결했다. CPU_RET/CPU_IRET, near/indirect 제어 흐름, CPU API 외부의 직접 레지스터 변경에는 같은 사전 이벤트가 없다. 중간 fetch·인터럽트·callback 또는 core 변경으로 pending 연결을 해제하는 보수적 정책도 있다. 그러므로 `originSequence=0`은 사전 연결 부재이며 FAR JMP, 주소 손상, 보호 모드 오류 중 하나를 지정하는 값이 아니다.

이번 공개 RETF/IRET 시험은 같은 reset-entry에 도달하면서 Phase 9-2의 origin이 없을 수 있는 실제 사례를 제공한다. 이것이 **영전4도 RETF/IRET를 사용했다는 증거는 아니다.** 기존 route/unknown 판단을 덮어쓰지 않고 독립적인 CPU 이력으로 대조한다.

## 실제 추가 소스와 실행 시점

기준은 검증된 `public/sources/emulators-0.73.8-phase9-2-source.zip`이다. SHA-256 `96fe5a21e15c84b93b2915eb794065face69d88a599c3d85fd59df626c8536d8`를 확인해 **별도** `artifacts/phase9-3/source/instrumented/`에 추출했다. 기존 Phase 9-2 소스/바이너리는 수정하지 않았다.

| 대응 소스 파일 | 계측 |
| --- | --- |
| `native/dosbox/src/cpu/core_normal.cpp` | LOADIP 다음, 명령 decode 전 scope 시작. 기존 SAVEIP 또는 실제 CPU API 제어 이전 후 scope 종료. 기존 Fetchb/ModRM의 이미 읽은 값을 분류에만 사용 |
| `native/dosbox/src/cpu/core_normal/prefix_none.h`, `prefix_66.h` | 기존 `goto decode_end`에서 scope 종료를 SAVEIP 이후로 지연. 공유 헤더의 다른 core에는 no-op |
| `native/dosbox/src/cpu/cpu.cpp` | JMP/RET/IRET/CALL/Interrupt/CR0/segment API의 전후 관측. 실행 중 명령에 API mask·interrupt 번호/type을 연결; 명령 밖 호출은 cpu-api 레코드 |
| `native/dosbox/src/cpu/ed4_trace.inc` | 기존 reset fetch 및 reboot-handler 직전에서 이력 한 번 전송. 기존 EXEC 결과와 준비 주소 연결 |
| `native/dosbox/src/dosbox.cpp` | callback 전후 경계, normal 이외 decoder 호출의 gap 표시. callback 중 중첩 CPU 실행을 하나의 명령으로 오인하지 않음 |
| `native/dosbox/src/dos/dos_execute.cpp` | 원래 LOAD/LOADNGO 분기 직전 준비된 CS:IP, SS:SP, PSP와 EXEC ID 보관. overlay는 게스트 시작으로 간주하지 않음 |
| `native/dosbox/include/ed4_cpu_trace.h`, `src/cpu/ed4_cpu_trace.inc` | 고정 ring, entry anchor, 디코드 분류, trigger 및 metadata-only 전송 구현 |

전체 변경 전후 해시는 `artifacts/phase9-3/source-changes.json`, 배포 대응 소스 ZIP의 `PHASE9_3_CHANGES.json`에 있다. 재현 패치는 `scripts/prepare-phase9-3.mjs`, 구현 템플릿은 `scripts/phase9-3/`이다. 기존 Asyncify 목록, BIOS 등록, CPU 연산/분기 의미, abort, DOS 로딩/메모리 할당 의미는 변경하지 않았다.

## 이력의 의미와 한계

- 최근 **최대 128개 관측 레코드**의 순환 버퍼다. 명령뿐 아니라 API/host/core-gap 경계도 들어가므로 정확히 128개 게스트 명령을 보장하지 않는다. `overwritten`에 소실 수를 기록한다.
- 각 before/after에는 CS, IP/EIP, CS base, 선형 주소, SS, CR0, mode(real/protected/v86), FLAGS, PSP segment, core 식별자가 있다. 선형 주소는 **CS base + EIP**이며 paging/A20 이후 물리 주소가 아니다. PSP는 보호 모드 task identity가 아니다.
- `source=normal-instruction`의 before는 prefix를 포함한 decode 시작, after는 실제 완료 경계의 emulator 상태다. 분류는 far-jmp / indirect-far-jmp / retf / iret / interrupt / near 계열 / conditional / loop / control-register-group / segment-load 등이다. 원래 명령 바이트와 스택/피연산자 값은 보관하지 않는다.
- interruptNumber/type은 실제 CPU_Interrupt API 관측이다. 조건부 명령이 실행돼도 분기가 성공했다고 이름만으로 판정하지 않는다. 목적지는 **after의 실제 상태**로 대조한다. `control-register-group` 역시 명령 그룹 분류이며 실제 CR0 전이는 before/after 및 apiMask 16으로 확인한다.
- host-enter/return은 게스트 명령이 아닌 callback 경계다. API 밖의 레지스터 변경이 이 사이에 나타나면 위치를 좁힐 수 있으나 어느 C++ 대입문이 원인인지까지 식별하지 않는다. core-gap은 해당 구간의 명령을 관측하지 못했다는 의미다.
- sequence/epoch는 CPU 이력 순서다. 기존 BIOS 이벤트의 sequence와 별개이며 `rebootSequence`로 연결한다. reset fetch 직전에 고정하므로 마지막 row에 ROM의 후속 jump가 앞선 전이를 가리지 않는다. INT18/19처럼 vector fetch가 없는 경우 handler 진입에서 고정한다.
- 로더 anchor는 최신 8개의 준비 상태와 실제 시작 주소에서 관측한 첫 완료 명령만 별도 보존한다. `entryObserved=true`는 해당 CS:IP/PSP에 실제 도달한 관측이며 **초기화 성공이 아니다**. false는 실패 확정도 아니다(core gap, overwrite된 anchor, LOAD-only 등). `execId`는 마지막 DOS 요청 ID이며 현재 실행 바이너리 소유권을 모든 주소에 부여하지 않는다.
- 다른 core의 모든 명령, 전체 보호 모드/DPMI 동작, 게임 메모리 손상의 발생 지점은 포괄하지 않는다. 최근 이력 밖의 최초 손상, 반복 REP의 각 iteration, 장시간 host callback 내부 등은 별도 분석이 필요하다. C++ 예외 등 완료 경계를 통과하지 않은 명령도 완료로 추정하지 않는다.

## 성능·수집 제한

ring은 128 × 120 = **15,360 bytes**, 현재 row와 8개 anchor를 합한 고정 구조체 합계 **17,240 bytes**다. 이는 compile-time sizeof 검사 및 실행 payload로 검증한다. 소수의 카운터/flags, 임시 stack, JS 객체/JSON/structured-clone 할당은 이 숫자에 포함하지 않는다.

매 명령은 WASM 내부 상태/flag getter 복사와 분류만 수행한다. JS 메시지는 최초 reset-vector-fetch 또는 reboot-handler에서 **한 번** 전송한다. 명령별 JS 메시지, 전체 메모리 dump, 원본 opcode/피연산자/스택 데이터, RAW/세이브 내용은 없다. normal core의 모든 명령을 계측하므로 CPU 비용은 분명히 추가된다. 무시할 수 있는 비용이라고 주장하지 않는다.

PC 공개 시험의 wall time에는 브라우저 시작·등록·BIOS 지연·JSON 다운로드가 포함된다. 이를 순수 CPU 오버헤드나 Galaxy FPS로 환산하지 않는다. **Galaxy 실행 속도·배터리·메모리 증가량은 아직 미측정**이다. 새 엔진은 일회성 실험에만 사용한다.

측정한 10개 재부팅 입력의 위 wall time은 Phase 9-2 4,372~4,594ms, Phase 9-3 4,393~4,452ms였다(각 입력 1회, 통계적 성능 비교 아님). 오류 시 WASM heap 관측값은 양쪽 모두 67,108,864 bytes였다. Phase 9-3 CPU 메시지는 입력당 1개, JSON 직렬화 기준 49,833~49,908 bytes였다. 구조체 17,240 bytes와 전송/JS 비용을 혼동하지 않는다. 일반 실행·정상 종료 2종에서는 CPU 메시지가 없었다. 근거: `artifacts/phase9-3/cpu-summary.json`, `browser/*/result.json`.

## 빌드와 바이너리

기존 WSL Ubuntu 24.04 / Emscripten **3.1.21** 환경을 재사용했다. SDK release `a16a8bca2466eb144f7c93fa899c0272c8815dc3`, Node 14.18.2, CMake 3.24.2, Ninja 1.11.1, 기존 zlib cache를 사용했다. 새 도구체인/대용량 다운로드/시스템 설치는 없다. Asyncify onlylist의 기존 미일치 경고 15개는 유지되며 Reboot_Handler 추가 항목도 유지한다.

```powershell
node scripts/prepare-phase9-3.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-3.sh
node scripts/package-phase9-3.mjs
npx playwright test --config playwright.phase9-3.config.ts
node scripts/package-phase9-3.mjs --deploy
npm run build
```

prepare는 기존 snapshot/실험 소스를 임의 덮어쓰지 않고 이미 있으면 중단한다. 새 환경에서는 Phase 9-1 SDK 경로가 필요하다. 대응 소스 ZIP의 BUILD.md에는 일반 emsdk 3.1.21 재빌드 명령도 제공한다. source path가 출력에 포함될 수 있으므로 다른 절대 경로의 재빌드가 동일 해시라고 가정하지 않는다. 전체 실제 compile/link 명령은 `artifacts/phase9-3/logs/commands.txt`에 있다.

| 엔진 | WASM SHA-256 |
| --- | --- |
| 기존 안정 엔진 (보존) | `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf` |
| Phase 9-2 (보존) | `d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc` |
| Phase 9-3 CPU trace | `a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b` |

새 WASM 1,469,279 bytes. JS `ce6f0cfcd546de7b85333c315794abf763de30572a3371941217a4be50f3be7f`, symbols `d22ce4ccfe93857017efd8ebd6fe349d19536e86c716455028e1aae04ab76b92`. 실제 배포 산출물은 `licenses/phase9-3-engine.json`과 대조한다.

## 테스트 결과

최종 검증 결과는 아래와 같다. 기존 테스트 파일은 변경하지 않았고 실패/skip/flaky 없이 통과했다(최초 신규 fixture 실패는 아래 별도 기록).

| 검증 | 결과 | 자료 |
| --- | --- | --- |
| TypeScript / production build | 통과 | `npm run build`, `docs/ed4/` |
| 단위 | 229/229 | `artifacts/phase9-3/unit-after.json` |
| 기존 Chrome E2E | 38/38 | `artifacts/phase9-3/regression-after.json` |
| 기존 Phase 9-2 공개 A/B | 13/13 | `artifacts/phase9-2/public-tests.json` |
| 기존 Phase 9-2 런처 통합 | 4/4 | `artifacts/phase9-2/ui-tests.json` |
| 신규 Phase 9-3 공개 A/B | 24/24 | `artifacts/phase9-3/public-tests.json` |
| 신규 Phase 9-3 런처 통합 | 4/4 | `artifacts/phase9-3/ui-tests.json` |
| 기존 Pages 경로 / 저장 / 오프라인 | 2/2 | `artifacts/phase9-3/pages-after.json` |
| 배포 무결성·기존 파일 보존·GPL 소스 | 통과 | `artifacts/phase9-3/deployment-audit.json` |

Chrome은 PC headless이며 모바일 크기 시험도 Galaxy 실기가 아니다. 재실행 명령은 `npm test`, `npx playwright test`, `npx playwright test --config playwright.phase9-2.config.ts`, `playwright.phase9-2-ui.config.ts`, `playwright.phase9-3.config.ts`, `playwright.phase9-3-ui.config.ts`, `playwright.pages.config.ts`이다(뒤의 config 이름들도 같은 `npx playwright test --config` 인수).

- 작업 전 단위 210/210, Chrome E2E 38/38 통과. 사용자 지시의 기존 200개보다 체크아웃에 10개가 추가되어 있었다.
- 작업 후 단위 229/229 통과(기존 210 + 신규 19). 상한/순서/정수/경로/허용 필드/entry와 CPU 증거 구분/중복 snapshot 차단을 검증했다.
- 최초 신규 공개 시험은 12/18 통과, 6개 실패였다. 짧은 COM도 ring이 128개라고 가정한 새 시험 fixture 문제였다. 엔진을 바꾸거나 검증 조건을 낮추지 않고 256 NOP을 앞에 추가해 실제 wrap 조건을 만든 결과 18/18 통과했다. 최초 실패 자료는 `artifacts/phase9-3/public-tests-first.json`, `browser-first/`에 보존했다.
- 확장 공개 시험은 FAR JMP, RETF, IRET, 간접 FAR JMP, ring wrap, INT18/19, 사용자 INT60 벡터, divide 예외, CR0 보호 모드 진입·실주소 복귀 및 일반 DOS 키보드/화면/종료를 Phase 9-2와 새 엔진의 같은 입력으로 비교한다.

확장 공개 A/B **24/24 통과**, 새 런처 통합 **4/4 통과**. 새 RuntimeError/null function은 없었으며 10종 재부팅 입력은 양쪽 모두 의도된 원래 abort에 도달했다. abort 시험에서 ws-exit을 정상 종료처럼 보고하지 않고 수동 정지의 Worker terminate를 확인했다. 일반 DOS return + shell exit에서는 실제 ws-exit, 키보드 시험에서는 화면 픽셀/frames/입력 응답을 확인했다.

새 통합 시험은 실제 해시를 계산한 동일 WASM 모듈 실행, 세로가 아닌 모바일 가로 크기, 기존 세이브·합성 RAW 재사용, 오프라인 선택, 진단 변경분 폐기 후 DB/OPFS snapshot 동일성, 안정 엔진 복귀, abort 후 JSON 유지, 잘못된 해시 실행 차단 및 GPL 대응 소스 HTTP 제공을 확인했다.

| 공개 입력 | 기록된 마지막 게스트 전이 (이 실행의 주소) | 구별 근거 |
| --- | --- | --- |
| FAR JMP | `0192:0200 → FFFF:0000` | far-jmp, API JMP |
| 간접 FAR JMP | `0192:0200 → FFFF:0000` | indirect-far-jmp |
| RETF | `0192:0206 → FFFF:0000` | retf, 기존 origin 0도 그대로 유지 |
| IRET | `0192:0207 → FFFF:0000` | iret, 기존 origin 0도 그대로 유지 |
| INT60 벡터 변경 | `0192:020E → FFFF:0000` | interruptNumber 96, software type |
| divide 예외 | `0192:0210 → FFFF:0000` | CPU_Interrupt 번호 0, exception type bit 2, JMP로 오분류하지 않음 |
| CR0 왕복 후 JMP | `0192:020E → FFFF:0000` | 이전 rows의 real → protected → real 및 CR0 API mask |
| INT18 / INT19 | COM의 interrupt → BIOS stub → host-enter | 원래 route int18/int19 구별, reset-vector-fetch 아님 |

모든 probe 앞에 256 NOP을 넣어 128개 ring의 실제 wrap을 발생시켰다. 별도 ring-wrap 입력에는 NOP 256개를 더 넣었다. 오래된 첫 명령이 ring에서 사라져도 별도 entry anchor가 유지되는 것을 검증했다. 이 주소들은 공개 COM의 관측값이며 게임 주소가 아니다.

## 배포와 보존 점검

새 엔진은 `docs/ed4/vendor/experimental/phase9-3/`, 별도 진입 Worker는 `dos-worker-phase9-3.js`다. 기본값과 일반 실행은 안정 엔진이며 Phase 9-2 선택도 유지한다. 선택값은 저장하지 않는다. 기존 UI의 엔진 옵션만 추가했고 CSS/레이아웃은 변경하지 않았다. `src/cpu-history.ts`는 필드·정수·개수·순서·basename을 검증하고 임의 Worker payload를 복사하지 않는다.

대응 GPL ZIP은 `sources/emulators-0.73.8-phase9-3-source.zip`, SHA-256 **796202ee431d795d1e4b70339b9ac23ddf538b482a64baceb119b9c1563c0a0a**, 600개 항목(전체 소스·라이선스·빌드 안내·기존 및 새 변경 manifest), 2,736,090 bytes다. 이것이 배포 최대 단일 파일이며 100MiB 제한보다 작다. 안정/Phase 9-2 vendor·기존 테스트·기존 템플릿·루트 안내 48개 파일의 원래 해시를 확인했다. 게임/RAW/세이브 payload는 추가하지 않았다. `scripts/check-phase9-3.mjs`와 `artifacts/phase9-3/deployment-audit.json`에 검증을 남긴다.

DB/OPFS/schema/save/backup/모드 레이어 코드 변경 없음. Git HEAD `e0416a0f9bb561a2f78d50274a5803c6bdfd70fa` 유지, staging/Commit/Push 없음. 실제 GitHub Pages 업로드·Galaxy 실행은 사용자가 수행한다.

## Galaxy에서 수행할 절차

1. 사용자가 GitHub Desktop에서 변경된 소스와 `docs/ed4/`를 Commit/Push한다. 이 작업에서 원격 업로드/실제 HTTPS 배포는 하지 않는다.
2. Galaxy의 기존 탭/PWA를 닫고 온라인에서 다시 열어 업데이트한다. **사이트 데이터는 삭제하지 않는다.** 등록된 게임·RAW·세이브를 그대로 사용한다.
3. 기존 프로필의 **설정 · 백업 → BAT 실행 순서 · 임시 진단**에서 기존 GAME.BAT와 수동 비교 설정을 유지하고 엔진만 **실험: Phase 9-3 CPU 실행 이력 · 저장 안 함**으로 선택한다. CPU/메모리/사운드/RAW 조건을 동시에 바꾸지 않는다.
4. 정지/오류 발생 후 다음 실행 전에 **진단 JSON**과 **화면 PNG**를 다운로드한다. `engine.artifact.id=phase9-3`, `verification=sha256-of-compiled-module`, 위 WASM 해시를 먼저 확인한다.
5. `engine.cpuHistory.history.execEntries`에서 ED4.EXE의 준비 주소/실제 entry 관측을 비교한다. `records` 마지막부터 거슬러 normal-instruction의 before/after와 kind, 중간 cpu-api/host/core-gap, CR0/mode 변화를 확인한다. 기존 `engine.reboot.events`의 reset-entry와 snapshot `rebootSequence`를 함께 대조한다.
6. **진단 종료 (저장 안 함)** 후 일반 실행 또는 다음 진단 기본값은 안정 엔진으로 복귀한다. 실험 선택을 영구 저장하지 않는다. JSON이 없거나 history가 없으면 그 사실/브라우저·기기·소요 시간만 보고하고 원인을 추정하지 않는다.

## 미확정 사항과 다음 판단 기준

FAR JMP/RETF/IRET, 인터럽트·예외, 보호 모드/컨텍스트 복귀, host 직접 변경, 다른 core/손상 모두 아직 ED4의 원인 후보다. 해당 전이가 정상적인 게임 종료 의도인지, 이전의 잘못된 실행 상태가 만든 결과인지도 미확정이다. 주소만으로 상용 바이너리의 함수 이름이나 메모리 손상 원인을 만들지 않는다.

새 Galaxy 이력에서 ED4 entry → 마지막 유효 주소 → FFFF:0000 전이를 먼저 연결하고, 실패 직전이 ring 밖이면 범위가 부족하다고 보고한다. 진단 자료 없이 CPU 오류를 무시하거나 원본 명령/게임/음악을 바꾸는 수정은 적용하지 않았다.
