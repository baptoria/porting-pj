# Phase 9-6 — 모바일 실행 성능 비교

## 확인된 출발점

사용자는 Galaxy에서 **Phase9-5B로 구영웅전설4 실제 실행에 성공**했다고 확인했다. 속도는 매우 느렸고 소리는 아직 미검증이다. 이 성공 사실은 이전 보고서의 'Galaxy 미검증' 이후 확보된 새로운 사용자 실기 결과다.

진단 (13)의 프롬프트 요약: phase9-5b, 29.47초/198 화면 callback(약 6.72/s), Worker RuntimeError 0, 실행 중 `cycles max`, RAW read 0. 이번 작업에서 JSON 원문을 읽었다고 주장하지 않는다. 이 수치는 **시작부터의 callback 평균**이며, 로딩 후 장면의 실제 표시 FPS나 게임 로직 속도로 단정할 수 없다.

목표는 게임·설정·사운드를 함께 바꾸는 것이 아니라, 기존 메모리 호환성을 유지한 채 명령 단위 진단을 제외하는 것이다. 상용 게임은 이번 PC 시험에 사용하지 않았다.

## 1. 반복 실행 경로 조사

기준: Phase9-5B 대응 소스 ZIP SHA-256 `191bcfa8fe13d91bc59e34a3faecf53206ba4c52c46ee84050a663c51c856bca`.

| 코드/위치 | Phase9-5B에서 수행하는 일 | 빈도/비용 성격 | Phase9-6 |
|---|---|---|---|
| core_normal.cpp: ED4_InstructionScope | 시작/종료 snapshot, entry 매칭 | 일반 명령마다 | 컴파일 제외 |
| ed4_cpu_trace.inc: ED4_CPU_StateNow | 80-byte CPU 상태, lazy FLAGS, PSP/core/A20/세그먼트 상태 | 통상 명령당 2회 | 컴파일 제외 |
| ED4_CPU_Begin/End | 212-byte record 초기화·복사, ring 갱신 | 명령 및 일부 경계마다 | 컴파일 제외 |
| ED4_FirstObserve | 연속성/CS/EIP/BIOS/mode 조건, 최초 anchor/후속 기록 | target 진입 후 각 record | 컴파일 제외 |
| ED4_CPU_Opcode/ModRM/Defer | 명령 분류, 제어 전이 기록 보조 | decode/피연산자 처리 | identity/no-op inline으로 제거 |
| ED4_ControlScope | FAR/RETF/IRET/인터럽트/CR0 경계 | 해당 CPU API마다 | 컴파일 제외 |
| CoreBoundary/Boundary | CPU core/host callback 전후 기록 | host 경계마다 | 컴파일 제외 |
| normal core의 ED4_Fetch 조건 | reset 접근 여부 검사 | 매 명령 | 컴파일 제외 |
| ed4_trace.inc의 EXEC/reboot 이벤트 | basename·결과 및 드문 재부팅 상태 | EXEC/특정 이벤트 | 유지 |
| JSON history 전송 | reset/reboot 때 bounded history 전송 | 드물게 | history 자체가 없어 전송 없음 |
| 런처 로그 | 최대120개, 기존 상태 표시 약1Hz | 메시지 발생 때 | 기존 동작, 프레임별 새 로그 없음 |

즉, JSON을 전송하지 않는 정상 실행에서도 Phase9-5B는 native history 생성 비용을 지불했다. Phase9-6은 전송만 막는 방식이 아니다. `ED4_CPU_TRACE_ENABLED=0` 전처리로 구현·정적 배열을 제외하고 header를 trivial inline으로 바꾼다. normal-core fetch 조건도 전처리에서 제거한다. 새 WASM 심볼에서 `ED4_CPU_*`, `ED4_InstructionScope`, `ED4_ControlScope`, `ED4_FirstObserve`가 사라짐을 검사했다.

기존 100588-byte trace 저장 구조는 새 구현에 포함되지 않는다. 그러나 WASM 초기 선형 메모리 예약은 기존처럼 64MiB이므로, 이것이 브라우저 RAM이 100588 bytes 줄었다는 실측을 뜻하지는 않는다.

## 2. 실제 수정과 보존

별도 엔진 `phase9-6`을 만든다. Stable, Phase9-2/3/4/5B의 기존 WASM/JS/Worker 경로를 덮어쓰지 않는다.

- Phase9-5B `vga_memory.cpp`와 `native/dosbox-jsdos/asyncify.txt`는 **바이트 단위 동일**. VGA text aperture 호환성과 Reboot_Handler Asyncify 유지.
- CPU/DOS 연산, MCB, 게임 실행 순서, cycles 정책, RAW/OPFS/IndexedDB/저장 스키마는 변경하지 않음.
- 바뀐 native 파일: CMakeLists.txt, include/ed4_cpu_trace.h, src/cpu/ed4_cpu_trace.inc, src/cpu/core_normal.cpp, src/dosbox.cpp.
- 마지막 파일에는 명시적 측정 구간에서만 활성화되는 작은 host 측정기와 읽기 전용 cycles/PIC/core export 추가. 매 명령 snapshot/counter가 아니라 **decoder 호출 1024개 중 1개**의 시간을 재며, JS 전송은 요청 시 약1Hz만 수행.
- per-instruction fetch 증명이 없으므로 새 엔진의 reboot route는 `unknown`일 수 있다. 원래 abort를 유지하며, 정확한 CPU 경로가 필요하면 기존 Phase9-5B를 사용한다. 진단 JSON에 history가 compiled-out임을 명시한다.
- 일회성 선택·저장 변경분 폐기 유지. 측정 종료나 일반 실행 시 기본 Stable 선택을 바꾸지 않는다. 이 단계는 세이브를 쓰는 기본 엔진 승격이 아니다.

같은 기존 Emscripten **3.1.21**, WSL Ubuntu-24.04, CMake3.24.2/Ninja1.11.1/Node14.18.2 사용. compiler, 기본 최적화, CPU core를 다른 것으로 바꾸지 않았다. 새 설치/다운로드 없음. 기존 unmatched Asyncify 경고 15개를 숨기지 않았다. 처음 생성한 sh의 CRLF 때문에 실행이 중단되어 LF로 바로잡은 뒤 빌드했으며, 이 실패는 게임 실행 실패가 아니다.

```text
node scripts/prepare-phase9-6.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-6.sh
node scripts/package-phase9-6.mjs
npx playwright test --config playwright.phase9-6.config.ts
npx playwright test --config playwright.phase9-6-bench.config.ts
npx playwright test --config playwright.phase9-6-fixed.config.ts
npx playwright test --config playwright.phase9-6-overhead.config.ts
node scripts/package-phase9-6.mjs --deploy
npm run build
```

빌드에는 `-DED4_CPU_TRACE_ENABLED=OFF`를 전달한다. 컴파일 명령에서 `-DED4_CPU_TRACE_ENABLED=0` 확인. 새 CMake 옵션을 ON으로 하면 소스의 기존 trace 구현을 다시 포함할 수 있으나 배포 후보는 OFF다. `--deploy`는 로컬 public 폴더 준비이며 GitHub 업로드가 아니다. 소스 변경 hash/명령은 `artifacts/phase9-6/source-changes.json`, `logs/commands.txt`에 기록한다. 전체 GPL 소스와 BUILD.md도 별도로 제공한다.

## 3. 비교 방법과 해석 범위

공개 CC0 COM은 동일한 6,553,500회 정수 loop(핵심 두 명령 합계 13,107,000개)를 수행하고 결과 checksum을 검사한다. 시작/끝 stdout가 main thread에 도달한 wall time을 잰다. 초기 로딩과 한 번의 동일 warm-up은 제외한다. `max`는 ON–OFF–OFF–ON 순서, 각 세션에서 warm-up 후 3회, 엔진별 총6회. 이어서 별도 시험으로 `fixed 12000`을 비교한다. 최초 비교와 고정 cycles 비교를 섞지 않는다.

두 엔진 모두 같은 공개 COM, 설정, Chrome, 화면 크기와 파일을 사용한다. 정확한 WASM SHA를 결과에 저장한다. 각 테스트에서 실제 DOS `CONFIG -get "cpu cycles"` 결과도 확인한다. 통계는 `scripts/check-phase9-6-performance.mjs` 및 `artifacts/phase9-6/performance-summary.json`.

이것은 **PC Chrome 합성 작업의 총 처리 시간**이다. 전체 게임 FPS나 Android 속도, OS CPU 사용률을 측정한 것이 아니다. max의 동적 budget 조절 및 message 도착 지연도 wall time에 포함되므로, 비율을 순수한 명령 하나의 비용이나 Galaxy 배속으로 부르지 않는다. 짧은 OFF 표본은 브라우저 스케줄링/전송 지연의 영향을 더 받는다.

첫 시제품은 모든 decoder 호출을 timing했다. 공개 대기 구간에서도 약 2576만 decoder 호출/30초가 관측되어, 계측이 처리에 영향을 줄 수 있음을 발견했다. 배포 후보는 1/1024 timing으로 개선하고 **새 해시로 다시 비교**했다. 이전 시제품의 결과는 `artifacts/phase9-6/initial-full-timer/`에 별도 보존한다. 최종 수치는 아래 최종 결과 절만 사용한다.

## 4. cycles 동작

- 초기 CONF의 `cycles=12000`은 시작값이다. DRIVER 등이 `cycles max`를 실행하면 설정은 변경된다. 이번에 게임 명령을 치환하거나 max를 강제 추가하지 않았다.
- 고정 소스 cpu.cpp의 설정 처리와 dosbox.cpp의 `increaseticks()`는 max 모드에서 `CPU_CycleAutoAdjust=true`로 동적 `CPU_CycleMax`를 조절한다. 해당 알고리즘은 대략 host 가용 시간의 90%를 목표로 하지만 **물리 모바일 CPU 사용률 90%라는 계측값은 아니다.**
- 같은 max라도 추적 비용, host 스케줄링, 열/전력 제한에 따라 실제 budget이 달라진다. 고정 12000은 가상 millisecond당 실행량 목표이며, host가 처리하지 못하면 가상 시간 자체가 느려질 수 있다.
- 새 엔진은 `cyclesMax`와 `cyclesAuto`를 직접 읽는다. shell 문자열만 보고 현재 실제 budget을 추정하지 않는다. 공개 측정에서 core=normal도 확인한다. WASM에 PC용 dynamic core를 도입하지 않았다.
- CPU 작업량, PIC 시간 진행, 화면 callback, 화면 표시 기회, 게임 로직 속도는 서로 다르다. 정지 메뉴의 화면 업데이트 수가 적어도 CPU가 느리다는 증거는 아니다.
- 기존 게임이 내부에서 max로 바꾸므로, 향후 fixed 실기를 한다면 **변경 후 실제 native samples가 fixed임을 먼저 확인**해야 한다. 초기 CONF만 바꾸고 fixed 적용이라고 판정하지 않는다.

모바일 max의 전력/발열/스로틀링은 미측정이다. 먼저 같은 장면에서 엔진 ON/OFF만 비교하고, 남은 문제가 있을 때 cycles를 단독 변수로 조사한다.

## 5. 로딩 이후 30초 측정

기존 플레이 툴바에 `30초 성능 측정` 버튼 하나를 추가했다. 메뉴가 안정된 뒤 사용자가 누른 구간만 측정하며 기존 시작부터의 averageFps와 별도로 `engine.performanceWindow`에 기록한다. 종료·일시정지·탭 숨김·RuntimeError가 있으면 무효 표시한다. 종료/조작 버튼을 측정 때문에 잠그지 않는다.

| 값 | 실제 수집 범위 | 제한 |
|---|---|---|
| frameCallbacksPerSecond | 해당30초 onFrame callback 수 | 변화된 프레임 전달 빈도, 게임 FPS 아님 |
| canvasPaintOpportunitiesPerSecond | Canvas 제출 뒤 rAF에서 관측한 새 프레임 표시 기회 | 디스플레이 실제 scanout/물리 FPS는 직접 확인 불가 |
| canvasSubmitMs | RGB/RGBA 복사와 putImageData CPU 경과시간 | GPU 완료 시간 제외 |
| workerToCanvasMs | Worker postMessage 직전 timestamp부터 Canvas 제출까지 | native 전체 프레임 생성 시간 제외; Phase9-6만 지원 |
| sampledDecoderWallMs / decoderTimedSlices | 1/1024 표본 decoder 호출의 경과시간 합계 | 전체 시간으로 외삽하지 않음; Asyncify/nested wait가 섞일 수 있음 |
| workerOsCpuMs | null | OS 스레드 CPU 시간은 웹 API로 확보하지 못함 |
| guestTicksPerWallSecond | PIC_Ticks 증가/Worker 표본 구간 wall time | 가상 ms, 실제 instruction/game step 수 아님 |
| audioCallbackMs/samples | main audio 처리 경과시간/샘플 수 | native 합성 전체 비용·청감 성공 증거 아님 |
| wasmHeapBytes | Worker HEAPU8의 선형 메모리 | 브라우저 총 RAM/RSS/OPFS 용량 아님 |
| cyclesMax/Auto/core | 런타임 변수 읽기 | 파일의 초기 설정과 구분 |

기존 Phase9-5B는 원래 Worker/바이너리를 보존하므로 native/전송 지연 항목은 null이며, main thread callback/Canvas/audio 구간은 양쪽 모두 측정한다. 새 구간에 최대40개 numeric 표본만 저장한다. 게임 메모리, 명령 byte, 음악·세이브·파일 내용은 추가 수집하지 않는다. 프레임별 큰 로그나 JSON 전송을 하지 않는다.

**실제 표시 FPS, 전체 Worker CPU 시간, 전체 프레임 생성→디스플레이 지연을 모두 정밀 측정했다고 주장하지 않는다.** 위 proxy와 한계를 구분한다.

## 6. Galaxy 실기 절차

1. 사용자가 배포를 검토하여 Commit/Push한다. 온라인에서 오프라인 준비를 마친 뒤 기존 탭/PWA를 닫고 다시 연다. 사이트 데이터 삭제·게임/RAW 재등록은 하지 않는다.
2. 기존 게임 프로필과 동일 GAME.BAT/RAW/CPU/사운드 설정으로 임시 진단을 연다. 첫 시험은 기존 **Phase9-5B**.
3. 동일 메뉴에 도착하고 약5초 안정화한 뒤 **30초 성능 측정**을 누른다. 동일하게 정지 메뉴 또는 동일 반복 이동을 유지한다. 두 시험에서 서로 다른 장면·조작을 비교하지 않는다.
4. 완료 후 진단 JSON을 다운로드하고 엔진 이름으로 따로 보관한다. 종료하면 변경 세이브는 폐기된다.
5. **Phase9-6 추적 OFF · 저장 안 함**만 선택해 같은 조건/장면/대기/30초 측정을 반복한다. 기존 게임/RAW/세이브는 재사용한다. 실제 WASM hash도 확인한다.
6. 가능하면 5B→6→6→5B 순서로 반복한다. 화면 방향·배터리 절약 설정·충전 상태를 비교 도중 바꾸지 않고 열 상태의 차이도 메모한다.
7. 메뉴 입력 반응, 동일 이동의 걸린 시간, 화면 callback/표시 기회, native cycles와 PIC 진행을 따로 비교한다. 소리는 별도 청감 검증으로 남긴다. RAW read 0은 음악 성공도 실패도 단독 증명하지 않는다.

첫 A/B에서 cycles/sound/RAW를 동시에 바꾸지 않는다. 실험은 일회성이며 저장하지 않는다. 안정 기본 엔진으로 승격하거나 저장 가능한 기본 실행 경로로 바꾸는 작업은 하지 않았다. 기본 Stable이 느린/호환되지 않는 설치본이어도 몰래 Phase9-6으로 대체하지 않는다.

## 7. 남은 과제

- Phase9-6에서도 Galaxy의 실제 게임 호환성이 유지되고 조작 속도가 개선되는지 사용자 실기 필요. Phase9-5B 성공을 Phase9-6 성공으로 자동 간주하지 않는다.
- 소리/BGM/RAW53개 실제 읽기와 재생은 미검증. 이번 작업에서 재등록·삭제·수정 없음.
- 스로틀링, display/GPU와 실제 스레드 CPU 시간, 장시간 플레이는 별도 기기 검증 필요.
- 필요하면 동일 엔진의 runtime fixed/max만 비교하되 내부 cycles 명령을 덮어쓰는지 native samples로 확인한다.
- 그래픽/오디오 native 생성 비용은 아직 분리 측정하지 않았다. 공개 CPU 작업의 개선만으로 모든 병목을 제거했다고 주장하지 않는다.

## 8. 최종 빌드와 수치

최종 WASM SHA-256:
`f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3`

크기 1463305 bytes. 비교 대상 Phase9-5B는 `81ee12956f39cc0b8ffc1ef5b1a5b6bd282231af253fde598aa70eb826f89e9a` 그대로다. 배포 경로는 `/porting-pj/ed4/vendor/experimental/phase9-6/`이며 버전·내용 해시가 고정된 별도 Worker와 함께 사용한다. 파일 내용/실제 WASM SHA가 맞지 않으면 실행을 거부하며 Stable로 몰래 대체하지 않는다.

PC Chrome 157, headless, foreground 자동화에서의 최종 측정:

| 조건 | 추적 ON Phase9-5B | 추적 OFF Phase9-6 | 표본 |
|---|---:|---:|---|
| max, 중앙값 | 3148.60 ms | 94.75 ms | 각6 |
| max, 범위 | 3098.50–3195.40 ms | 92.10–104.20 ms | ABBA |
| fixed12000, 중앙값 | 2867.30 ms | 1092.00 ms | 각3 |
| fixed12000, 범위 | 2825.50–2917.80 ms | 1091.80–1092.00 ms | 별도 후속 비교 |

max의 중앙값 처리시간 비는 약33.23배, 감소율 약96.99%; fixed의 비는 약2.63배, 감소율 약61.92%다. **PC 합성 작업의 처리시간 비교**이며 Galaxy 게임의 배속 또는 CPU 사용률 감소율이 아니다. fixed OFF가 약1.092초인 것은 13107000/12000000의 실행량 목표와 일치한다. ON은 이 목표 속도를 유지하지 못했다. 이는 trace가 실질적인 CPU 처리 비용을 만든다는 강한 근거지만, 실제 게임의 모든 병목을 설명하지는 않는다.

표본 측정 자체 ON/OFF의 별도 공개 시험(같은 최종 Phase9-6, max, 각3회): 측정 OFF 중앙값95.90ms(92.40–130.00), ON93.30ms(92.80–96.30). 표본 수가 적고 구간이 짧아 작은 차이는 잡음과 구분할 수 없다. **측정이 속도를 높였다고 주장하지 않으며, 이 시험에서는 뚜렷한 큰 비용이 관측되지 않았다.**

해당 ON 시험의 실제 native 읽기: cyclesAuto=1, cyclesMax 244714→316436, core=normal, HEAP=67108864; decoder 호출4178164 중4081개 timing. 표본 timing 합계1.30ms는 전체 CPU 시간이 아니며 외삽하지 않는다. 모바일의 timing 비용/발열은 추가 실기가 필요하다.

## 9. 변경 파일과 검증 결과

주요 변경:

- 별도 source 추출/patch/build/package: `scripts/prepare-phase9-6.mjs`, `build-phase9-6.sh`, `package-phase9-6.mjs`.
- 코드/심볼/호환성/수치 검증: `scripts/check-phase9-6-performance.mjs`, `check-phase9-6.mjs`.
- 내용 고정 Worker와 소스 제공: `scripts/*phase9-6*worker*.mjs`, `phase9-6-common.mjs`, `phase9-6-worker-performance.js`, `licenses/phase9-6-engine.json`, 신규 GPL source ZIP.
- 일회성 엔진 목록: `src/experimental-engine.ts`, `src/engine.ts`, `src/main.ts`, `src/generated/phase9-6-worker.ts`.
- 작은 수동 구간 측정기: `src/performance-window.ts`, 툴바 버튼1개. CSS/화면 배치 변경 없음. 기존 source/music/save/storage 코드는 변경하지 않음.
- 새 공개 COM/브라우저/단위 테스트: `scripts/phase9-6-probe.mjs`, `tests/phase9-6*`, `tests/performance-window.test.ts`.
- 준비·빌드·대응 소스 목록·Git 줄바꿈 보호·GPL 고지 및 `docs/ed4/` 갱신.

검증의 범위와 최종 결과는 이어지는 확인 기록에 명시한다. 기존 테스트를 삭제하거나 조건을 완화하지 않았다. 새 trace-free 시험은 history가 없다는 점을 명시적으로 검사하고, 기존 Phase9-5B의 history 시험은 그대로 유지한다.

## 10. 최종 확인 기록

| 시험 | 결과 |
|---|---|
| 기존281 + 신규6 단위 테스트 | 287/287 |
| 기존 Chrome E2E | 38/38 |
| 기존 Phase9-5B 선택/CPU history/보존/무결성 UI | 4/4 |
| 최종9-5B 대9-6 VGA 468-byte 복사·RETF (mode3/7/13h) | 6/6 |
| 최종 max ABBA CPU 비교 | 4/4 (정식 표본 각6) |
| 최종 fixed12000 비교 | 2/2 (각3) |
| 최종 표본 측정 OFF/ON | 2/2 (각3) |
| 최종 Phase9-6 실행·RAW/저장 보존·hash·30초 측정 | 5/5 |
| 최종 구캐시 혼합·offline·부재/구버전/marker 오류 차단 | 6/6 |
| 최종 Pages 경로·오프라인·저장 복구 | 2/2 |
| TypeScript / production build / Worker hash·캐시 검사 | 통과 |

기존38개 E2E와 Phase9-5B4개는 이번 작업의 앱 연결 후 통과했고, 표본 타이머로 바꾼 최종 WASM은 신규25개 시험과 Pages2개에서 별도 재검증했다. 기존 엔진 내용은 최종 보존 검사로 다시 확인한다. 테스트 실패를 감추거나 기존 assertion을 낮추지 않았다.

최종 공개 대기 프로그램의 실제30초 구간 예: callback133회(4.433/s), 표시 기회133회, native PIC 약1000.007 ticks/s, cyclesMax12000/auto0, WASM heap64MiB, 전송→Canvas 평균1.110ms/최대3.600ms, Canvas 제출135.50ms, main audio callback94.00ms. decoder25763742회 중25160회 timing의 합6.70ms. **이것은 공개 DOS 대기 프로그램이며 ED4 메뉴 수치가 아니다.** 낮은 callback 빈도와 정상 가상시간 진행이 공존할 수 있음을 보여준다.

`artifacts/phase9-6/deployment-audit.json`은 Stable/Phase9-2/3/4/5B 보존, 대응 소스, 신규 파일 크기 제한, 공개 DOS ZIP 외 상용 payload 부재와 staged 변경 없음 등을 기록한다. `docs/ed4/`는 로컬 준비만 했다. Git Commit/Push/원격 배포를 하지 않았다.

실제 게임, 기존 RAW/EFFECT/세이브 파일은 열어 실행·수정·삭제하지 않았다. IDB/OPFS/프로필/게임 데이터 경로와 저장 스키마는 그대로다. 자동 저장 보존 시험은 격리된 테스트 브라우저와 합성 데이터에서 수행했다. 사용자의 Galaxy 데이터에 접근하거나 초기화하지 않았다.

최종 판단: 공개 시험에서는 CPU 추적 제거의 큰 처리시간 개선과 기존 메모리 호환성 유지가 확인됐다. **Phase9-6 Galaxy 게임 호환성·실제 플레이 속도·소리는 사용자 실기 결과를 기다린다.** 다음 Phase로 자동 진행하지 않는다.
