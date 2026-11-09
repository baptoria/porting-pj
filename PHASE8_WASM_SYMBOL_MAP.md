# Phase 8 — 동일 WASM 스택·명령 매핑

2026-11-09. 자료는 사용자가 프롬프트에 제공한 Galaxy 스택이다. `ed4-diagnostics (5).json`, `(6).json`은 프로젝트/상위 작업 폴더, Downloads, Desktop, Documents, Codex attachments에서 파일명 검색으로 발견하지 못했다. 아래 표는 해당 JSON을 읽었다는 주장이 아니다.

## 바이너리 동일성

- WASM SHA-256: `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf`
- public/vendor, docs/ed4/vendor, node_modules/emulators/dist의 WASM 세 파일이 동일하다.
- JS SHA-256: `80c871923d6265625a4ca3ee9799c2a856eeae6a88fc535a100fd5d98c004abc` — 같은 세 위치에서 동일.
- 동봉 `wdosbox.js.symbols`: `8e026e8603c3bec4935d7f85c415db961a936e2c0b6b43e5d8f9666b7bede64f`
- 대응 소스 ZIP: `884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840`, commit `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`.

## 전체 스택: 위가 가장 안쪽 프레임

본문 범위는 모듈 전체의 절대 바이트 오프셋이며 끝은 포함하지 않는다. 함수 시작은 locals 선언부터다.

| 순서 | 함수 번호 / 이름 | 본문 범위 | 제공 오프셋 | 실제 명령 |
| --- | --- | --- | --- | --- |
| 1 | 481 `DOSBOX_RunMachine()` | [0x14395, 0x1445b) | 0x14405 | `call_indirect (result i32)` |
| 2 | 379 `CALLBACK_RunRealInt(unsigned char)` | [0xfbc9, 0xfcd4) | 0xfc63 | `call $func481` |
| 3 | 2613 `Reboot_Handler()` | [0xf6b8d, 0xf6c66) | 0xf6bcb | `call $func379` (직전 인수 16 = INT 10h) |
| 4 | 2686 `Normal_Loop()` | [0xfea4c, 0xff4f0) | 0xfeef3 | `call_indirect (result i32)` — callback handler 호출 |
| 5 | 481 `DOSBOX_RunMachine()` | [0x14395, 0x1445b) | 0x14405 | `call_indirect (result i32)` — 바깥 정상 루프 호출 |
| 6 | 379 `CALLBACK_RunRealInt(unsigned char)` | [0xfbc9, 0xfcd4) | 0xfc63 | `call $func481` |
| 7 | 1926 `DOS_Shell::Execute(char*, char*)` | [0x73f95, 0x74714) | 0x74671 | `call $func379` (직전 인수 33 = INT 21h) |
| 8 | 813 `DOS_Shell::DoCommand(char*)` | [0x223b7, 0x22808) | 0x2255c | `call $func1926` |
| 9 | 428 `DOS_Shell::ParseLine(char*)` | [0x11b13, 0x12098) | 0x11f95 | `call $func813` |
| 10 | 3044 `DOS_Shell::Run()` | [0x119f36, 0x11a513) | 0x11a3f6 | `call $func428` |

10개 모두 해당 본문 범위 안의 **정확한 호출 opcode 시작점**과 일치했다. 함수 내 상대 오프셋/호스트 주소로 해석하면 이 일관성이 나오지 않는다. 따라서 제공 스택은 동일 WASM 전체에 대한 절대 바이트 오프셋으로 대조할 수 있다. 원본 Galaxy JSON의 브라우저 버전·전체 JS 프레임은 아직 확인하지 못했다.

## 역어셈블 방법과 검증

기존 `scripts/inspect-wasm.mjs`로 헤더/함수 본문과 동봉 심볼을 확인했다. 추가한 `scripts/analyze-phase8.mjs`는 Node 내장 V8 Inspector의 `Debugger.disassembleWasmModule` / `nextWasmDisassemblyChunk`로 552,957행을 해독하고 선택 함수만 보관한다. 모듈을 컴파일해 읽을 뿐 엔진을 instantiate/실행하지 않으며 새로운 도구를 다운로드하지 않았다. [CDP Debugger의 WASM 역어셈블 API](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)

재현 명령: `node scripts/analyze-phase8.mjs`. 결과는 Git 제외 폴더 `artifacts/phase8/stack-disassembly.json`, `selected-functions.wat.txt`, `hashes.json`에 있다. 추후 심볼이 다른 WASM이면 분석을 거부한다. 바이너리에는 C++ 줄 번호 DWARF가 없어 C++ 줄은 아래 소스 구조와 명령을 대조한 결과다.

## 481:0x14405에서 실제 호출하는 것

```text
0x143dc global.get $global3       ; Asyncify 상태
0x143de i32.eqz
0x143df if                       ; Normal(0)일 때만 다음 메모리 읽기
...
0x143ef i32.const 276624
0x143f3 i32.load                 ; 저장된 loop 포인터
0x143f6 local.set $var0
0x143f8 end
0x143f9 local.get $var2
0x143fb i32.const 0
0x143fd global.get $global3
0x143ff select
0x14400 i32.eqz
0x14401 if
0x14403 local.get $var0
0x14405 call_indirect (result i32)
```

소스 `native/dosbox/src/dosbox.cpp:363~370`의 `DOSBOX_RunMachine()` / `ret=(*loop)()`에 해당한다. **실패 대상은 함수 481 자체가 아니라 이 안에서 계산된 간접 호출 테이블 인덱스다.** 함수 2686은 이미 성공적으로 호출된 바깥 프레임이다.

함수 진입 시 i32 local은 0이다. Rewinding(2)이면 앞부분에서 Asyncify 스택의 local을 복원하고, Normal(0)이면 메모리의 loop를 읽는다. **Unwinding(1)인 채 새로 이 함수에 진입하면 둘 다 실행하지 않아 local $var0=0을 유지한다.** 이 상태에서 위 select/eqz 경로는 호출을 수행한다. 테이블 0은 null이므로 트랩한다. 이것은 실행 루프 메모리 주소 자체가 0으로 덮였다는 주장과 다르다.

동일 바이너리의 테이블 1은 `Normal_Loop()`(함수 2686)이다. 공개 재현에서 오류 직전 저장된 loop 값은 1, table[1]의 함수 이름은 `2686`, table[0]은 null이었다. 자세한 관측 범위는 ROOT_CAUSE 보고서에 있다.

## 379·2613·2686과 중복 경로

`Reboot_Handler()`의 0xf6bcb는 `bios.cpp:1013~1015`의 재부팅 안내 문자열 출력 반복문 안 `CALLBACK_RunRealInt(0x10)`이다. 초기 화면 모드 변경 호출은 다른 오프셋 0xf6b9e다. 즉 제공된 스택은 **재부팅 안내 문자를 BIOS INT 10h로 출력하는 중**의 재진입이다.

바깥 1926→379→481은 셸에서 프로그램을 실행하기 위한 INT 21h/AH=4Bh 경로(`shell_misc.cpp:540~549`)다. 그 실행 루프가 BIOS의 Reboot_Handler 콜백에 도달하고, 안내 출력용 INT 10h가 다시 379→481을 호출한다. 중복 프레임은 이 중첩 실행이며 동일 ED4 실행을 두 번 요청한 증거가 아니다.

`Normal_Loop()`의 CPU decoder 호출은 **0xfeea1**, 콜백 테이블 호출은 **0xfeef3**으로 구분됐다. 제공된 0xfeef3에서는 Reboot_Handler 안까지 진입했으므로 그 프레임의 콜백이 null이었다고 볼 수 없다. CPU decoder의 함수명 `CPU_Core_Normal_Run()`=2004는 이번 제공 스택에 없다.

## Asyncify 불일치

2613의 전체 본문에는 Asyncify 상태 global3에 대한 검사/스택 저장·복원이 없다. 379/481/2686에는 있다. 고정 `native/dosbox-jsdos/asyncify.txt`에도 `Reboot_Handler()`가 없고 그 하위의 `CALLBACK_RunRealInt`, `CALLBACK_Idle`, `DOSBOX_RunMachine`, `Normal_Loop`는 있다. 빌드는 `ASYNCIFY_WHITELIST`를 사용한다. 비동기 중단 가능한 호출 경로의 함수가 누락되면 정상 unwind/rewind가 보장되지 않는다. [Emscripten Asyncify 설정 설명](https://emscripten.org/docs/porting/asyncify.html)

그래서 Reboot_Handler는 하위 호출이 unwind로 일찍 반환해도 실행을 멈추지 않고 다음 BIOS 호출/idle 반복에 재진입할 수 있다. 이때의 481 local=0 경로가 정확한 트랩 후보이며, 공개 재현에서 Unwinding 상태까지 관측했다. Galaxy의 런타임 스칼라 자체를 읽은 것은 아니지만, 동일 해시·동일 최상단 opcode·동일 비계측 Reboot_Handler 경로와 일치한다.
