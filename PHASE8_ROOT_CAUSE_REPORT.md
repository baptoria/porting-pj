# Phase 8 — null function 원인 분석 결과

2026-11-09. 기존 Phase 1~7, NUL/붙은 스위치 수정 보고서, 현행 런처/어댑터/테스트 및 고정 대응 소스를 참고했다. 앱과 배포본은 `phase7-runtime-1` 그대로다.

## 핵심 결론

**직접 트랩 위치는 `DOSBOX_RunMachine()`의 실행 루프 간접 호출 `0x14405`다. CPU decoder나 DOSBox 콜백 테이블의 직접 null 호출로 볼 근거는 없다.** 제공된 실제 스택은 `Reboot_Handler()`가 BIOS 안내 문자를 출력하려고 INT 10h에 재진입하는 경로다.

같은 WASM에서 상용 게임 없는 공개 DOS 재부팅 probe로 동일 위치의 null function을 재현했다. 원인은 **Asyncify 대상에서 빠진 Reboot_Handler가 unwind 중 후속 호출을 계속해, Asyncify 변환된 실행 루프에 잘못 재진입하는 결함**으로 강하게 좁혀졌다. 공개 재현에서는 unwind 상태와 정상 loop 메모리 값을 확인했다. 최소 후보는 Asyncify 목록에 `Reboot_Handler()`를 추가하고 WASM을 재빌드하는 것이다. 아직 적용/재빌드하지 않았다.

다만 이것은 **재부팅/종료 처리 도중 생기는 엔진 트랩**을 설명한다. 왜 ED4 실행 흐름이 BIOS 재부팅 처리에 들어갔는지는 별도 미해결 문제다. 이 패치를 해도 게임이 실행되는 대신 정상적인 “Reboot requested, quitting now.” 종료로 바뀔 수 있다. 게임 해결 완료로 보고하지 않는다.

## 확정된 사실과 자료 범위

- 사용자가 제공한 GAME/NOSOUND 비교, 내부 실행 요청, RAW 53개·읽기 0, EFC 이름 공존을 사용자 실기 관측으로 사용했다. 원본 진단 JSON 5/6은 검색한 로컬 위치에서 발견하지 못했으며 만들어내지 않았다.
- 제공 스택 10개를 같은 SHA-256 WASM에 대응시켰고 모든 오프셋이 호출 명령 경계와 일치했다. 전체 표는 `PHASE8_WASM_SYMBOL_MAP.md`에 있다.
- 2613은 `Reboot_Handler()`이며 사용자 스택의 0xf6bcb는 그 안의 INT 10h 문자 출력이다. DOSBox는 INT 18h, INT 19h, reset vector 경로를 같은 Reboot_Handler로 연결한다(`bios.cpp:1112~1135`). 스택만으로 어느 진입 방식인지 정할 수 없다.
- 공개 INT 19h, INT 18h, reset-vector far jump 세 probe 모두 `481:0x14405`의 null function을 재현했다. 게임·사운드 드라이버·DPMI/RTM·RAW·EFC 없이도 발생한다.
- 공개 재현은 Reboot_Handler의 `CALLBACK_Idle` 호출(2613:0xf6c25→399:0x10d93)에서 실패했고, Galaxy 제공 스택은 문자 출력(2613:0xf6bcb→379:0xfc63)이다. 완전히 동일한 전체 스택이라고 주장하지 않는다. 공통 실패 지점과 비계측 부모 경로는 같다.
- 테스트 응답의 JS에 읽기 전용 catch 관측만 넣은 대조에서, 실제 RuntimeError를 잡은 직후/export wrapper finally 전에는 Asyncify.state=1, loop=1, table[1]=2686, table[0]=null이었다. 다시 던진 뒤 finally가 maybeStopUnwind를 수행해 Worker error 이벤트에서는 state=0으로 바뀌었다. 사후 state=0만 보고 Asyncify를 배제하면 안 된다.
- 481의 역어셈블은 unwind 중 새 진입 시 loop를 읽지 않고 default local=0으로 간접 호출할 수 있음을 보인다. 포인터 메모리 손상 없이도 설명된다. Galaxy의 실제 local 값을 직접 디버거로 읽었다고 주장하지 않는다.

## 가설별 판단

| 가설 | 근거 | 반증/제한 | 현재 판단 |
| --- | --- | --- | --- |
| A CPU decoder 포인터 오류 | Normal_Loop에 `(*cpudecoder)()` 존재 (`dosbox.cpp:179`) | 해당 opcode 0xfeea1은 최상단 실패 위치가 아니다. 실제 최상단은 481 loop 호출이고 공개 재현의 loop 메모리도 정상이다. | 직접 원인으로 지지되지 않음. 게스트가 재부팅 경로에 도달한 배경에 CPU 호환성이 있는지는 별도. |
| B 미초기화 콜백 호출 | CALLBACK_Allocate는 항목을 0으로 두고 Setup이 등록한다 (`callback.cpp:44~48,538~547`). | 스택의 콜백 dispatch 0xfeef3는 Reboot_Handler를 성공적으로 호출했다. null 콜백이었다면 그 안의 프레임이 나타나지 않는다. | 이 스택의 직접 원인으로 지지되지 않음. 임의 handler 건너뛰기 패치는 부적절. |
| C DPMI/보호 모드 문제 | dpmi16bi.ovl/RTM/ED4 실행 요청 뒤 BIOS reboot 경로 진입. CPU 보호 모드·INT 2F·DOS EXEC 경로 조사. | 공개 재부팅 probe는 DPMI 없이 같은 트랩을 만든다. 실제 파일 버전·CR0·INT 18/19 호출자·reset 진입 이유가 없다. | 게임 쪽 재부팅 유발 원인 후보로 남지만, null 트랩의 필요조건은 아님. |
| D Asyncify 누락/재진입 | Reboot_Handler whitelist 누락 + WASM 비계측 확인 + 하위 함수 계측 + 실제 unwind 중 트랩 + 정상 저장 loop. | 목록 보완 재빌드 A/B는 아직 수행하지 않음. Galaxy 스칼라 원자료는 없음. | 가장 강한 직접 원인 후보. 공개 재현의 결함 메커니즘은 소스/바이너리/상태 관측으로 설명 가능. |

DOS_Execute는 `dos.cpp:810~818`에서 EXEC 요청 로그 이후 호출되고, 파일 open/헤더/메모리/재배치 및 CS:IP 준비를 수행한다(`dos_execute.cpp:258~505`). EXEC 로그만으로 완료를 판정할 수 없다. INT 2F의 일부 multiplex 처리와 `cpu.cpp:1550` 보호 모드 전환도 확인했지만, 특정 RTM 호출이 실패했다는 기록은 없다. `dpmi16bi.ovl`과 `RTM.EXE` 이름은 Borland 16-bit DPMI/runtime 조합과 일치하는 단서지만 현재 설치 파일의 정체/버전/호환성을 입증하지 않는다. [해당 파일을 사용하는 ASEM 작성자의 설명](https://www.plit.de/asem-51/asemx.htm)

추가 소스 대조:

- `cpu.cpp:2306~2314`는 초기 decoder를 `CPU_Core_Normal_Run`으로 두고 core 설정에 따라 바꾼다. `core_normal.cpp:146~153`의 wrapper는 asyncify lock/unlock 사이에서 명령 실행 구현을 호출한다. HLT 경로의 decoder 교체/복원(`cpu.cpp:2035,2050`)도 존재하지만, 실제 스택의 실패 opcode는 이 decoder 호출이 아니다.
- `dos_misc.cpp:46~52`의 INT 2F handler는 등록된 multiplex 함수를 차례로 호출하고 처리되지 않은 AX를 로그로 남긴다. `1680/1689/168F` 처리는 `184~191`, callback 설치는 `205~209`다. 이 파일의 내장 switch에 `1687` DPMI 설치 확인 처리는 없지만, 게스트가 자체 DPMI 서버를 설치/연결할 수 있으므로 이것만으로 RTM 실패를 단정할 수 없다. 실제 INT 2F AX·반환값·호출자 자료가 필요하다.
- `CPU_SET_CRX`(`cpu.cpp:1550` 이후)는 CR0/보호 모드·페이징 전환을 담당한다. 제공된 로그에는 해당 전환의 실패나 예외 번호가 없어 LOGO/RTM/ED4 중 누가 재부팅을 유발했는지 구별할 수 없다.

## 비정상 DOS 명령

`ouGGuG ddggw`, `cgGe normal`, `oplggte 44100` 및 `Please run GAME.BAT!`는 고정 대응 소스와 런처에서 생성하는 문자열로 확인되지 않았다. 이전에 제공된 원본 GAME.BAT 5행에도 없다. 이번 NOSOUND 원문/원본 JSON/상용 로더 바이트가 없으므로 DRIVER, LOADER 또는 다른 프로그램 중 누가 생성했는지 확정할 수 없다. 실행 요청 순서만으로 직접 부모를 결정하지 않는다.

셸의 `DoCommand`는 토큰을 문자 단위로 복사하고 실행/설정 속성 조회에 실패하면 Illegal command를 출력한다(`shell_cmds.cpp:122~160`). 현재 분석에서 ASCII 문자를 G/g로 치환하는 규칙은 발견하지 못했다. 따라서 한글 글꼴 깨짐과 같은 현상으로 합치지 않는다. 실제 조립 오류·수정 로더의 문자열·메모리 오염·호환성 문제는 후보이며 원본 바이트 검사가 필요하다. 추측한 정상 명령으로 치환하지 않았다.

정확한 ASCII 명령 4개를 합성 BAT로 실행한 대조에서는 Illegal command 3건 뒤 후속 echo까지 진행했고 WASM 예외는 없었다. `cycles max`는 CheckConfig를 통해 `z:\config -set cpu ...`로 처리되는 유효 설정 경로다(`shell_cmds.cpp:107~119`). 이 실험은 잘못된 명령 **그 자체만으로** null function이 나지 않음을 보여준다. 실제 로더의 오류 처리나 재부팅과 무관하다고까지 증명하지는 않는다. LOADER.COM은 테스트하지 않았다.

또한 `cycles max`가 실행됐다면 런처 JSON의 초기 cycles와 실제 런타임 cycles가 달라질 수 있다. GAME/NOSOUND 비교에서 초기 설정을 유지했다는 사실만으로 게스트의 설정 변경까지 없었다고 가정하면 안 된다.

추가 판별은 Galaxy에서 DOS EXEC 부모 PSP/명령 꼬리의 제한된 메타데이터와 해당 셸 명령 직전 PSP를 연결하고, 실제 로더 내 문자열 존재를 읽기 전용으로 확인하는 순서가 적절하다. 메모리/파일 전체 덤프를 공개 JSON에 넣지 않는다.

## EFFECT 및 RAW

DOSBox `drive_cache.cpp:555~612`는 원본 이름과 짧은 이름을 분리하고 공백/긴 이름에 `~번호` alias를 만든다. 합성 `EFFECT/000.EFC`와 `EFFECT/000 (1).EFC`를 함께 등록한 실제 DOS 시험에서 `000.EFC`를 열어 ORIGINAL_EFC를 읽었고, DIR에는 `000` 및 `000(1)~1` 두 EFC가 별도로 보였다. 해당 두 이름만으로 원본 8.3 파일이 소실/덮어쓰기된다고 볼 근거는 없다. 실제 전체 디렉터리의 모든 alias 충돌을 증명한 시험은 아니다.

실제 오류 경로에서 EFC를 읽었다는 증거는 제공되지 않았다. RAW 읽기 0은 완료된 read chunk 누계이므로 실패한 첫 read 시도가 없었다는 보장도 아니지만, 현재 스택에는 RAW JS read 경로가 없고 음악 없는 공개 재부팅에서도 트랩한다. RAW 마운트 53개만으로 원인을 정하지 않는다. mount/메타데이터 관련 모든 간접 영향까지 완전히 배제한 것은 아니다. 파일 삭제·이름 변경은 수행하지 않았다.

## 실제 적용과 검증

적용한 것은 읽기 전용 WASM 분석 스크립트, 별도의 공개 분석 시험과 보고서다. 엔진/런처 수정, Asyncify 목록 패치, 상용 바이너리 변경, DB/OPFS 구조 변경은 **적용하지 않았다**. 앱 버전·docs/ed4·서비스 워커·GPL 배포 ZIP도 갱신하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 동일 해시/본문/호출 opcode | 제공 10프레임 모두 대조 통과 |
| 신규 분석 시험 | 6/6 통과 (현재 결함 재현 4, EFC 1, 비정상 명령 대조 1) |
| 기존 단위 테스트 | 200/200 통과 |
| TypeScript | 통과 |
| 기존 Chrome E2E | 38/38 통과 (3.1분) |
| 실제 ED4 / 패치된 엔진 / Galaxy 재검증 | 수행하지 않음 |

분석 시험에서 BIOS probe의 “통과”는 **결함이 재현됐음을 검증했다는 뜻**이며 엔진 정상/게임 성공을 의미하지 않는다. 초기 관측은 Worker error 시점의 state=0만 보였으나 finally 이전의 null RuntimeError로 관측 범위를 좁혀 state=1을 확보했다. 명령 대조는 키보드 Shift 합성 문제를 배제하기 위해 리터럴 BAT 바이트로 실행했다. 테스트 결과를 성공으로 꾸미기 위해 기존 조건을 완화하지 않았다.

재현: `node scripts/analyze-phase8.mjs`, `npx playwright test --config playwright.phase8.config.ts`. 증거는 `artifacts/phase8/`의 역어셈블, 해시, browser 하위 diagnostics/scalars/efc/commands JSON에 있다. 모두 공개 fixture 자료이며 실제 게임 JSON 5/6이 아니다. Commit/Push·원격 설정 변경을 하지 않았다.
