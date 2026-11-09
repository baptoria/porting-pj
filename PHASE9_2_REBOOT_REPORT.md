# Phase 9-2 — BIOS 재부팅 진입 계측 및 Galaxy 준비

2026-11-09. 프로젝트 `D:\porting\ed4-mobile`, Pages 경로 `/porting-pj/ed4/` 유지.

## 판정

**공개 DOS 시험에서 INT 18h, INT 19h, Reset Vector를 구별하고 전이 직전 CPU 상태를 기록하는 별도 엔진을 준비했다.** Phase 9-1의 Asyncify 보완은 유지했고 원래 `abort()`는 바꾸지 않았다. 공개 A/B 13개 및 런처 통합 4개가 통과한 빌드를 `docs/ed4/vendor/experimental/phase9-2/`에 추가했다. 기본 엔진은 기존 emulators 0.73.8 그대로다.

**실제 ED4가 BIOS 경로에 진입하는 이유는 아직 미확정이다.** 이번에 상용 게임을 PC에서 실행하지 않았고 Galaxy 실기도 수행하지 않았다. 준비된 진단을 사용자가 Galaxy에서 실행한 결과가 필요하다. 재부팅 안내 후 `RuntimeError: Aborted`는 여전히 발생하며 게임 성공이나 정상 재부팅/자동 종료로 보고하지 않는다. GitHub Commit/Push 및 실제 HTTPS 배포는 수행하지 않았다.

## 참고 자료와 작업 범위

`PHASE8_ROOT_CAUSE_REPORT.md`, `PHASE8_WASM_SYMBOL_MAP.md`, `PHASE8_FIX_PLAN.md`, `PHASE9_1_ASYNCIFY_REPORT.md`, `WASM_ERROR_ANALYSIS.md` 모두 실제로 존재하며 확인했다. 기존 런처, Phase 6/7 진단, 저장 방어 코드와 회귀 테스트도 대조했다. Phase 8 문서의 ‘아직 재빌드하지 않음’은 당시 상태이며 Phase 9-1 A/B 결과로 갱신해서 해석한다.

Phase 9-1 공개 재현은 기존 엔진의 재부팅 처리 중 Asyncify 누락에 따른 null 트랩을 입증했다. 이번에는 그 수정 목록을 그대로 복사했고 추가 Asyncify 변경은 없다. 사용자 제공 DRIVER → LOADER → LOGO → dpmi16bi.ovl → RTM → ED4 요청 순서를 기존 Galaxy 관측으로만 사용했다. 새로운 Galaxy JSON이나 게임 바이트를 확보했다고 가정하지 않았다.

고정 원본 대응 소스 commit은 `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`, 원본 ZIP SHA-256은 `884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840`이다. 원본과 Phase 9-1 사본을 보존하고 `artifacts/phase9-2/source/instrumented/`만 수정했다.

## 실제 엔진 소스 변경

아래 경로는 실험 소스 루트를 기준으로 한다. 패치는 `scripts/prepare-phase9-2.mjs`, 새 계측 구현은 `scripts/phase9-2/ed4_trace.h` 및 `ed4_trace.inc`에 재현 가능하게 보관했다. 변경 전후 해시는 `artifacts/phase9-2/source-changes.json`과 배포 대응 소스 ZIP의 `PHASE9_2_CHANGES.json`에 있다.

| 파일 | 실제 변경 |
| --- | --- |
| `native/dosbox/src/ints/bios.cpp` | 등록된 reboot 콜백/POST 주소와 콜백 번호를 관측기에 전달. Reboot_Handler 첫 줄 및 원래 abort 직전에 관측 호출 추가. |
| `native/dosbox/src/cpu/cpu.cpp` | CPU_Interrupt의 기존 FillFlags 직후 사전 상태, 실제 real-mode 목적지, real/v86 far jump 직전 관측. 계측 구현 include 추가. |
| `native/dosbox/src/cpu/core_normal.cpp` | LOADIP 후 현재 명령 주소로 직접 경로의 연속성을 확인. 보통은 플래그/주소 조건 검사만 수행. |
| `native/dosbox/src/dosbox.cpp` | 기존 콜백 dispatch 직전에 반환된 콜백 번호를 확인. |
| `native/dosbox/src/dos/dos.cpp` | INT 21h/AH=4Bh 요청 직전과 DOS_Execute 반환 직후의 결과를 관측. 원래 실패 처리/CF/AX 설정 유지. |
| `native/dosbox/include/ed4_trace.h` | 새 관측 함수 선언. |
| `native/dosbox/src/cpu/ed4_trace.inc` | 새 동기식 메타데이터 송신, 경로 연결 상태, 읽기 전용 레지스터/EXEC 관측. |

기존 5개 C++ 파일 + 새 2개 파일이다. `native/dosbox-jsdos/asyncify.txt`는 Phase 9-1 fixed와 바이트가 같다. 원본과 비교하면 Phase 9-1에서 추가한 `Reboot_Handler()` 한 항목도 포함된다. CPU 계산·인터럽트 처리 결과·메모리 할당·DPMI·사운드·abort의 실행 의미를 바꾸는 패치는 없다. BIOS 벡터/스텁도 계측을 위해 교체하지 않았다.

## 경로 구별 방식과 한계

고정 소스 `bios.cpp:1112~1135`는 INT 18h와 19h를 같은 real-mode callback 주소에 연결하고, 물리 `0xFFFF0` → POST → 같은 callback의 far jump를 설치한다. 따라서 핸들러 이름이나 마지막 인터럽트 전역 변수만으로 경로를 판단할 수 없다.

1. **INT 18h / INT 19h:** CPU_Interrupt 진입 때 번호·type·return EIP와 CPU 상태를 기록한다. 실제 real-mode 전이 목적지가 등록된 reboot 스텁이고 normal core의 바로 다음 명령 fetch가 그 주소일 때만 연결한다. 그 스텁의 callback 반환 번호까지 일치한 뒤 Reboot_Handler에 들어가야 확정 경로로 기록한다.
2. **Reset Vector:** normal core가 real, non-paged 상태에서 `0xFFFF0`을 실제 명령 시작 주소로 관측한 뒤 POST, callback 주소를 연속해서 밟고 등록된 callback으로 dispatch해야 확정한다. 해당 주소로 가는 real/v86 far jump 직전 상태도 별도 기록하며, 그 관측이 없으면 사전 상태를 만들어내지 않는다. 보호/페이징 모드의 같은 선형 주소를 물리 BIOS 주소라고 간주하지 않는다.
3. **unknown:** 직접 callback으로 점프, 변경된 벡터의 사용자 핸들러, 중간 인터럽트/다른 명령, 다른 CPU core 또는 보호/페이징 주소 등으로 위 연결을 증명하지 못하면 unknown과 이유를 기록한다. 오래된 INT 18h 관측을 나중 callback에 붙이지 않는다. 보호 모드 interrupt 요청 자체는 이벤트에 남을 수 있지만 real-mode 직접 경로로 승격하지 않는다.

코어 설정을 강제로 바꾸지 않는다. 기존 런처는 `core=auto`, `cputype=auto`; 이 WASM 타깃의 고정 소스에서 auto의 초기 실행기는 normal이다. 게스트 명령이 core를 바꾸거나 예외/사용자 벡터를 거치면 보수적으로 unknown이 될 수 있다. protected-mode의 복잡한 경로 전체를 해석하는 계측은 이번 범위에 없다.

관측된 `int18/int19`는 **DOSBox가 해당 인터럽트 경로를 수행했다는 증거**다. 게임이 의도적으로 재부팅을 요청했다는 판단이나 호출자 바이너리의 정체까지 증명하지는 않는다. 잘못된 PC에서 우연히 INT 명령을 실행했을 가능성도 아직 별개다.

## CPU·EXEC 데이터의 의미

`engine.reboot`에는 최근 128개 유효 이벤트, 최초 reboot 이벤트와 그때 연결된 사전 이벤트를 따로 보관한다. 이벤트 sequence는 Worker 세션별 단조 증가값이며 누락·중복/순서 오류 카운터도 내보낸다. 전송 객체에서 허용한 숫자/문자 필드만 복사한다.

| 데이터 | 관측 시점 및 제한 |
| --- | --- |
| `preTransfer.cpu.cs/ss/flags/cr0/protectedMode/psp` | 인터럽트/far jump **전**. FLAGS는 기존 lazy flag getter로 읽기만 한다. 추가 FillFlags/CPU_SetFlags 호출 없음. |
| `firstReboot.cpu` | 실제 callback dispatch 이후 Reboot_Handler의 화면 모드 변경 **전**. 이미 BIOS 주소로 이동한 **사후 상태**다. |
| `eip`, `returnIp` | eip는 디코더의 저장된 EIP 레지스터이며 모든 경우 현재 opcode 시작 주소라고 주장하지 않는다. returnIp는 CPU API로 전달된 반환/다음 EIP이며 이를 역산해 명령 바이트를 추정하지 않는다. |
| reset-entry | 주소 전이 후 reset 명령 실행 전 관측. 사전 jump 기록 없이도 entry는 보일 수 있고 이때 preTransfer는 비어 있다. |
| `psp` | DOS 현재 PSP segment 두 바이트의 제한된 컨텍스트 정보. PSP 메모리/명령 tail/환경/프로그램 내용은 수집하지 않는다. 보호 모드 task 식별자와 동일시하지 않는다. |
| `lastExec.id/program/mode/result/errorCode` | INT 21h/AH=4Bh의 마지막 관측. program은 최대 64자 basename만 저장하고 경로/인수는 제외한다. mode는 원래 AL 값. 실패 시에만 dos.errorcode를 유효 오류로 내보내며 성공 시 null이다. 모든 DOS 호출의 마지막 오류나 프로그램 exit code는 아니다. |
| `loader-prepared` | DOS_Execute가 true로 반환해 load/overlay/전이 준비를 마쳤다는 뜻. **CPU가 게임 초기화를 완료했다는 뜻이 아니다.** |
| before-abort | 원래 C++ abort() 직전. 실제 RuntimeError 스택과 함께 본다. |

메모리 덤프, 스택 바이트, 파일 내용, RAW/세이브 바이트는 새 이벤트에 포함하지 않는다. EM_JS 송신은 동기식이며 await/yield를 추가하지 않는다. 송신 예외는 계측 안에서만 막아 관측 실패가 게스트 동작을 변경하지 않게 한다. **CPU 오류/abort 예외를 무시하는 코드는 아니다.** 기존 진단의 프로필 이름·DOS 상대 경로·stdout 항목은 기존과 같으므로 공유 전에 확인한다.

## DOS 실행 흐름 조사와 남은 후보

고정 원본 소스 기준:

- `dos.cpp:810~820`: Execute 로그는 DOS_Execute 호출 전이다. 실패하면 AX=dos.errorcode, CF=true를 반환한다. 이번에는 호출 전후를 각각 기록해 이전 로그의 한계를 보완했다.
- `dos_execute.cpp:258~365`: 실행 mode 확인, 파일 열기/헤더 읽기, COM 또는 MZ 구분, 환경과 메모리 할당. 빈 파일·없는 파일·메모리 부족 등의 false 반환 경로가 있다. 메모리 할당 내부의 예기치 않은 실패에는 E_Exit도 있으므로 모든 실패를 같은 DOS 오류로 일반화하지 않는다.
- `dos_execute.cpp:365~420`: COM/MZ 로딩, MZ 재배치, PSP 및 시작 CS:IP/SS:SP 준비. overlay mode는 일반 프로그램 전이와 다르다.
- `dos_execute.cpp:425~505`: 부모 스택/벡터와 PSP를 저장·전환하고 LOADNGO는 RETF가 실행될 스택을 준비한다. 반환 true 시점에는 아직 다음 게스트 명령이 실행되지 않았다.
- `dos_execute.cpp:106~170`: DOS_Terminate는 부모 PSP, SS:SP, INT 22h 반환 주소 및 저장 레지스터를 복구한다. 이 경로를 이번에 수정하거나 ‘정상’으로 강제하지 않았다.
- `cpu.cpp:550~1000` 부근: real/protected interrupt 처리는 다르며 gate·selector·privilege·exception 경로가 있다. `dos_misc.cpp:46`의 INT 2F multiplex와 게스트가 설치하는 벡터도 구별해야 한다. 고정 내장 multiplex의 switch만으로 RTM/DPMI 동작이나 특정 설치본 호환성을 확정할 수 없다.

DOS_Execute의 일반 실패 반환에서 Reboot_Handler로 직접 호출하는 코드는 찾지 못했다. ‘ED4 Execute 다음 reboot’라는 시간 순서만으로 ‘ED4 로딩 실패가 자동 reboot를 호출했다’고 결론내릴 수 없다.

| 가설 | 현재 근거 | 구분할 새 증거 / 한계 |
| --- | --- | --- |
| A 게임/로더가 BIOS INT를 수행 | 사용자 스택은 Reboot_Handler까지 도달. 여러 로더/ED4 요청 뒤 발생. | `int18/int19` + 사전 CS/SS/PSP + software interrupt type이 좁히는 단서. 어느 프로그램이 왜 호출했는지, 의도한 명령인지까지는 미확정. |
| B DOSBox 실행 오류로 잘못된 주소에 이동 | 실제 로딩 성공/실패 및 목적지 상태가 과거에는 없었다. | failed EXEC의 코드와 PSP, 이후 pre-transfer/unknown 관측 비교. 공개 missing-file 시험은 오류 2와 부모 PSP를 정상 보존했다. 실제 게임의 다른 실패 경로를 반증하지는 않는다. |
| C 보호 모드/DPMI/컨텍스트 복귀 문제 | dpmi16bi.ovl/RTM/ED4 요청 순서가 사용자 로그에 있다. | CR0/pmode, EXEC mode·결과, PSP 변화가 단서. reboot 순간 real-mode여도 이전의 보호 모드 실패를 배제할 수 없다. unknown을 DPMI 오류로 자동 해석하지 않는다. |

어느 가설도 실제 Galaxy Phase 9-2 자료 없이 확정하지 않는다. 잘못된 DOS 명령 치환, 게임/사운드 파일 교체, EFC/RAW 삭제, CPU 오류 건너뛰기를 적용하지 않았다.

## 빌드와 아티팩트

기존 Phase 9-1 프로젝트 내 SDK를 재사용했다. 추가 대규모 다운로드, 전역 설치, 시스템 도구 교체는 없다. WSL Ubuntu-24.04, 공식 emsdk 3.1.21의 Emscripten `3.1.21-git` (`f9e81472f1ce541eddece1d27c3632e148e9031a`), LLVM SDK build `a16a8bca2466eb144f7c93fa899c0272c8815dc3`, Node 14.18.2, CMake 3.24.2, Ninja 1.11.1을 사용했다. 호스트 OS/Python은 Phase 9-1과 같으며 원래 Docker OS까지 바이트 단위 재현했다고 주장하지 않는다.

기존 `-Oz`, thin LTO, C++03/11 파일별 설정, ASSERTIONS=0, SAFE_HEAP=0, stack 1MiB, 초기 메모리 64MiB/growth, 기존 Asyncify whitelist/imports를 유지했다. 기존 15개 Asyncify 목록 경고도 그대로 남는다. 실제 명령은 `artifacts/phase9-2/logs/commands.txt`, 빌드 출력은 `logs/build.log`에 있다.

| 아티팩트 | bytes | SHA-256 |
| --- | ---: | --- |
| 기존 안정 WASM (보존) | 1,462,485 | `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf` |
| Phase 9-1 fixed WASM (보존) | 1,462,799 | `5c0378dd9f34df6ac263505a12b88650d1dfc8df5bfea921cd4aafb9e676ac10` |
| Phase 9-2 최종 WASM | 1,464,247 | `d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc` |
| Phase 9-2 JS + 원래 worker footer | 126,497 | `5434c4f33a07343387982d10b2d97e26c1f5f667fd36f350de39332aa2d18c5a` |
| Phase 9-2 symbols | 239,663 | `2a236b8f8c4e37f6877f6075beaf1bf80a13f2a9aa72b4f4480b79c7f535b99a` |
| Phase 9-2 대응 소스 ZIP | 597 entries | `96fe5a21e15c84b93b2915eb794065face69d88a599c3d85fd59df626c8536d8` |

최종 바이너리의 abort 스택은 `Reboot_Handler` **2616:0xf721d**, 다음 `Normal_Loop` 2689다. 기존 WASM의 함수 번호/오프셋을 새 바이너리에 그대로 적용하지 않는다. 동봉된 새 symbol map과 대조했다. 이전 계측 초안 `977c92a3…`는 최종 배포본이 아니며 `artifacts/phase9-2/engines/instrumented-v1/`에 보존했다.

```powershell
node scripts/prepare-phase9-2.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-2.sh
node scripts/package-phase9-2.mjs
npx playwright test --config playwright.phase9-2.config.ts
node scripts/package-phase9-2.mjs --deploy
npm run build
npm test
npx playwright test
npx playwright test --config playwright.phase9-2-ui.config.ts
npm run test:pages
node scripts/check-phase9-2.mjs
```

prepare는 최초 생성용이며 이미 있는 사본을 덮어쓰지 않는다. 재빌드만 할 때는 두 번째 명령부터 실행한다. `--deploy`는 **로컬 public/ 준비**이며 업로드가 아니다. public 시험 결과와 실제 시험한 WASM 해시가 맞아야 패키징한다. 배포 대응 소스 ZIP은 전체 고정 소스 + 변경 내역 + 독립 `BUILD.md`를 포함한다. 새 checkout의 일반 앱 빌드는 검증된 `docs/ed4/vendor/experimental/phase9-2/`에서 public 사본을 복구하므로 SDK가 없어도 된다. 일반 빌드에서 임의로 다른 엔진을 다운로드하지 않는다.

## 공개 A/B와 회귀 검증

PC Chrome 157, Playwright 1.56.1, 격리 브라우저 컨텍스트, 자체 작성 CC0 COM과 합성 RAW만 사용했다. A/B는 Phase 9-1 fixed와 Phase 9-2를 동일 번들/설정으로 비교했다. 기본 URL을 시험 중 라우팅한 A/B JSON의 안정 엔진 라벨 대신 `result.json → engine.wasmSha256`의 실제 응답 해시를 사용한다. 정식 선택 UI 시험에서는 실제 컴파일한 모듈 해시가 런처 JSON에 기록되는 것도 별도 검증했다.

| 입력 | Phase 9-1 fixed | Phase 9-2 최종 |
| --- | --- | --- |
| INT 18h | null 없음, 원래 Aborted | `int18`, 사전/사후 CPU, before-abort, 원래 Aborted |
| INT 19h | null 없음, 원래 Aborted | `int19`, 사전/사후 CPU, before-abort, 원래 Aborted |
| far JMP F000:FFF0 | null 없음, 원래 Aborted | `reset-vector`, jump 전/FFFF0 진입/handler 상태, 원래 Aborted |
| 공개 DOS 키보드/화면/런처 종료 | 통과 | 통과 |
| DOS 반환 후 셸 exit | ws-exit, 오류 없음 | ws-exit, 오류 없음 |
| INT 19 벡터 주소에 직접 RETF | 별도 비교 대상 아님 | `unknown`, INT 19로 오인하지 않음 |
| 변경된 INT 18 벡터에서 반환 후 직접 callback | 별도 비교 대상 아님 | `unknown`, 오래된 INT 18 연결 안 함 |
| MISSING.COM EXEC 실패 후 INT 18 | 별도 비교 대상 아님 | 오류 2, 같은 부모 PSP, 마지막 EXEC 실패 보존 |

공개 fixture의 세 사전 상태는 CS=SS=PSP=`0x0192`, FLAGS=`0x7202`, CR0=`0x10`, protectedMode=false였다. INT 사후 FLAGS=`0x7002`로 IF가 내려갔고 reset far-jump 사후에는 `0x7202`가 유지됐다. handler CS=`0xF000`. 이는 **공개 시험값이며 Galaxy/ED4의 값이 아니다.** INT origin sequence 5 → handler 6, reset jump 5 → reset entry 6 → handler 7로 기록됐다. 마지막 EXEC는 `ED4TEST.COM`, loader-prepared이며 유효 오류 코드는 없다.

재부팅 시험에서 `null function`이나 새로운 유형의 RuntimeError는 없었다. 의도된 `Aborted`는 남고 자동 ws-exit는 없다. 화면의 `Reboot requested, quitting now.`도 캡처에서 확인했다. 수동 런처 종료 후 Worker 정리를 확인했으며 이것을 BIOS의 정상 종료라고 부르지 않는다.

| 검증 | 결과 / 기록 |
| --- | --- |
| 작업 전 기존 단위 | 200/200 통과 |
| 작업 후 단위 | 210/210 통과 (기존 200 + 신규 10), `artifacts/phase9-2/unit-after.json` |
| 작업 전 기존 Chrome E2E | 38/38 통과, `regression-before.json` |
| 작업 후 기존 Chrome E2E | 38/38 통과, `regression-after.json` |
| 최종 공개 A/B | 13/13 통과, `public-tests.json`, `browser/*/result.json` |
| 최종 선택 UI·저장 보호·오프라인·GPL/해시 | 4/4 통과, `ui-tests.json`, `ui/*/reboot.json` 등 |
| 기존 Pages 하위 경로 통합 | 2/2 통과, `pages-tests.json` |
| TypeScript / production build | 통과 |

실패 기록도 보존했다. 신규 A/B 첫 실행의 8개 실패는 stop 클릭 직후 비동기 Worker 정리 전에 검사한 시험 코드 문제였다. 종료 완료를 poll하도록 고친 뒤 같은 기대 조건 13개가 통과했다(`browser-first`, `public-tests-first.json`). 신규 UI 첫 실행은 test fixture의 복수 실행 후보 선택 단계를 빠뜨려 3개가 실패했다. 동시에 신규 테스트의 TypeScript 인덱스 타입 오류로 build가 중단된 상태의 이전 배포본을 시험한 실행이었다. 타입과 등록 절차를 수정하고 성공한 새 build로 다시 검증했다(`ui-first`, `ui-tests-first.json`). 기존 테스트의 조건을 완화하거나 삭제하지 않았다. 경로 판별의 보호 모드 보완 이후 최종 WASM으로 A/B·UI를 재검증했다.

## Galaxy 선택·저장 보호·배포

기존 진단 대화상자에 **이번 진단의 엔진** 선택 한 항목만 추가했다. CSS·레이아웃·게임 UI 디자인은 수정하지 않았다. 일반 `게임 실행`과 진단 메뉴의 초기값은 안정 엔진이다. 실험 선택은 프로필/IndexedDB/localStorage에 저장하지 않으며 닫고 다시 열거나 다음 실행하면 기본값으로 돌아간다.

- 실험 실행은 `dos-worker-phase9-2.js` → 기존 공용 wrapper → `vendor/experimental/phase9-2/wdosbox.js`의 별도 경로다. 기본 vendor 파일을 교체하지 않는다.
- 부모가 실험 WASM 바이트의 SHA-256을 고정값과 비교하고 그 **동일 바이트를 컴파일한 WebAssembly.Module**을 Worker에 전달한다. 실험 Worker는 이 모듈 없이 네트워크/안정 WASM으로 fallback하지 않는다. `engine.artifact.verification=sha256-of-compiled-module`은 이 의미다. 안정 엔진은 기존 로더와 pinned-release-hash 표시를 유지한다.
- 진단 시작 전 기존 원본/모드/세이브/OPFS 참조를 그대로 읽는다. 기존 진단의 checkpoint 생략에 더해 실험 엔진 `save()`도 거부한다. 프로그램이 임시 파일을 작성/삭제해도 영구 저장하지 않는다.
- 공개 fixture로 기존 세이브 생성 → 실험에서 읽기/삭제 → 종료 → IndexedDB 전체 레코드 및 OPFS 파일 해시 동일 → 안정 엔진에서 다시 읽기를 검증했다. RAW도 다시 등록하지 않고 읽었다.
- 쿼리가 없는 별도 Worker 파일을 사용하므로 기존 SW의 정확한 캐시 키 방식으로 오프라인 로딩된다. 실험 파일은 앱의 기존 scope 캐시에 포함되고 대응 소스 ZIP은 기존 정책대로 precache에서 제외된다.
- 해시 불일치 시험에서는 실험 Worker를 생성하지 않고 안내와 실패 JSON을 남겼으며 원본/세이브/OPFS를 보존했다. 바로 안정 엔진으로 다시 실행했다.

새 바이너리·라이선스·심볼·manifest 및 대응 소스 ZIP은 `docs/ed4/`에 준비했다. 런처 GPL 소스 ZIP에도 변경 소스/스크립트/시험을 포함한다. `.gitignore`에는 검토된 실험 대응 소스 ZIP 두 경로만 예외로 추가했다. `scripts/check-phase9-2.mjs`는 안정 vendor, 기존 테스트, 루트 안내 페이지, manifest, Phase 9-1 엔진과 원본 소스 ZIP 보존을 확인한다. 배포물에 상용 게임/RAW/실제 세이브를 넣지 않았고 100MiB 초과 파일도 없다. 테스트 입력은 기존 공개 ZIP 및 합성 데이터뿐이다.

현재 Windows Git의 `core.autocrlf=true`를 확인했다. `.gitattributes`에서 실험 배포 파일은 `-text`, WSL 빌드 스크립트와 계측 템플릿은 LF로 고정해 Git Desktop Commit/checkout에 따른 해시 변화를 방지한다. Git 전역 설정은 바꾸지 않았다.

SDK와 public 엔진이 없는 별도 `artifacts/phase9-2/checkout-smoke/` 사본에서도 docs의 검토된 파일과 대응 소스 ZIP만으로 준비 스크립트가 성공하고 같은 최종 WASM 해시를 복구하는 것을 확인했다. 최종 앱 빌드의 실행 JS/CSS와 SW 캐시 버전은 회귀 테스트 때와 같고, 마지막 패키징에는 이 보고서와 Git 속성 파일까지 런처 소스 ZIP에 포함했다.

Galaxy 절차는 `GALAXY_TEST_GUIDE.md`의 Phase 9-2 항목에 있다. 사용자가 Commit/Push하고 사이트 업데이트를 받은 뒤 **엔진만** 바꾼 첫 비교 JSON을 수집한다. 기존 비교 preset은 SB16을 적용하므로 처음에는 기존 수동 진단으로 현재 설정을 그대로 유지한다. 기존 앱 리비전 `phase7-runtime-1`은 유지하며 엔진 id/hash와 `engine.reboot.revision=phase9-2-reboot-1`로 새 계측을 확인한다.

## 미검증·미적용 사항

실제 ED4/LOADER/RTM의 동작, Galaxy 성능·메모리 영향, 보호 모드/사용자 벡터의 모든 경로, 잘못된 반환 주소의 발생 지점은 미검증이다. 공개 시험 성공은 게임 실행 성공을 대신하지 않는다. 계측의 per-instruction 조건 검사·EXEC 메타데이터 송신은 오버헤드가 있으며 Galaxy 성능을 측정했다고 주장하지 않는다.

이번에 적용한 것은 읽기 전용 엔진 계측, 별도 검증 엔진과 일회성 선택/JSON 연결뿐이다. 재부팅을 정상 종료로 바꾸거나 원인 미상의 CPU/DPMI/게임 로직을 수정하지 않았다. 다음 수정 대상은 Galaxy에서 확보한 route, preTransfer, EXEC 결과, PSP, 오류 스택을 함께 본 뒤 결정해야 한다. 자동으로 다음 Phase를 진행하지 않는다.
