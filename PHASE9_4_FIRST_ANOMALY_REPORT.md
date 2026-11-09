# Phase 9-4 — 최초 CPU 주소·모드 관측 보존

2026-11-09. 작업 경로 `D:\porting\ed4-mobile`, Pages 경로 `/porting-pj/ed4/` 유지. 앱의 `phase7-runtime-1`은 유지하며 새 이력 형식은 `engine.cpuHistory.revision=phase9-4-first-1`, payload version 2로 식별한다.

## 판정과 증거 범위

별도 Phase 9-4 실험 엔진에 최초 이벤트 보존을 구현했다. **상용 영웅전설4는 실행하지 않았다. 게임 실행 성공, 최초 실제 비정상 전이 및 원인은 아직 미확정이다.** 이번 계측은 주소·모드 관측을 보존하며, 수상한 주소를 CPU 결함이나 게임 실행 범위 이탈로 자동 판정하지 않는다.

Phase 8 ROOT_CAUSE / WASM_SYMBOL_MAP / FIX_PLAN, Phase 9-1 ASYNCIFY_REPORT, Phase 9-2 REBOOT_REPORT, Phase 9-3 CPU_TRACE_REPORT / HOTFIX_REPORT 및 대응 소스와 기존 테스트를 검토했다. 사용자가 제공한 Galaxy 결과는 ED4.EXE `loader-prepared`, 실제 첫 명령 `1C3B:0000`, 약 1,352만 명령, 약 1,442만 덮어쓰기, 마지막 real-mode `FFFF:1101D` FAR CALL → `FFFF:0000`이다. 이 내용은 사용자 관측이며 이번 로컬 시험에서 얻은 게임 진단 JSON으로 가장하지 않는다.

이전 128개 ring은 마지막 전이는 보여도 수백만 명령 전의 최초 CS 변경을 복원할 수 없다. `originSequence=0` 및 과거 이력 부재를 특정 명령·반환 주소 손상의 증거로 사용하지 않았다.

## 구현과 보존 정책

Phase 9-3 GPL 대응 소스 ZIP SHA-256 `796202ee431d795d1e4b70339b9ac23ddf538b482a64baceb119b9c1563c0a0a`에서 별도 소스·빌드 디렉터리를 생성했다. 해당 소스 대비 네이티브 변경은 세 파일뿐이다.

| 대응 소스 내 파일 | 변경 |
|---|---|
| `native/dosbox/src/cpu/core_normal.cpp` | 이미 소비하는 decode 값과 기존 주소 크기 상태를 관측 함수로 전달 |
| `native/dosbox/include/ed4_cpu_trace.h` | 관측 함수의 주소 크기 인수 |
| `native/dosbox/src/cpu/ed4_cpu_trace.inc` | 확장된 상태, one-shot anchors 및 제한된 JSON 내보내기 |

저장소의 재현용 원본은 `scripts/phase9-4/`이며, `scripts/prepare-phase9-4.mjs`가 고정 소스 해시를 확인하고 최소 차이를 적용한다. 원래 Asyncify `Reboot_Handler()` 수정, BIOS/DOS/CPU API 계측, 원래 C++ `abort()`는 유지한다. CPU 연산, 마스킹, 예외 처리, 분기 결과를 변경하지 않았다. 메모리·세이브 구조나 원본 파일도 변경하지 않았다.

실제 normal-core 시작 주소/PSP가 마지막 성공한 로더 준비 상태와 일치하고 프로그램 basename이 대소문자 무관 `ED4.EXE`일 때만 최초 관측을 활성화한다. 요청이나 `loader-prepared`만으로 활성화하지 않는다. 이후 범위는 **첫 ED4 진입 이후의 세션 전체**이며, 모든 주소가 ED4에 속한다는 뜻은 아니다. 실제 실행 이미지 경계를 수집하지 않으므로 “게임 코드 밖으로 나간 최초 시점”을 자동 확정할 수 없다.

기존 마지막 128개 ring과 최근 8개 EXEC entry는 유지한다. 별도 pinned target entry와 다음 8개 one-shot anchor는 덮어쓰지 않는다.

| anchor | 의미 |
|---|---|
| `target-entry` | 실제 ED4 첫 명령의 전후 상태 |
| `first-cs-ffff` | 최초 CS=FFFF 관측/전이 |
| `first-real-eip-wide` | 최초 real-mode EIP > FFFF 관측/전이 |
| `first-bios-region` | real/non-paging 선형 F0000~FFFFF 영역 접근 |
| `first-reset-address` | real/non-paging 선형 FFFF0 접근 |
| `first-unattributed-cs-change` | 관측한 제어 API로 설명되지 않는 CS/base 변경 또는 기록 사이 변경 |
| `first-mode-cr0-change` | 최초 mode 또는 CR0 변경 |
| `first-cs-transfer` | 정상 전이를 포함한 최초 CS/base 변경 |

각 anchor는 직전 최대 24개, 해당 이벤트 1개, 이후 최대 16개 기록을 저장한다. 버퍼가 아직 차지 않았거나 즉시 reset된 경우 실제 존재하는 기록만 제공한다. 반복 전이는 횟수만 증가시키며 UINT32_MAX에서 포화한다. 후속 기록 16개가 채워지면 해당 복사 작업을 중단한다.

레코드는 sequence/epoch, before/after CS:EIP, low IP, CS base, 선형 주소, CR0/mode, FLAGS, SS:SP/ESP, SS base, PSP, core, code/stack big, stack mask, CPL, A20, paging, 명령 분류, decode에서 확인한 operand/address bits, 실행 요청 ID를 담는다. anchor에는 당시 마지막 EXEC basename/결과/오류 코드가 있다. `loader-prepared`는 초기화 성공이 아니다. operand/address bits는 decode를 보지 못한 API·host 경계에서는 0/unknown이다.

이전 레코드의 after와 현재 before가 같으면 `same-address-mode`, 다르면 `unexplained-gap`, `host-boundary-gap`, `untraced-core-gap` 등으로 표시한다. `fetchConfirmed`는 실제 다음 명령 또는 바로 이어진 reset fetch를 관측한 경우만 참이다. 목적지 상태가 있다는 것과 그 명령을 실제 fetch했다는 것을 구분한다. ring과 anchor의 관측 전후가 연결되지 않으면 중간 실행을 만들어 내지 않는다.

Reset Vector fetch 또는 기존 reboot handler 시점에 최초 anchors, pinned EXEC entry, 마지막 ring을 **한 번만** 보낸 뒤 동결한다. 매 명령 JS 전송은 없다. reset 즉시 도달해 완성된 전이가 없는 경우 `fetch-boundary` 관측을 사용하며, 이를 게스트 명령으로 위장하지 않는다. CPU metadata 외 게임 명령 바이트·메모리·스택 내용·RAW·세이브는 읽거나 내보내지 않는다. TypeScript 수신기는 크기·순서·정수 범위·basename을 검증하고 알 수 없는 필드를 버린다.

## EIP 16비트 초과의 기술적 의미

동일 고정 소스의 `native/dosbox/src/cpu/core_normal.cpp:111–113`에서 GETIP은 `core.cseip-SegBase(cs)`, SAVEIP은 그 값을 `reg_eip`에 저장, LOADIP은 `SegBase(cs)+reg_eip`를 사용한다. 순차 fetch는 선형 포인터를 증가시킨다. 일반 fallthrough에 일괄 16비트 마스킹이 없다. `include/regs.h:164–165`의 `reg_ip`는 같은 저장소의 하위 16비트 뷰이고 `reg_eip`는 32비트 뷰다.

반면 `cpu.cpp:1008` CPU_JMP와 `:1077` CPU_CALL의 real/v86 16비트 경로는 목적지 offset을 FFFF로 마스크하고 32비트 경로는 전체 값을 쓴다. `:771` CPU_IRET 및 `:1314` CPU_RET는 operand 크기에 따라 16/32비트 주소를 pop한다. `core_normal/prefix_none.h`의 near JMP/CALL 및 `support.h` 조건 분기도 갱신 방식이 같지 않다. `67h` 주소 크기는 데이터 유효주소 선택에 관여하며 EIP의 전역 마스킹 설정으로 취급할 수 없다.

따라서 `FFFF:1101D`를 단지 low IP 표시 오류로 단정할 수도 없다. 이 normal core의 LOADIP은 실제 전체 EIP를 이용한다. 공개 합성 프로그램은 이 빌드에서 16비트 code 상태의 FFFF→10000 순차 진행과 FFFF:1101D의 실제 FAR CALL을 관측하도록 구성했다. **이것은 해당 에뮬레이터 구현의 관측 결과이며 실제 x86 하드웨어에서의 허용 여부, ED4가 그 상태에 이른 이유, 버그의 최초 원인을 입증하지 않는다.** 마스킹 패치는 적용하지 않았다.

CS selector와 `Segs.phys` base는 별도다. protected mode에서는 descriptor에서 설정된 base가 사용되고, real FAR 전이는 SegSet16 및 code.big=false 설정을 수행한다. 이 소스의 CPU code cache에서 직접 제공되지 않는 hidden segment limit는 `codeLimit:null`로 둔다. 현재 descriptor를 다시 읽어 과거 hidden cache limit인 것처럼 보고하지 않는다.

`hardware/memory.cpp:417–423`의 A20 설정은 1MiB 직후 16페이지(64KiB)를 매핑한다. 이에 한정한 `a20WindowCandidate`만 별도 표시하며 모든 주소에 bit20 마스크를 적용하지 않는다. `linear=CS base+EIP`는 paging/A20 이전이다. 실제 page walk·EMS 매핑은 관측하지 않으므로 `physicalAddress:null`이다. 예를 들어 base가 FFFF0이면 EIP1101D의 선형 주소는 11100D이며, 그 base와 A20 상태가 실제 JSON에 있는지 먼저 확인해야 한다.

## 정상/수상한 전이의 구분과 한계

BIOS INT10이나 합법적인 FAR CALL/JMP/RETF/IRET도 CS·BIOS 이벤트를 만들 수 있다. 이를 오류로 분류하지 않는다. CPU_JMP/RET/IRET/INT/CALL API 마스크로 설명되는 전이는 `first-unattributed-cs-change`에 넣지 않는다. host callback, 코어 간 공백, API 외부 직접 변경은 설명되지 않는 관측으로 남기며 CPU 결함이라 판정하지 않는다.

normal/normal-trap 이외 코어에는 기존 API·gap 관측만 있다. interrupt/exception의 실제 관측 목적지와 종류는 보존하지만 guest 반환 스택이나 전체 interrupt vector table을 읽지 않는다. 최초 이벤트 이후 16개를 벗어난 중간 과정은 복원할 수 없다. Reset에 이르지 않고 무한 루프가 지속되면 이번 버퍼는 JS로 전송되지 않는다. 이 제한을 무리한 임의 중단으로 해결하지 않았다.

## 빌드·해시·재현

기존 WSL Ubuntu / Emscripten **3.1.21**, 기존 Node14.18.2, CMake3.24.2, Ninja1.11.1을 재사용했다. 새 도구체인 다운로드·설치는 없다. 고정 upstream commit은 `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`다. 기존 CMake/Asyncify 옵션을 유지하며 기존과 같은 unmatched Asyncify 경고 15개를 숨기지 않았다.

```text
node scripts/prepare-phase9-4.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-4.sh
node scripts/package-phase9-4.mjs
npx playwright test --config playwright.phase9-4.config.ts
node scripts/package-phase9-4.mjs --deploy
npm run build
node scripts/check-phase9-4.mjs
```

prepare는 보존 snapshot과 소스에 wx 생성 정책을 사용하므로 기존 산출물이 있는 작업 폴더에서 덮어쓰며 재실행하지 않는다. 재현 시 새 artifacts 폴더를 사용하거나 이미 생성된 소스로 build만 수행한다. `--deploy`는 공개 시험 결과와 실제 시험 WASM 해시를 확인한다. GPL ZIP에는 전체 대응 소스, 변경 manifest, BUILD.md가 포함된다. 실제 컴파일 명령은 `artifacts/phase9-4/logs/commands.txt`에 보관했다. 빌드 디렉터리 문자열 차이는 바이너리 해시에 영향을 줄 수 있다.

실험 WASM SHA-256:

`13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738`

WASM 1,471,506 bytes. JS SHA-256 `ba9c6703a04fcc52b5a40b68187ee0878d2624189b9892c613993257ddb97852`. `licenses/phase9-4-engine.json`은 WASM/JS/symbols/고지문 및 GPL ZIP을 검증한다.

## 테스트 결과

최종 실행 결과는 다음과 같다. 시험 실패를 숨기거나 기존 조건을 완화하지 않는다. 새 EIP boundary fixture가 너무 짧아 128개 ring 덮어쓰기 조건을 만족하지 못했던 초기 실패가 있었다. 정상 NOP 구간을 추가했으며, 이 구간이 corridor의 첫 16개 decode 관측을 가린 후속 fixture 오류도 corridor에 적용하지 않도록 바로잡았다. 엔진 수정이나 assertion 완화로 통과시키지 않았다.

공개 probe의 `ED4.EXE`는 이 작업에서 직접 작성한 **COM 형식 또는 최소 MZ 형식의 합성 프로그램**이며 상용 게임이 아니다. basename과 MZ 시작 IP=0까지 검증하기 위해 같은 이름을 사용한다. 데이터 소스는 `scripts/phase9-4-probes.mjs`이고 모두 CC0다.

| 검증 | 결과 | 로컬 증거 (`artifacts/phase9-4/`) |
|---|---|---|
| 작업 전 단위 / Chrome E2E | 238/238, 38/38 | `unit-before.json`, `e2e-before.json` |
| 변경 후 단위 | **272/272**, 기존238 + 신규34 | `unit-after.json` |
| 기존 Chrome E2E | **38/38** | `regression-playwright.json` |
| Phase9-2 엔진 / UI | **13/13 + 4/4** | `regression-phase9-2*.json` |
| Phase9-3 엔진 / UI | **24/24 + 4/4** | `regression-phase9-3.json`, `regression-phase9-3-ui.json` |
| 기존 Worker Hotfix | **8/8** | `regression-phase9-3-hotfix.json` |
| Pages 경로·manifest·캐시·오프라인·저장 | **2/2** | `regression-pages.json` |
| Phase9-4 공개 A/B | **26/26** | `public-tests.json`, `browser/*/result.json` |
| Phase9-4 일회성 선택·저장/RAW·GPL·잘못된 WASM 거부 | **4/4** | `ui-tests.json`, `ui/` |
| Phase9-4 구 캐시 혼합 온라인/오프라인·부트스트랩 실패 | **6/6** | `cache-tests.json`, `cache-browser/` |
| TypeScript / production build / Worker 해시 검사 | 통과 | `npm run build`, `check-phase9-4-worker.mjs` |

변경 후 브라우저 검증은 기존93 + 신규36 = **129개 통과**, 최종 결과에서 실패/skip/flaky 0이다. 기존 단위·브라우저 테스트 파일은 수정하지 않았다. UI 시험에는 fresh Worker로 같은 reset 프로그램을 다시 실행해 one-shot 상태가 새로 시작되는 검증도 포함한다. 동일 Worker의 abort를 건너뛰어 두 번째 reset을 실행시키지 않았다. 공개 재부팅 입력 모두 원래 abort에 도달하고 null function 재발은 없었다. 일반 프로그램은 키보드/화면/DOS shell exit 및 종료가 유지됐다.

26개 A/B는 두 엔진에서 각각 FAR CALL, FAR JMP, RETF, IRET, BIOS INT10, EIP 경계, 의도적 FFFF corridor, INT18, INT19, CR0 mode 왕복, MZ entry0의 11개 입력과 정상 child return, 일반 DOS 입력/종료 2개를 실행한 것이다. MZ/COM 모두 직접 작성한 시험 코드다. 함수 호출 스택·게임 원인은 이 시험으로 확정하지 않는다.

검증은 로컬 Chrome의 `/porting-pj/ed4/`에서 수행했다. GitHub HTTPS의 새 배포나 Galaxy 실행으로 기록하지 않는다. 모바일 크기/오프라인 테스트가 Galaxy 실기 성능 검증을 대신하지 않는다.

## 성능·메모리

구조체 sizeof 검증 결과 State80, Record212, Entry312, Anchor8804 bytes. 기존 마지막128 ring은 27,136 bytes이며 현재 레코드, 최근8 EXEC, pinned target, 8개 anchor를 합한 고정 구조체는 **100,588 bytes(약98.2KiB)**다. 별도 scalar, 함수 stack, WASM heap 전체, JS 변환·JSON 문자열·다운로드 복사 비용은 이 수치에 포함되지 않는다. Phase9-3의 같은 구조체 합계17,240 bytes보다83,348 bytes 증가했다.

계측은 normal core 매 명령에서 상태 복사·조건 비교를 추가하므로 CPU 비용이 있다. anchors는 각 종류 최초에만 24개를 복사하고 이후16개가 차면 추가 복사를 중단한다. JS 메시지는 reset 시1회다. **Galaxy FPS·메모리 피크·500MB 게임 성능은 측정하지 않았다.** PC 브라우저의 기능 시험 소요 시간을 모바일 성능 수치로 환산하지 않는다. 공개 corridor의 원시 metadata JSON은 UTF-8 minified 기준 251,846 bytes였으며 4,201개 명령/4,091개 덮어쓰기에서도 6개 최초 anchors가 유지됐다. 첫 CSFFFF sequence77, 첫 EIP초과 sequence93, 마지막 FAR CALL sequence4219로 구분됐다. 이 숫자는 해당 합성 프로그램의 결과이며 게임의 명령 수가 아니다.

`first-bios-region`은 정상 INT10 시험에서 interruptNumber16으로 기록됐고, 뒤의 reset과 별도였다. 공개 CR0 왕복 시험에서 최초 real→protected 이벤트와 이후 protected→real 기록, 발생 횟수2가 보존됐다. INT18/INT19는 각각 기존 route1/2, reset은 route3으로 구별됐으며 A/B 최종 제어 전이가 일치했다. `scripts/check-phase9-4-evidence.mjs`가 11개 재부팅 입력의 route/abort/마지막 전이를 독립 대조한다.

## Galaxy 절차와 안전한 선택

1. 사용자가 GitHub Desktop에서 변경을 검토해 Commit/Push한 뒤 Pages 업데이트를 기다린다. Codex는 Commit/Push하지 않았다.
2. 온라인에서 기존 실행기 탭/PWA를 모두 닫았다가 다시 연다. 사이트 데이터는 삭제하지 않는다. 기존 폴더·RAW·세이브 재등록은 필요 없다.
3. 기존 프로필 → 고급 설정 → 부팅 진단 → GAME.BAT. 엔진에서 **Phase 9-4 최초 주소·모드 관측 · 저장 안 함**을 명시적으로 선택한다. CPU/메모리/사운드/RAW 조건은 이전 시험과 같게 둔다.
4. 임시 진단 실행 후 reset 관측 메시지를 기다리고 진단 JSON을 내려받는다. 수집 후 종료한다. 정상 저장이 아니라 진단 변경분 폐기이며 안정 엔진 선택으로 바로 돌아갈 수 있다.
5. `engine.artifact.id=phase9-4`, 실제 WASM 해시(위 값), `worker.bootstrap=ready`, `engine.cpuHistory.revision=phase9-4-first-1`, `history.first.armed=true`를 확인한다.
6. `targetEntry.prepared`와 `firstInstruction.before`, `first-cs-ffff`, `first-real-eip-wide`, `first-bios-region`, `first-unattributed-cs-change`를 sequence/epoch순으로 비교한다. 각 anchor의 before/event/after, lastExec, continuity, fetchConfirmed와 마지막 ring을 함께 전달한다. anchors 배열의 순서는 발생 순서가 아니라 유형 순서다.
7. 없거나 `armed=false`인 항목은 미관측이다. `entryObserved`는 첫 명령 관측만 의미하며 게임 초기화 성공이 아니다. 최초 CSFFFF, EIP초과, 실제 비정상 전이는 다른 시점일 수 있다.

선택은 저장되지 않는다. 기본 안정 엔진 및 Phase9-2/9-3은 유지한다. Phase9-4 전용 진입·공용 Worker는 각각 내용 해시 URL로 고정한다. 기존 공용 Worker를 그대로 두고, 동일 소스에서 phase9-4 allowlist와 호환 marker만 생성한다. 빌드 시 원문/해시/진입 파일/manifest/offline cache 일치를 검증한다. 불일치는 명시적으로 실패하고 다른 엔진으로 자동 전환하지 않는다.

## 미확정 원인과 다음 판단

Galaxy의 최초 CSFFFF 진입이 명시적 FAR 전이인지, 반환/인터럽트인지, host/direct CPU state 변경인지, 다른 core의 관측 공백인지 아직 알 수 없다. EIP 경계 초과가 잘못된 초기 전이의 후속 현상인지 독립된 CPU 호환성 문제인지도 미확정이다. 이번 합성 corridor는 가능한 관측 형식을 보여 줄 뿐 게임의 원인을 재현한 것으로 보지 않는다.

추가 Galaxy JSON에서 최초 anchors를 확인한 뒤 해당 명령/API/복귀 경로를 최소 수정 후보로 좁힌다. 현재 적용하지 않은 수정: EIP 마스킹, hidden segment limit 변경, A20 변경, interrupt/return 주소 수정, CPU 예외 무시, 게임/로더 바이너리 수정. 원인 확인 전에는 적용하지 않는다.


## 배포·변경 파일과 보존 확인

- 앱 연결: `src/engine.ts`, `src/experimental-engine.ts`, `src/main.ts`, 신규 `src/first-anomaly.ts`, `src/generated/phase9-4-worker.ts`. 기존 select에 일회성 엔진 선택지만 추가했고 CSS/레이아웃 변경은 없다.
- 네이티브/재현: `scripts/phase9-4/`, `prepare-phase9-4.mjs`, `build-phase9-4.sh`, `package-phase9-4.mjs`, `check-phase9-4*.mjs`, `phase9-4-probes.*`.
- Worker 생성/빌드: `phase9-4-common.mjs`, `phase9-4-worker-bundle.mjs`, `prepare-phase9-4-worker.mjs`, `prepare-phase9-4-assets.mjs`, `prepare.mjs`, `package-source.mjs`, `package.json`, `.gitignore`, `.gitattributes`.
- 공개 산출물: `docs/ed4/vendor/experimental/phase9-4/`, 전용 Worker/manifest, `licenses/phase9-4-engine.json`, GPL source ZIP과 NOTICE. Vite가 앱 JS/index/SW/런처 source ZIP을 갱신했다. `docs/index.html`, Vite base, manifest scope, 기존 Worker와 바이너리는 유지됐다.
- 시험/문서: `tests/first-anomaly.test.ts`, `tests/first-worker-bundle.test.ts`, `tests/phase9-4*/`, 새 Playwright config 및 캐시 시험 서버, 이 보고서, `GALAXY_TEST_GUIDE.md`.

보존 검사에서 기존 엔진·네이티브 템플릿·테스트·이전 Worker 등 78개 기준 파일의 바이트 해시가 일치했다. CSS 해시도 동일하다. 원본 안정 WASM은 `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf`, Phase9-2는 `d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc`, Phase9-3은 `a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b` 그대로다.

Phase9-4 공용 Worker SHA-256 `c870f43a6903b8571754de5fb7749aa5c36db18573628d2e6caa3246f16e23a8`, 진입 Worker `702d46e27480c30805c51e9d7f16dd5c86abe9bc3553802150c1014135df7f93`. GPL ZIP SHA-256 `845783c9038cc727ef2e7ceb3509cdf0c9376aa34874f4b8aeeed8b59d4adaa9`, 601개 소스 항목/2,738,474 bytes. 빌드·HTTP 시험은 실제 파일 바이트와 manifest를 대조했다.

`docs/` 및 GPL/런처 source ZIP에서 상용 실행 파일·음악·세이브 payload를 포함하지 않는지 검사했다. 유일한 배포 DOS 프로그램은 기존 자체 제작 CC0 테스트 ZIP이다. 합성 RAW 파일도 기존 Vite 배포 제외 정책을 유지한다. 테스트용 브라우저의 합성 데이터만 사용했고 사용자의 IndexedDB/OPFS에는 접근하지 않았다. 파일당100MiB 초과는 없으며 가장 큰 배포 파일은 위 GPL ZIP이다.

Git HEAD `2702eefcd9619f80641c9c75ca3b35ac0255c11a` 및 이력은 유지했고 staged 변경은 없다. 원격 설정 변경·Git Commit/Push·자동 배포는 수행하지 않았다. 사용자가 변경 파일과 갱신된 docs를 함께 검토해 반영한다.
