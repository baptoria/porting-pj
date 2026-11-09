# Phase 9-8C — 실제 게임 BGM 명령 추적 준비

작성: 2026-11-09. 프로젝트 `D:\porting\ed4-mobile`. Git Commit/Push 없음.

## 결론과 검증 수준

**별도 Phase9-8C 엔진에 제한된 INT66·파일 읽기·버퍼/DMA 메타데이터 관측을 구현하고, 공개 모의 DOS 프로그램으로 검증했다. 실제 ED4의 BGM 소유권과 곡 전환 명령은 Galaxy 수집 전이므로 미확정이다.**

Phase9-8B의 공개 타이머 약1.97× 및 합성 독립 BGM 결과는 기존 보고서의 실험 결과다. 이번에는 그 프로토타입을 게임의 RAW 읽기에 임의 연결하지 않았다. 새 엔진은 **1× 관측 전용**이다. 실제 BGM만 억제할 근거가 아직 없으므로 전체 SB 음소거, 중복 독립 재생, 제품 2× 활성화는 적용하지 않았다. SE 가속 허용 조건 때문에 막힌 것이 아니다.

사용자가 확인한 Phase9-7 게임·소리 정상 및 RAW53개 읽기는 기존 실기 사실로 유지한다. 이번 새 엔진의 실제 게임 호출, 전투/필드 음악 전환, BGM1×/게임2×는 아직 Galaxy 미검증이다. PC에서는 공개 프로그램과 합성 RAW/EFC만 실행했다.

## 1. 기존 근거와 이번 식별 결과

`PHASE9_8B_SPEED_BGM_REPORT.md`, `PHASE9_7_AUDIO_PITCH_REPORT.md`, Phase9-6/9-5B의 소스·빌드·보존 구조를 검토했다. 이전 읽기 전용 정적 조사에서 LOGO.EXE의 INT66 래퍼 후보와 RAW 이름 참조가 확인되었다. 그때의 파일 offset은 **실행 주소가 아니다**. 이번 훅은 특정 LOGO offset에 브레이크포인트를 심지 않고 실제 CPU 인터럽트 진입을 관측한다.

연구용 구버전 파일의 기존 해시 근거:

| 파일 | 크기 | SHA-256 |
|---|---:|---|
| ED4.EXE | 516 | `20ac1206364f2bc83f3309b650094aba27f19b4956ef6e781335c50fedd27e9d` |
| DRIVER.EXE | 16556 | `0aacd13177882ae96b5f81b912ff08fc3f43462c5b97af13bf3fe91091535b3a` |
| LOGO.EXE | 409850 | `fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1` |
| SOUNDRV.COM | 4704 | `3c7d00b022e9b24267ad9692e901e690dec156b901523ac7bafa448c28019e77` |

이는 기존 Phase9-8B 측정값이며 이번 Galaxy 파일 전체를 재해시한 결과가 아니다. Galaxy LOGO/DRIVER/SOUNDRV의 전체 해시와 실제 호출 자료는 아직 없다. 로컬 RAW54개와 Galaxy53개를 같은 집합으로 단정하지 않는다.

| AX | 공개 DIGPAK API 의미 | 이번 공개 모의 호출 관측 | 실제 Galaxy ED4 |
|---|---|---|---|
| 0688 | 샘플 재생 요청 | 확인 | 미수집 |
| 068F | 정지 요청 | 확인 | 미수집 |
| 0695 | 다음 버퍼 등록 | 확인 | 미수집 |
| 0698 | PCM 재생 형식 | 확인 | 미수집 |
| 069C | DMA backfill 설정 | 확인 | 미수집 |

API 해석은 원저자의 [DIGPLAY.ASM](https://github.com/jratcliff63367/digpak/blob/master/DIGPLAY.ASM) 및 [DIGPLAY.H](https://github.com/jratcliff63367/digpak/blob/master/DIGPLAY.H)를 기준으로 한다. 실제 게임의 해당 드라이버 버전·매개변수 규약을 확정한 것이 아니다. `KERN` 시그니처도 규약을 지지하는 단서일 뿐 드라이버 버전 증명이 아니다.

## 2. 실제 구현한 계측

### 네이티브 변경 범위

별도 소스 `artifacts/phase9-8c/source/instrumented/`에서 다음만 추가했다.

| 위치 | 관측 |
|---|---|
| `native/dosbox/src/cpu/cpu.cpp`의 `CPU_Interrupt` 진입 | INT66 요청만 수집. 그 외 인터럽트는 번호 검사 후 반환 |
| `native/dosbox/src/dos/dos.cpp`의 성공한 INT21/AH3F 읽기 직후 | RAW/EFC의 게스트 목적지·실제 읽힌 길이·PSP 기록 |
| `native/dosbox/include/ed4_bgm.h` | 관측 함수 선언 |
| `native/dosbox/src/cpu/ed4_bgm.inc` | 고정 배열, 안전한 메타데이터 판독, 조회 export |

기존 CPU 명령 단위 trace는 `ED4_CPU_TRACE_ENABLED=OFF` 그대로다. opcode, 타이머, 믹서, IRQ/DMA 전달, 게임 파일, 기존 abort 동작을 바꾸지 않았다. Phase9-5B VGA 호환성과 Reboot_Handler Asyncify는 Phase9-6 대응 소스에 포함된 상태로 유지한다.

INT66은 **호출 직전** 관측이다. CS와 `CPU_Interrupt`의 `oldeip`를 기록하므로 IP는 복귀 지점이며 반드시 INT opcode 시작 주소는 아니다. AX/BX/CX/DX, DS:SI, ES:DI, PSP, CR0/보호 모드, 게스트 tick, 순서를 기록한다. 드라이버 반환값/성공 여부를 관측했다고 주장하지 않는다.

실주소 모드·paging OFF·INT66 벡터 앞 KERN 시그니처·conventional RAM 범위가 모두 맞는 경우만 SNDSTRUC 12바이트의 포인터/길이/주파수를 판독한다. 버퍼와 상태 포인터도 `0x500..0x9FFFF` 범위인지 확인한다. **샘플 및 상태 메모리 내용은 수집하지 않는다.** 보호 모드 포인터는 해석하지 않고 `bufferMetadataValid=0`으로 남긴다. 잘못된 주소를 읽어 계측 자체가 예외를 만들지 않는다.

DMA1/5의 address/count/masked 필드를 직접 읽는다. 포트를 읽거나 DMA를 진행시키지 않는다. 이것이 실제 선택된 SB 채널이라는 뜻은 아니다. 기존 설정과 함께 대조해야 한다.

### RAW → 버퍼 후보 연결

DOS 파일 읽기에 대해서는 이름 전체 대신 대문자 basename의 FNV32, 실제 목적지 범위와 PSP를 기록한다. 최근32개 읽기 범위 중 같은 PSP이며 샘플 버퍼 전체를 포함하는 읽기만 `addressCandidateReadSequence`로 연결한다. 겹치는 이후 DOS 읽기는 오디오 파일이 아니어도 이전 후보를 무효화한다.

기존 OPFS RAW 어댑터에는 별도의 순차 읽기 메타데이터 장부를 추가했다. 파일 상대 경로·해시와 position/length만 기록하고 bytes는 기록하지 않는다. 파일 읽기는 그대로 기존 지연 읽기를 사용한다. **JS 파일 읽기 sequence와 네이티브 이벤트 sequence는 서로 다른 번호 체계다.** 같은 숫자를 동일 이벤트로 결합하지 않는다.

이 연결은 주소상 후보이며 소유권 증명이 아니다. CPU의 memcpy/변환/믹싱/덮어쓰기는 추적하지 않는다. 동일 basename과 해시 충돌, 디렉터리가 다른 같은 이름도 가능하다. 잘린 장부의 과거 읽기나 FCB/custom 경로도 빠질 수 있다. RAW read만으로 재생·루프·전환을 판정하지 않는다.

### 상한과 공개 JSON

- 네이티브 첫32개 + 마지막256개, 총288개 메타데이터 이벤트. 반복 조회성 명령은 첫 기록과 명령별 횟수만 남긴다. 주요 play/stop/buffer/format/backfill은 상한 내에서 기록한다.
- 고정 배열/범위/명령 카운터의 보고 크기 37,600B. 소수 스칼라·호출 스택·JS 객체 비용은 이 값에 포함하지 않는다.
- 매 CPU 명령·INT66 이벤트마다 JavaScript로 메시지를 보내지 않는다. 진단 JSON 다운로드 때 기존 상태 조회 요청에서 최대288행을 꺼낸다.
- `src/bgm-diagnostics.ts`가 고정 열과 제한된 상대 경로만 허용한다. 임의 payload를 JSON으로 통과시키지 않는다. 오디오 샘플·게임 명령 바이트·세이브 내용·개인 절대 경로는 신규 장부에 없다.
- 조회 실패는 `query-timeout-not-current`/미수집으로 표시한다. 이전 값을 최신 0회로 위장하지 않는다.

성능 비용은 명령 추적보다 제한적이지만 **Galaxy 실측 오버헤드는 미측정**이다. AH3F 읽기마다 최대32개 범위를 검사하고 INT66 진입마다 조건/카운터를 처리한다. JSON 시점에는 최대9,216개 정수 조회가 한 번 발생한다. 실행 중 지속 전송은 없다. 주기적 상태 조회 UI도 추가하지 않았다.

## 3. 빌드·Worker·보존

기존 Emscripten3.1.21, Node14.18.2, CMake3.24.2, Ninja를 재사용했다. 다운로드·설치·관리자 실행 없음. 첫 컴파일에서 헤더 의존 누락이 발생하여 새 계측 파일에 `inout.h`/`pic.h` include를 추가했다. 첫 실패 로그와 최종 로그를 `artifacts/phase9-8c/logs/`에 보존했다. 기존 Asyncify의 15개 non-existing/non-matching 경고는 남아 있으며 숨기지 않았다.

재현 절차(준비 스크립트는 기존 실험 디렉터리를 덮어쓰지 않는다):

```text
node scripts/prepare-phase9-8c.mjs
wsl bash scripts/build-phase9-8c.sh
node scripts/package-phase9-8c.mjs --stage
node scripts/prepare-phase9-8c-worker.mjs
npm run build
```

WSL 실행 시 프로젝트 작업 디렉터리를 `/mnt/d/porting/ed4-mobile`로 둔다. 실제 CMake 옵션은 `-DED4_CPU_TRACE_ENABLED=OFF`; target `wdosbox`, parallel4. 소스 변경 전후 해시는 `licenses/phase9-8c-engine.json`에 있다.

| 산출물 | SHA-256 |
|---|---|
| 기존 Phase9-6/9-7 WASM 유지 | `f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3` |
| 새 Phase9-8C WASM | `d7478cb33e9e8a575f5c22789f69f243365aff3fc77543adf5f99cd013994eee` |
| 새 대응 소스 ZIP | `6967853a365567785447ff4d0ec1fe9e6536551090f98ca82814a4e0fd7c268b` |
| 새 공용 Worker | `39ee9b74e178e048ed5f023c896a02058b7ad7b2738c3a5cc409cc25e989ccbe` |
| 새 진입 Worker | `fffb16dbc0c0527e0682add946f66fd523acf5ba2b8a3e5492845061ab304034` |

별도 `docs/ed4/vendor/experimental/phase9-8c/`와 내용 해시가 포함된 Worker 파일명을 사용한다. 공용 Worker는 기존 검증된 Phase9-6 고정본에 이번 조회 어댑터만 추가 생성한다. 구버전 공용 Worker와 혼합하지 않고 build에서 내용/해시를 검사한다. 실제 WASM 해시가 맞지 않으면 실패하며 Stable로 몰래 대체하지 않는다. 새 파일을 오프라인 캐시에 포함했다.

`docs/ed4/` 배포물을 갱신하며 전체 대응 소스·고지를 포함한다. 기존 Stable와 Phase9-2~9-7 엔진/Worker 해시를 대조한다. 게임 원본·RAW·EFC·실제 SAVE는 배포에 넣지 않는다. 공개 probe는 합성 명령의 base64 fixture이며 상용 데이터가 아니다. 기존 UI/전체화면/조이스틱/Enter/ESC는 보존하고 엔진 선택 항목 하나만 추가했다. 게임·세이브·OPFS 저장 스키마 변경 없음.

## 4. 자동 시험

| 시험 | 결과 |
|---|---|
| 단위 테스트 | 305/305 통과; 기존303 유지 + 메타데이터 제한/거부2개 |
| 기존 Chrome E2E | 38/38 통과 |
| Phase9-8 전체화면/멀티터치/설정 | 3/3 통과 |
| 기존 Phase9-7 오프라인 저장 보존·조회 timeout | 2/2 통과 |
| Pages 하위 경로/오프라인 | 2/2 통과 |
| 새 9-8C 공개 INT66 A/B·저장 보존 | 3/3 통과 |
| 새 엔진 VGA/RETF mode3·7·19 | 3/3 통과; mode3/19 복사·RETF 성공, mode7은 기존 의도한 aperture mismatch 유지 |

총 단위305개, 브라우저51개(기존 E2E38 + UI3 + 9-7 보존2 + Pages2 + 새6)가 통과했다. TypeScript/production build, Worker·WASM·GPL 소스 해시 및 배포 감사도 통과했다. 기존 Stable 및 실험 엔진 파일은 manifest 해시와 일치하고 신규 최대 배포 파일은 2,749,136B로 100MiB보다 작다. Git staging/Commit/Push 없음. `.gitattributes`에 새 고정 Worker/엔진 파일의 바이트 보존 규칙도 추가했다.

공개 `scripts/phase9-8c-probe.S`는 CC0 모의 드라이버이다. 실제 SOUNDRV를 실행하지 않고 자신이 설치한 KERN 시그니처/INT66 IRET stub로 알려진 요청을 보낸다. 잘못된 DS:SI, 같은 버퍼의 RAW→EFC 재사용, 700회 반복, key 입력 후 정상 종료를 시험한다. **실제 오디오 출력·드라이버 완료 IRQ가 검증된 시험은 아니다.**

관측 결과: INT66 총707회, 0688=3, 068F=1, 0695=1, 0698=701, 069C=1. RAW/EFC 각1회 native read. 메타데이터709개 중288개 유지,421개 덮어쓰기. 유효 RAW 버퍼 후보 → 잘못된 포인터 거절 → 같은 버퍼의 EFC 후보 전환을 확인했다. 기존9-7과 새9-8C 모두 `BGM_PROBE_OK`, RuntimeError0, CPU history OFF, 모노 어댑터 유지. 반복 JSON 조회가 이벤트를 늘리지 않는다.

OPFS 읽기는 12B 요청을 11B+1B로 나누어 공급했다. 초기 시험의 단일12B 기대를 실제 어댑터에 맞춰 **연속 범위 합계12B** 검사로 수정했다. 초기 등록 선택자 오류도 새 테스트에서 바로잡았다. 기존 테스트의 조건 삭제·완화는 하지 않았다. 원본/세이브/RAW가 재등록 없이 읽히고 진단 종료 후 IDB/OPFS가 같으며 Stable 기본 선택으로 돌아오는 것을 별도 시험했다.

결과 경로: `artifacts/phase9-8c/tests.json`, `browser/`, 최종 보존 감사 `audit.json`. TypeScript/production build와 Worker 해시 검사는 최종 빌드 로그를 기준으로 한다. 게임 데이터 안전 감사는 경로/확장자·해시·소스 패키지 검사를 병행하며 모든 가능한 비밀을 자동으로 판별하는 도구라고 주장하지 않는다.

## 5. BGM/SE 분리 가능성 판정과 미구현 사항

현재 가능한 것은 **실제 요청과 버퍼 후보를 수집하는 것**이다. 다음은 아직 확인하지 못했다.

1. Galaxy에서 다섯 명령이 실제로 호출되는가, 호출 당시 real/protected mode와 규약은 무엇인가.
2. RAW 데이터가 직접 SND 버퍼가 되는가, 복사/변환/믹싱 후 들어가는가.
3. RAW/BGM과 EFC/SE가 독립 버퍼·DMA 채널인가, 하나의 스트림에서 이미 혼합되는가.
4. 068F가 BGM만 정지하는가, 전체 디지털 출력을 정지하는가. 0695 반복이 음악 루프인가, 일반 스트리밍인가.
5. 필드/전투의 곡 선택과 반복·정지·재개를 어떤 안정된 이벤트가 식별하는가.

따라서 게임 명령→독립 플레이어 연결과 원래 BGM 억제는 **미적용**이다. 드라이버 호출을 건너뛰거나 DMA/IRQ를 가짜 완료하지 않았고, 전체 SB 채널도 음소거하지 않았다. OPL 출력이 실제 음악인지 아직 관측하지 않았으며 RAW 존재만으로 FM/PCM 경로를 하나라고 가정하지 않는다.

Galaxy에서 버퍼 분리가 확인되면 원래 BGM에만 한정된 믹서 입력 억제 지점을 별도로 검증하고, 드라이버의 상태/완료 IRQ/DMA 진행은 유지한 채 기존 독립 실시간 플레이어에 곡 명령을 연결하는 것이 다음 후보이다. 반대로 게임이 이미 합친 PCM을 공급한다면 채널 통째 억제는 SE도 제거한다. 이 경우 실제 믹싱 전 명령/소유권을 더 좁혀야 하며 현재 근거만으로 분리 불가능 또는 완료를 선언하지 않는다.

## 6. Galaxy 실기 절차

1. 사용자가 GitHub Desktop으로 변경분을 검토·Commit/Push한 뒤 사이트를 다시 연다. 이 작업에서는 업로드하지 않았다. 사이트 데이터 삭제/게임 재등록은 하지 않는다.
2. 기존 게임 프로필과 기존 RAW53개를 그대로 사용한다. 기존 실행 파일/CPU/사운드 설정을 동시에 바꾸지 않는다.
3. 고급 설정 → 부팅 진단에서 **실험: Phase 9-8C BGM 명령 관측 · 1× · 저장 안 함**을 명시적으로 선택한다. 기존 GAME.BAT로 임시 진단을 시작한다. 이 선택은 영구 저장되지 않는다.
4. 시작 직후 진단 JSON에서 `engine.artifact.id=phase9-8c`, WASM SHA가 위 값인지 확인한다. `cpuHistory.enabled=false`, 모노 어댑터, 2× 비활성 상태를 확인한다.
5. 타이틀 음악이 들린 직후 JSON을 저장한다. 같은 세션에서 필드 진입 → 효과음만 발생시키는 동작 → 전투 진입 → 필드 복귀 직후 각각 저장한다. 사용자가 들은 곡 전환/중복/정지 및 동작 순서를 파일과 함께 기록한다. 가능한 게임 동작만 수행하며 정지/재개를 억지로 만들지 않는다.
6. JSON의 `engine.bgmCommands.source=live-worker-query`인지 본다. counts, events, tracks, fileReads를 함께 비교한다. `bufferMetadataValid=0`은 미관측이며 0Hz/버퍼 없음이 아니다. 소리가 나는데 호출이0이면 수집 경로/드라이버 규약부터 검토한다.
7. 이력이 잘리기 전에 각 전환 직후 내려받는다. Worker 종료/abort 후에는 이전에 내려받지 않은 네이티브 배열을 복구할 수 없다. `query-timeout-not-current`는 최신 증거로 사용하지 않는다.
8. 진단 종료 시 저장 변경분은 폐기된다. 기존9-7로 바로 돌아갈 수 있고 게임/RAW/세이브 재등록은 필요 없다. 실제 영구 세이브 안정성은 이번 진단으로 보장하지 않는다.

로컬 분석 예:

```text
node scripts/analyze-phase9-8c.mjs "진단 파일 경로.json"
```

분석기는 실제 엔진 ID/해시·live-query 여부를 확인하고 명령 횟수와 주소 후보를 요약한다. `ownershipConfirmed=false`를 유지한다. 파일명이 같다는 이유로 자동 곡 재생/정지/음소거를 하지 않는다.

## 남은 완료 조건

이번 완료 범위는 **Galaxy에서 명령·버퍼 관계를 확인할 수 있는 별도 엔진과 공개 시험, 오프라인 배포 준비**이다. 실제 ED4 BGM 명령 식별과 안전한 억제 → 독립 재생 → 게임2×/BGM1×/전투 전환/1× 복귀 검증은 아직 남아 있다. 그 검증 전에는 제품2× 버튼을 활성화하지 않는다.
