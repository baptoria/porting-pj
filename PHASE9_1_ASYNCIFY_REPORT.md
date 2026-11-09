# Phase 9-1 — Reboot_Handler Asyncify A/B 검증

2026-11-09. 로컬 공개 DOS 시험만 수행한다. 상용 영웅전설4 실행, 기본 엔진 교체, 배포 갱신은 범위 밖이다.

## 판정

**Reboot_Handler의 Asyncify 누락을 보완하면 세 공개 재부팅 경로의 `null function`이 사라진다는 A/B 결과를 확보했다.** 무수정 기준본은 모두 같은 오류를 재현하고, 수정본은 안내 화면을 표시한 뒤 원래 C++의 명시적 `abort()`까지 도달했다.

다만 **오류 없는 정상 종료와 Worker 자동 종료는 달성하지 못했다.** 수정본의 재부팅 시험에는 `RuntimeError: Aborted`가 남고 `ws-exit`가 발생하지 않는다. 원인 후보 검증과 null 트랩 제거는 확인했지만, 엄격한 정상 종료 성공 기준을 모두 충족했다고 보고하지 않는다. `abort()`를 건너뛰거나 성공으로 위장하는 추가 패치는 적용하지 않았다.

## 참고 자료와 보존

요청된 `PHASE8_ROOT_CAUSE_REPORT.md`, `PHASE8_WASM_SYMBOL_MAP.md`, `PHASE8_FIX_PLAN.md`, `WASM_ERROR_ANALYSIS.md` 네 파일 모두 실제로 존재하며 읽었다. Phase 7의 스택 미확보 시점 설명은 Phase 8의 실측 심볼 매핑과 구별했다.

- 고정 대응 소스: `public/sources/emulators-0.73.8-source.zip`
- source commit: `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`
- source ZIP SHA-256: `884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840`
- 기존 WASM SHA-256: `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf`
- 기존 앱 진단 버전: `phase7-runtime-1` 유지

기존 소스 ZIP을 덮어쓰지 않고 `artifacts/phase9-1/source/baseline/`와 `source/fixed/`에 사본을 만들었다. 이 폴더는 기존 `.gitignore`의 `artifacts/` 제외 규칙 안에 있다. `docs/ed4/`, `public/`, `src/`, 기존 `tests/e2e/`의 87개 파일을 작업 전후 해시로 비교한다. 게임·음악·기존 브라우저 프로필/세이브는 사용하지 않는다. 브라우저 시험은 임시 Playwright 컨텍스트다. Commit/Push 및 원격 설정 변경은 하지 않는다.

## 실제 소스 변경

엔진 소스 변경은 **fixed 사본의 `native/dosbox-jsdos/asyncify.txt` 한 파일**뿐이다. 기존 JSON 배열의 순서와 나머지 바이트를 유지하고 마지막에 `"Reboot_Handler()"`를 추가했다.

| 목록 파일 | SHA-256 |
| --- | --- |
| baseline | `7f36ef0ebca6af989efcacf7a1fc8a70fbdc382040547d406750d76a003141a7` |
| fixed | `53739db4cc9cf7d9879a8cc7a0bd0964cc68f28b99863540ff6cd6624bb130d0` |

이름은 기존 동봉 심볼의 함수 2613 `Reboot_Handler()`와 대조했다. `dosbox.cmake:31`의 기존 `ASYNCIFY_WHITELIST` 적용 방식을 그대로 사용한다. CPU, DOS, DPMI, BIOS C++, 사운드, 저장 어댑터는 수정하지 않는다. `package-phase9-1.mjs`는 원본 ZIP의 593개 소스 파일 해시와 fixed의 한 항목 차이를 검사한다.

## 컴파일러와 환경

| 항목 | 실제 사용값 |
| --- | --- |
| 호스트 | Windows의 기존 WSL2 Ubuntu 24.04.5, x86_64 |
| Emscripten | 공식 emsdk 3.1.21이 지정한 `3.1.21-git`, commit `f9e81472f1ce541eddece1d27c3632e148e9031a` |
| SDK release build | `a16a8bca2466eb144f7c93fa899c0272c8815dc3` |
| SDK tar SHA-256 | `7045ddb3b37a2cc63cb1cf976019a6a3b7f8dbdc71254db0eee5b0452f94e9e7` |
| LLVM/Clang | SDK 동봉 16.0.0, commit `a4a29438f451370ed241dde30bfcaab0fdf2ab71` |
| Node | SDK manifest 지정 14.18.2 |
| 빌드 도구 | portable CMake 3.24.2, Ninja 1.11.1, Python 3.12.3 |
| 브라우저 시험 | Windows Chrome 157.0.8103.38, Playwright 1.56.1, headless, 단일 worker |
| zlib | SDK 포트 지정 1.2.12, SDK의 SHA-512 검증 경로 사용 |

동봉 Dockerfile의 Ubuntu focal(20.04) 전체 환경을 복제한 것은 아니다. 동일 **컴파일러/SDK 버전과 소스의 컴파일·링크 옵션**을 사용하며 호스트 OS/Python/CMake/generator 차이는 남는다. 따라서 재빌드 기준본을 함께 비교하고, 배포 바이너리와의 바이트 일치 여부를 별도로 기록한다. 임의 최신 컴파일러로 대체하지 않았다.

기존 옵션: `-Oz -fno-exceptions -flto=thin`, C++03/C++11 파일별 설정, `ASSERTIONS=0`, `SAFE_HEAP=0`, `TOTAL_STACK=1MB`, 초기 메모리 64MiB 및 성장 허용, `--emit-symbol-map`, `ASYNCIFY=1`, `ASYNCIFY_IMPORTS=["syncSleep"]`, 기존 whitelist. 전체 명령은 `logs/commands-*.txt`에 보관한다.

공식 도구 다운로드는 사전 보고 후 약 405.81MiB(+ 작은 zlib 포트)를 사용했다. 전역 설치, apt, 셸 프로필 변경 없이 프로젝트의 실험 폴더 안에서 준비했다. Windows 드라이브에 SDK를 푸는 과정이 느려 Node의 불필요한 npm/문서 추출을 중단하고 실행 파일과 CMake 실행 모듈만 준비했다. 컴파일러·LLVM·Binaryen의 코드와 바이너리는 수정하지 않았다. 최초 링크에서 SDK가 thin-LTO 표준 라이브러리 캐시를 생성했으며 두 빌드가 이를 공유했다. [공식 SDK 설치 방식](https://emscripten.org/docs/getting_started/downloads.html), [고정 3.1.21 manifest](https://github.com/emscripten-core/emsdk/blob/3.1.21/emsdk_manifest.json)

## 재현 명령

프로젝트 루트에서 실행한다. 도구 파일과 다운로드 URL·해시는 `artifacts/phase9-1/downloads/manifest.json`에 있다. `phase9-1-toolchain.sh`는 다운로드 완료 파일을 사용하며 시스템 설치를 하지 않는다.

```powershell
node scripts/prepare-phase9-1.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/phase9-1-toolchain.sh
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-1.sh
node scripts/package-phase9-1.mjs
node scripts/inspect-phase9-1.mjs
npx playwright test --config playwright.phase9-1.config.ts
node scripts/check-phase9-1.mjs
```

실제 빌드 명령은 각 variant에 대해 다음과 같다. `EM_CONFIG`와 PATH는 실험 폴더 안의 고정 도구를 가리킨다.

```sh
emcmake cmake -S artifacts/phase9-1/source/baseline -B artifacts/phase9-1/build/baseline -G Ninja
cmake --build artifacts/phase9-1/build/baseline --target wdosbox --parallel 4
emcmake cmake -S artifacts/phase9-1/source/fixed -B artifacts/phase9-1/build/fixed -G Ninja
cmake --build artifacts/phase9-1/build/fixed --target wdosbox --parallel 4
```

CMake의 loader JS 뒤에 upstream `gulpfile.ts/emulators.ts`와 동일하게 `worker-server.js`를 붙여 두 실험 엔진을 패키징한다. 기본 `emulators.js`와 런처 Worker 어댑터는 그대로 사용한다. 브라우저 테스트 응답에서만 실험 JS/WASM을 제공한다. 앱 진단 JSON의 artifact 해시는 고정 라벨이므로 실험 산출물의 증거로 쓰지 않는다. 각 `result.json`의 별도 `engine` 필드에 실제 제공한 파일의 SHA-256을 기록한다.

## 빌드 산출물과 동일성

| 엔진 | WASM bytes | SHA-256 |
| --- | ---: | --- |
| 기존 배포 엔진 | 1,462,485 | `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf` |
| 무수정 재빌드 baseline | 1,462,548 | `00c4a55e8a3dc0f2ae647f805762f5a0c88a3fcf5d0e67c3b54d819635a6472b` |
| Asyncify 수정 fixed | 1,462,799 | `5c0378dd9f34df6ac263505a12b88650d1dfc8df5bfea921cd4aafb9e676ac10` |

실험 엔진은 `artifacts/phase9-1/engines/baseline/`, `engines/fixed/`에 있고 각각 JS, WASM, 심볼, 라이선스, 대응 소스 안내를 포함한다. 대응 소스 사본과 다운로드 도구는 같은 phase9-1 폴더에 남겼다. 기본 vendor나 docs에 복사하지 않았다.

두 재빌드의 패키징된 JS는 바이트 단위 동일(`bdbcda05105c4be7f343359b94fdaa6dfb77d09d0a02c6a9532010916772c0f7`), 심볼 맵도 동일(`2ce29b2d52b5c11fd0683aba6eaf2ef7a5838e0e69ba6f036d1db0a72cf72dea`)이다. 디렉터리 경로를 정규화한 239개 빌드 명령도 모두 일치한다. 기존 목록의 non-existing/non-matching 함수 경고 15개는 양쪽에서 동일하며, 추가한 `Reboot_Handler()`에는 불일치 경고가 없다. 기존 경고를 없애려고 다른 목록 항목을 수정하지 않았다.

재빌드 기준본은 기존 배포 WASM과 **바이트 단위 동일하지 않다**. section 1/2/3/4/5/7/9의 내용과 code section 크기는 같지만 global/code/data 내용은 다르다. data section은 63바이트 크다. 실제 문자열에 기존 GitHub runner 경로 대신 이번 baseline 소스 절대 경로가 들어 있음을 확인했다. 주소 재배치 등 모든 차이를 이 문자열만으로 완전히 증명했다고 주장하지 않는다. baseline/fixed 사이에도 소스 디렉터리 이름 문자열 차이는 존재한다. 이 한계를 포함해 배포본과 재빌드 기준본을 모두 대조했다.

## WASM에서 확인한 변화

`Reboot_Handler()`는 두 재빌드 모두 함수 2613이다. baseline 본문 217바이트에는 Asyncify global 명령이 없고, fixed 본문 470바이트에는 상태·스택을 다루는 global 명령 28개가 있다. `build-disassembly.json`에 전체 선택 함수 명령을 보관했다.

수정본의 실제 오류 스택 최상단 WASM 위치는 `2613:0xf6d21`이다. 역어셈블은 이 위치를 `call $a.a`로 표시하며 JS 스택은 `abort → _abort → wasm-function[2613]`을 보인다. 이는 `bios.cpp:1020`의 명시적 abort 호출에 해당한다. 기존 `481:0x14405`의 null 간접 호출에서 멈추던 상태와 구별된다. 단순히 예외가 안 보인다는 조건으로 성공 처리하지 않았다.

## 공개 A/B 결과

Phase 8의 동일한 COM 바이트를 사용했다: INT18=`CD 18`, INT19=`CD 19`, reset=`EA F0 FF 00 F0` 뒤에 DOS 종료 바이트를 붙인다. 모든 엔진에서 같은 런처/프로필 기본 설정/Chrome/페이지 경로/Worker 어댑터를 사용하며 RAW·게임 파일·DPMI 서버는 없다. 응답 가로채기를 위해 서비스 워커를 차단했으며 기존 오프라인 E2E의 설정은 유지했다.

| 공개 입력 | 기존 배포본 | 재빌드 baseline | fixed |
| --- | --- | --- | --- |
| INT 18h | null function | null function | null 없음, Reboot_Handler 끝 abort |
| INT 19h | null function | null function | null 없음, Reboot_Handler 끝 abort |
| reset vector far jump | null function | null function | null 없음, Reboot_Handler 끝 abort |

세 fixed 화면 모두 `Reboot requested, quitting now.`가 보이는 것을 PNG로 확인했다. 문구는 BIOS INT10 화면 출력이므로 런처 stdout에는 나타나지 않았다. 자동 검사는 고정 fixed 해시, 정확한 abort 호출 위치, 실제 frame 수, abort 이벤트와 다른 RuntimeError 유무를 대조한다. 화면은 각 `browser/asyncify-fixed-*/screen.png`에 보관했다.

**Worker와 새로 관측한 오류:**

- 기존 배포본/baseline은 초기 공개 COM 실행 중 프레임 0에서 null 트랩이 발생했고, 런처의 시작 실패 정리 경로가 Worker를 종료했다. `ws-exit`는 없었다. 이것을 정상 DOS 종료라고 하지 않는다.
- fixed는 13~14개 프레임을 보낸 후 `Aborted(). Build with -sASSERTIONS for more info.`가 발생했다. 재부팅 안내 후 약 3초 idle 다음 abort라는 기존 소스 경로와 일치한다.
- fixed에서 `ws-exit`는 없고 부모의 `terminate()`도 호출되지 않았다. 오류 후 Worker 평가 요청은 응답하며 어댑터 stage는 `running`, 화면의 실행 상태도 실행 중으로 남는다. 게스트 실행이 계속된다는 뜻은 아니다. 테스트 컨텍스트를 닫을 때 정리되며 정상 자동 종료로 판정하지 않는다.
- `emscripten-abort` 관측에는 `Non-Error rejection (payload omitted)`라는 기존 진단기의 대체 문구도 남는다. 별도의 Promise 거부가 확인됐다는 뜻이 아니다. Worker와 parent의 `Aborted` 기록은 같은 예외의 중복 관측이며 다른 독립적인 WASM 실패로 합산하지 않았다. 그 외 RuntimeError는 이번 공개 시험에서 발견하지 못했다.

일반 DOS 대조는 세 엔진 모두 키보드 입력/화면 출력/런처 종료와 별도 DOS 셸 `exit` 시험을 통과했다. 화면의 비검정 픽셀 122,140개를 확인했고 런처 종료는 지연 강제정리 메시지 없이 `ws-exit`와 Worker terminate가 확인됐다. DOS 셸 exit도 `ws-exit`·terminate가 확인됐고 RuntimeError는 없었다. 즉 일반 종료 경로와 BIOS 재부팅의 abort 경로는 다르다.

## 자동 테스트와 실패 기록

| 항목 | 결과 |
| --- | --- |
| 기존 단위 테스트 | 200/200 통과 |
| TypeScript | 통과 |
| 새 A/B 및 공개 DOS 테스트 | 15/15 통과, 28.7초 |
| 기존 Chrome E2E 첫 실행 | 32 통과 / 6 실패, 5.7분 |
| 기존 Chrome E2E 빌드 후 재실행 | 38/38 통과, 2.9분 |
| docs/public/src/기존 E2E 해시 보존 | 87개 차이 없음 |

15개 통과는 null 트랩 재현/제거와 의도된 abort 및 일반 DOS 동작을 검증한 결과이며 **재부팅 후 오류 없는 정상 종료가 됐다는 뜻이 아니다**.

실패를 숨기지 않기 위해 다음 자료를 별도 보존했다.

1. SDK 준비와 동시에 실행한 기존 E2E는 시작 실패 5건과 입력 결과 미도달 1건으로 실패했다. 여러 화면에서 `No frame received`가 확인됐다. 수정 엔진을 로드하지 않은 실행이다. 자료는 `regression-first/`에 있다. 빌드 완료 뒤 같은 테스트를 수정 없이 재실행해 38/38 통과했다. 타이밍/부하 의존 가능성은 있으나 그것만이 원인이라고 확정하지 않는다. 최종 자료도 `regression-final/`에 보관했다.
2. 첫 새 A/B 실행은 12 통과 / 3 실패였다. 새 테스트가 BIOS 문구를 stdout에서 찾는 잘못된 관측 조건을 사용했다. 실제 화면과 정확한 `Reboot_Handler → _abort` 위치를 확인한 뒤 새 테스트의 관측 지점을 수정했다. `browser-first/`에 첫 실패를 남겼으며 기존 200개 단위/38개 E2E의 조건은 변경하지 않았다.
3. 두 엔진 링크가 끝난 뒤 실행 중 갱신된 빌드 래퍼에서 EOF 오류가 발생했다. 고정된 래퍼로 재실행해 두 타깃 모두 `ninja: no work to do` 및 종료 코드 0을 확인했다. 첫 컴파일/링크와 경고 로그는 `logs/first-build/`, 최종 명령은 `logs/commands-*.txt`에 있다.

## 남은 작업과 적용 경계

이번에 적용한 엔진 변경은 실험 소스 목록의 함수 한 항목뿐이다. `abort()`를 `exit(0)`로 바꾸거나 콜백/오류를 건너뛰지 않았고, 기본 엔진과 배포본을 변경하지 않았다.

오류 없는 정상 종료가 필요하면 BIOS abort를 어떻게 런처의 종료 정책과 연결할지 별도 범위로 검토해야 한다. 단순히 예외를 성공으로 바꾸면 안 된다. 특히 저장하지 않는 진단 세션과 실제 플레이의 저장 보호를 구분해야 한다. 현재 테스트에서 남는 Worker/UI 상태도 그때 처리할 문제이며 이번에는 수정하지 않았다.

실제 영웅전설4는 이번 단계에서 실행하지 않았고, 실행 성공 여부는 미검증이다. ED4가 왜 BIOS 재부팅 경로에 도달했는지도 별도 미해결 문제다.

## 추가한 파일과 증거 위치

- 보고서: `PHASE9_1_ASYNCIFY_REPORT.md`
- 소스 분리/단일 변경 확인: `scripts/prepare-phase9-1.mjs`
- 고정 portable 도구 준비/빌드: `scripts/phase9-1-toolchain.sh`, `scripts/build-phase9-1.sh`
- 동일 Worker 패키징/소스 해시 검증: `scripts/package-phase9-1.mjs`
- 두 WASM 심볼·본문 비교: `scripts/inspect-phase9-1.mjs`
- 원래 앱·배포본·E2E 보존 검사: `scripts/check-phase9-1.mjs`
- 별도 공개 A/B: `playwright.phase9-1.config.ts`, `tests/phase9-1/asyncify.spec.ts`
- 실제 엔진·대응 소스·도구·로그: `artifacts/phase9-1/` (Git 제외, 로컬 보존)

핵심 기계 판독 증거는 `engine-manifest.json`, `source-manifest.json`, `build-comparison.json`, `build-disassembly.json`, `ab-summary.json`, `preservation-result.json`이다. 각 공개 실행의 원본 진단과 화면은 `browser/`에 있다. 기존 tracked 파일과 Git HEAD `f663361ccaff753293e93152419aeeeb82dfc193`는 유지했다. 기본 엔진 교체, production build, GitHub Pages 갱신, Commit/Push는 하지 않았다.
