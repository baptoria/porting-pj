# WASM null function 분석

2026-11-09 / emulators 0.73.8 / Phase 7

## 현재 결론과 증거의 범위

Galaxy에서 사용자가 확인한 사실은 GAME.BAT 1·2행 반환, 3행 `DRIVER.EXE ED4.EXE` 진입, LOADER.COM / LOGO.EXE / RTM.EXE / ED4.EXE 실행 요청, 이후 화면·오디오·stdout 진행 없음, Worker의 `Uncaught RuntimeError: null function`이다. 상세 스택과 오류 직전 내부 상태는 아직 전달받지 않았다. **발생 C++ 함수, 실패한 함수 포인터, DPMI/사운드/RAW의 인과관계는 미확정이다.**

WebAssembly 간접 호출은 테이블의 null 참조 또는 기대 타입과 맞지 않는 대상 등에서 트랩할 수 있다. `null function`이라는 메시지만으로 특정 콜백이나 손상 원인을 정할 수 없다. 이는 브라우저의 WASM 실행 환경 예외이며 DOS 프로그램이 반환한 오류 코드와 구분한다. 게임 명령이 트리거일 수 있지만 그것만으로 게임 파일 불량을 입증하지 않는다. [WebAssembly 간접 호출 규칙](https://www.w3.org/TR/2024/WD-wasm-core-2-20240402/)

## 조사한 고정 자료

| 자료 | 확인값 |
| --- | --- |
| 엔진 | js-dos v7 계열, npm emulators 0.73.8 |
| 대응 소스 commit | aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5 |
| 대응 소스 ZIP SHA-256 | 884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840 |
| wdosbox.wasm | 1,462,485 bytes |
| WASM SHA-256 | 5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf |
| 동봉 wdosbox.js.symbols SHA-256 | 8e026e8603c3bec4935d7f85c415db961a936e2c0b6b43e5d8f9666b7bede64f |

바이너리 실측: import 함수 72개, 정의 함수 3,102개, 함수 인덱스 0~3173. funcref 테이블은 min/max 1598. active element segment 하나가 테이블 인덱스 1부터 1597개를 초기화하며 0번은 초기 null이다. 이는 정상적인 null 함수 포인터 표현일 수 있고 자체가 버그 증거는 아니다. **테이블 인덱스와 wasm-function 번호는 서로 다른 번호다.** name/DWARF custom section은 없다.

동일 npm 패키지에 `wdosbox.js.symbols`가 있어 함수 번호를 이름으로 대조할 수 있다. `scripts/inspect-wasm.mjs`는 배포 준비 WASM과 npm WASM의 바이트 일치, 패키지 버전, 심볼 수를 확인하고 함수 본문의 절대 파일 오프셋 범위를 기록한다. 별도 엔진 다운로드나 재빌드는 하지 않았다. 함수 심볼 맵은 함수 이름을 제공하지만 C++ 줄 번호와 인라인 호출 전체를 복구하지는 못한다. [Emscripten 디버깅 문서](https://emscripten.org/docs/porting/Debugging.html)

```powershell
node scripts/inspect-wasm.mjs
# Galaxy JSON의 실제 함수 번호/오프셋을 아래 인수에 넣는다.
node scripts/inspect-wasm.mjs 399 0x10cd7
```

위 399 예시는 맵 사용법 검증용 `CALLBACK_Idle`이며 실제 Galaxy 오류 위치가 아니다. 결과는 `artifacts/phase7/wasm-inventory.json`에 저장한다. 브라우저 오프셋이 절대 모듈 오프셋인지 먼저 확인하고 함수 범위와 대조한다. 다른 빌드나 테스트용 WASM 함수 번호를 이 맵에 적용하면 안 된다.

## 소스 경로별 조사

아래 줄 번호는 저장소의 고정 GPL 소스 ZIP 내부 `emulators/` 기준이다.

| 경로 | 확인한 동작 / 남은 한계 |
| --- | --- |
| `native/dosbox/src/dos/dos.cpp:810` | INT 21h/4Bh에서 `LOG_EXEC Execute`를 먼저 출력한 뒤 DOS_Execute를 호출한다. 반환 실패는 DOS 오류코드/캐리 플래그로 처리한다. EXEC 로그는 로딩 성공 로그가 아니다. |
| `native/dosbox/src/dos/dos_execute.cpp:258` | EXEC 모드 검사, DOS_OpenFile, 헤더 읽기, COM/MZ 구분, 환경/메모리 할당 순서다. 368행 이후 본문 읽기·재배치, 404행 PSP, 488행 LOADNGO의 CS:IP/SS:SP 및 복귀 흐름을 설정한다. 이름에 LOGO/RTM/ED4가 있다고 별도 성공을 보장하지 않는다. |
| `native/dosbox/src/cpu/cpu.cpp:1550` | CR0 보호 모드 전환과 paging 경로가 있고 `Protected mode` 로그를 출력한다. 이를 DPMI 초기화 성공과 동일시할 수 없다. |
| `native/dosbox/src/dos/dos_misc.cpp:184` | INT 2F multiplex에서 일부 168x 호출을 처리한다. 고정 소스에서 DPMI/1687 전용 경로는 검색으로 확인되지 않았다. 이 사실만으로 게스트 RTM의 DPMI 요구·제공 여부나 오류 원인을 결정할 수 없다. |
| `native/dosbox/src/dosbox.cpp:179` | Normal_Loop는 cpudecoder 함수 포인터를 호출한다. 183행은 범위 검사 후 CallBack_Handlers[ret]를 간접 호출한다. 이 호출은 조사 후보이며 실제 스택과 연결되지는 않았다. |
| `native/dosbox/src/cpu/callback.cpp:44` | CALLBACK_Allocate는 할당한 항목을 0으로 두고 후속 Setup이 핸들러를 설치한다. null의 존재만으로 이 경로가 실패했다고 판정하지 않는다. |
| `CMakeLists.txt:7,20~26` | -Oz, thin LTO, -fno-exceptions, ASSERTIONS=0, SAFE_HEAP=0, 스택 1MB, 초기 메모리 64MiB·성장 허용, emit-symbol-map 설정. |
| `src/dos/dosbox/dosbox.cmake:31` | ASYNCIFY=1, syncSleep import와 고정 whitelist 사용. Asyncify 경로 역시 스택 확보 전에는 원인으로 확정하지 않는다. |

고정 심볼 맵의 예: `Normal_Loop()`=2686, `CPU_Core_Normal_Run()`=2004, `CALLBACK_Idle`=399. 이 번호가 Galaxy 스택에 실제 나타났다고 주장하지 않는다. DOS_Execute는 독립된 같은 이름의 심볼이 검색되지 않아 함수 이름만으로 매핑할 수 없다. 최적화/인라인을 고려해야 하며 소스 줄을 추정해 확정하면 안 된다.

LOGO.EXE / RTM.EXE / LOADER.COM의 실제 바이트와 내부 코드는 조사하지 않았다. 사용자에게서 받은 것은 실행 요청 관측이며, 파일 이름만으로 DPMI 제공자·버전·초기화 성공·필수 파일 여부를 단정하지 않는다. 현재 설치본의 순서를 보존한다. 다른 RTM, LOADER, 사운드 드라이버를 교체하지 않는다.

## Emscripten FS와 RAW 어댑터

현재 고정 `wdosbox.js`의 FS.read는 stream_ops.read 존재 여부를 검사하고 JS read 함수를 호출한다. 누락된 read 연산은 ErrnoError로 처리한다. 런처 RAW 어댑터는 읽기 전용 노드에 FileReaderSync 기반 read를 넣고 최대 1MiB 단위로 읽는다. OPFS File 참조를 읽으며 내용을 WASM 함수 테이블에 넣는 구현은 아니다.

이 구조만으로 연관성을 배제할 수 없다. Phase 7은 예외 시 `adapterOperation`, `musicMounted`, `musicReads`, `musicBytes`, `wasmHeapBytes` 숫자만 추가한다. RAW 마운트 생략 비교에서도 같은 스택인지 확인한다. `raw-read-complete`는 마지막 관측 작업 이름일 뿐 오류가 RAW 때문에 발생했다는 뜻은 아니다. 마운트 생략 시 게임이 더 이른 단계에서 종료한다면 오류가 안 나도 원인이 입증된 것이 아니다.

## 최소 수정 판단 순서

1. Galaxy에서 동일 기준 조건의 상세 JSON을 확보한다. 원본 오류 스택과 첫 오류의 source를 보존한다. onAbort의 관측용 JS 스택과 실제 RuntimeError 스택을 구분한다.
2. WASM 해시와 스택 모듈을 대조하고 함수 번호/오프셋을 같은 패키지 맵에 연결한다. 한 함수의 여러 간접 호출 중 어느 지점인지 추가 확인한다.
3. NOSOUND만, RAW 마운트만 바꾼 결과와 EXEC/프레임/오디오/FS 메타데이터를 비교한다.
4. JS 어댑터 예외로 좁혀지면 해당 연산만 수정하는 후보를 제시한다. 부작용은 RAW 경로·읽기·에러 반환 방식 변화이며 WASM 재빌드 없이 검증할 수 있다. 지금은 관련성이 확인되지 않아 수정하지 않았다.
5. 예를 들어 Normal_Loop의 null 콜백이 실제 지점으로 확인되면, 우선 실패 인덱스·호출 위치만 기록하고 중단하는 최소 진단 가드를 검토한다. 임의로 콜백을 건너뛰거나 성공으로 반환하는 패치는 제안하지 않는다. 엔진 소스 변경·재빌드가 필요하고 중단 시점/타이밍이 변할 수 있다. 실제 인덱스와 등록 경로가 없으므로 현재 적용하지 않는다.
6. 함수 이름만으로 부족하면 동일 도구체인의 심볼/소스맵 또는 assertion을 추가한 별도 재빌드 계획을 먼저 보고한다. 디버그 빌드는 크기·메모리·타이밍·Asyncify 특성을 바꿀 수 있고 기존 함수 번호와 직접 비교할 수 없다.

현재 적용한 것은 Worker 주변의 오류 관측과 일회성 비교 옵션이다. **WASM, 공급된 wdosbox.js, 게임 원본, 세이브를 패치하지 않았다.** 실제 위치가 특정되기 전에는 런타임 해결 패치를 완료했다고 보고하지 않는다.
