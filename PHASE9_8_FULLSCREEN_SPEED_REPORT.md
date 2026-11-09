# Phase 9-8 — 전체화면 조작 UI와 2× 가능성 검증

작성: 2026-11-09. 기존 `D:\porting\ed4-mobile`에서 작업. Git Commit/Push 및 원격 업로드 없음.

## 결과 요약

**Stage A의 전체화면·조이스틱·Enter/ESC·UI 설정을 구현했다. 2× 게임 진행과 BGM1×의 동시 보존은 구현 완료로 판정하지 않았고, 실제 실행에서 2× 버튼은 비활성 상태다.** 표시만 바꾸는 가짜 배속이나 음악을 가속하는 배속을 연결하지 않았다. 1.5× 선택지·상태·설정은 없다.

사용자가 제공한 Galaxy 진단16 확인 결과를 새 기준으로 반영했다: 원본 게임 실행, 한글, 정상 이동 속도, Phase9-7 모노 수정 후 정상 소리, RAW53개 연결·읽기 관측, 게임 바이너리 수정 없음. JSON16 원문을 로컬에서 읽었다고 주장하지 않는다. **이번 UI의 Galaxy 실기 조작성, 전투, 배속, 세이브 영구 저장은 별도 검증 대상**이다.

기준 WASM은 Phase9-6/9-7과 동일한
`f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3`.
이번에 WASM을 재빌드하거나 교체하지 않았다. Stable 기본값과 Phase9-2~9-7 선택지를 유지했다.

## 1. 구현된 플레이 화면

- 모바일 터치 기기에서 실행하면 몰입 화면으로 전환. PC에서는 기존 전체 화면 버튼으로 진입한다. 네이티브 fullscreen 요청이 실패해도 `100dvh` 고정 레이어가 화면을 채우며 DOS 세션은 계속 실행된다.
- Canvas는 전체 화면 레이어, 조작부는 별도 오버레이. 이전 좌우 패널·하단 툴바가 게임 영역을 줄이지 않는다. 메뉴를 열 때만 일시정지·기존 종료·가상 키보드·진단·화면 설정 도구가 나타난다.
- 기본 게임 조작은 **왼쪽 조이스틱 / 오른쪽 Enter / 그 왼쪽 ESC**뿐이다. A/B, Space 등 추가 게임 버튼은 기본 화면에 표시하지 않는다. 전체 키보드 기능은 메뉴에서 유지한다. 좌상단 메뉴 버튼은 런처 도구이며 DOS 게임 키가 아니다.
- 우상단 작은 `2×` 버튼은 disabled, `aria-pressed=false`, 설명은 현재1× 및 음악 시간 분리 미검증. 메뉴에도 이유가 표시된다. 미검증 기능을 켤 수 있는 숨은 토글은 없다.
- 원본 비율 유지가 기본: Canvas 내부 framebuffer 해상도를 그대로 사용하고 `object-fit:contain`, 여백은 검정. 몰입 화면의 채우기는 `object-fit:fill`로 잘림 없이 확대하되 비율 왜곡을 설정 문구에 표시한다.
- `viewport-fit=cover`, 각 `safe-area-inset`+8px, `100dvh`, ResizeObserver를 사용한다. 사용자 위치 설정은 안전 영역 안의 좌/우 절반으로 제한하며 작은 화면에서는 조작 크기도 제한한다. 실제 Galaxy 노치·브라우저 주소 표시줄·시스템 제스처와의 간섭은 실기로 확인해야 한다.
- 방향 잠금 거절은 기존 안내를 유지한다. 회전·네이티브 fullscreen 해제·몰입 화면 닫기에서 엔진을 재시작하지 않는다.

Canvas 내부 픽셀 크기와 CSS 크기는 분리했다. 조이스틱 좌표는 **조이스틱 자신의 DOMRect 중심/반지름**으로 정규화한다. 게임 화면 좌표를 조이스틱 좌표로 사용하는 구조가 아니다. 이번 게임 조작은 DOS 키 입력이며 Canvas 터치를 DOS 마우스 좌표로 변환하는 기능을 새로 추가하지 않았다.

## 2. 입력과 설정

| 항목 | 구현 |
|---|---|
| 8방향 | 각도45° 단위. 대각선은 인접 방향키2개. 반지름22% 데드존 |
| 표시 | 고정 중심과 이동 노브 분리. 기본 불투명도35%, 터치 중65%. 사용자가 더 높은 기본 불투명도를 정하면 활성 시 낮아지지 않도록 함 |
| 방향 전환 | 사라진 키를 먼저 해제하고 새 키 적용. 값이 같은 move에서는 중복 keydown 없음 |
| Enter / ESC | 기존 js-dos keycode **257 / 256** 고정. 짧은 탭·길게 누름·조이스틱과 동시 터치 |
| 입력 소유권 | `KeyOwners`가 물리 키보드와 각 포인터의 키 소유권을 합산. 한 포인터가 끝나도 다른 소스가 누른 키를 잘못 해제하지 않음 |
| 안전 해제 | pointerup/cancel/lostcapture, blur, visibilitychange, resize/회전, fullscreenchange, 메뉴 열기, 일시정지/종료/새 실행에서 해제 |
| UI 설정 | 조이스틱 크기·가로/세로 위치·불투명도, 버튼 크기·그룹 위치·좌우 교환, 비율 모드, 기본 배치 복원 |
| 설정 저장 | 별도 `localStorage['ed4-play-ui-v1']`. IndexedDB/OPFS/profile/save 스키마 사용 안 함. 오류·손상 값은 안전 기본값과 범위 제한 |
| 기존 설정 | `ed4-controls` 값과 볼륨은 보존. 기존 키 재매핑 값도 남기지만 ED4 오버레이에는 적용하지 않으며 기존 매핑 선택기는 비활성 안내. 물리/가상 키보드는 유지 |

`playUi.revision=phase9-8-ui-1`, 설정 값, 몰입 상태, 배속 지원 여부/이유가 진단 JSON에 추가된다. 게임·RAW·세이브 바이트는 포함하지 않는다.

## 3. CPU cycles와 게임 시간은 다름 — 공개 측정

상용 ED4를 PC에서 실행하지 않았다. 기존 독립 CC0 계산 프로그램(13,107,000 loop instructions)과 신규 `scripts/phase9-8-time-probe.mjs`(BIOS tick36개 대기)를 동일 Phase9-7 엔진으로 실행했다. 계산은 warm-up1회 후3회, 타이머는3회 측정했다. stdout 도착 시간을 기준으로 하므로 브라우저 스케줄링 오차가 포함된다. BIOS tick 시작 위상 때문에 약1tick의 길이 차이가 가능하다.

공개 시험 전용 `wc-run` bundle로 CONF를 제공하고 실제 `CONFIG -get`와 기존 읽기 전용 native performance export로 적용값을 확인했다. **제품 BAT 안전 검사를 완화하지 않았다.** 일반 프로필이나 사용자 설정을 이 방식으로 바꾸는 기능은 배포 코드에 없다.

최종 재현 수치(원자료는 `artifacts/phase9-8/time-*.json`, 비교 집계는 `comparison.json`):

| 실제 설정 | 동일 계산 작업 중앙값 | BIOS36 ticks 중앙값 | 자동 cycles |
|---|---:|---:|---|
| fixed12000 | 1,092.0ms | 1,952.0ms | OFF |
| fixed24000 | 545.8ms | 1,955.8ms | OFF |
| max | 93.1ms | 1,975.7ms | ON |
| fixed24000 뒤 guest `cycles max` | 94.2ms | 2,021.7ms | ON |

native PIC tick 진행량은 각각 wall second당 약1,000.0 / 1,000.3 / 973.0 / 964.9 ticks였다. max의 CPU_CycleMax 관측 범위는8,433~404,283, fixed24000 이후 max는25,364~242,104로 부하에 따라 변했다. max를 고정2×라고 해석할 수 없다. PC Chrome 공개 시험 수치이며 Galaxy CPU 부하나 발열 측정값이 아니다.

**CPU 처리량은 두 배가 되어도 타이머 진행은 두 배가 되지 않았다.** guest의 `cycles max`는 앞의 fixed 설정을 덮어쓴다. CPU-bound 게임 동작이 빨라질 가능성은 있지만, ED4 이동·전투·이벤트 전체가 약2배가 되는 것을 입증하지 못한다. 이 숫자를 Galaxy 게임 FPS/이동 속도로 대체하지 않는다.

### 고정 대응 소스에서 확인한 시간 구조

경로 기준: `artifacts/phase9-6/source/instrumented/native/` 및 동봉된 Phase9-6 GPL 소스.

| 위치 | 확인한 역할 |
|---|---|
| `dosbox/src/dosbox.cpp` Normal_Loop/increaseticks | host GetTicks 경과량으로 ticksRemain 산출. CPU auto는 부하에 따라 CPU_CycleMax 조절. 기존 fast-forward ticksLocked 분기도 있으나 정확한2×+음악1× 기능이 아님 |
| `dosbox/src/hardware/pic.cpp` TIMER_AddTick | CPU_CycleLeft=CPU_CycleMax, PIC_Ticks 증가, PIC 이벤트와 tick handler 진행 |
| `dosbox/src/hardware/timer.cpp` | PIT/IRQ0 및 BIOS 시간의 기준 경로 |
| `dosbox-jsdos/jsdos/jsdos-mixer.cpp` | MIXER_Mix는 TIMER_AddTickHandler에 등록. 생성 측은 guest tick과 연결, sound push 프레임 수는 host 경과 시간과 mixer.freq에 연결 |
| `dosbox/src/hardware/sblaster.cpp` | DMA callback에서 PIC_FullIndex, END_DMA/DMA_Silent 이벤트와 DMA 완료 IRQ 사용. 장치 시간과 guest 인터럽트가 연결됨 |
| `src/engine.ts`, `src/emulator-audio.ts` | 모노 float를 소스 rate로 재생하고 AudioContext.currentTime에 예약. 게임의 BGM/효과음 구분 정보는 받지 않음 |

가상시간을 일괄 두 배로 바꾸면 BIOS/PIT뿐 아니라 믹서 생성·DMA 완료·IRQ·게스트의 노트/곡 명령 타이밍도 영향을 받을 수 있다. `performance.now`·PIC_Ticks·GetTicks를 무조건 배율 처리하는 패치를 하지 않았다.

## 4. 음악 시간 분리 검증과 한계

공개 OPL carrier(약440Hz)와 SB PCM 사인파(약1kHz)를 fixed12000/24000에서 각각 실행하고 Worker mono 및 실제 예약 버퍼를 수집했다. 게임 음악은 녹음/수집하지 않았다. 테스트 소스/원자료는 `tests/phase9-8-speed/audio.spec.ts`, `artifacts/phase9-8/{12000,24000}-{opl,pcm}.json`.

- 소스 rate22,050Hz, 브라우저 context rate는 실제 값으로 기록. mono 프레임/샘플을 모두 보존하는 assertion 유지.
- 주파수와 활성 구간은 `scripts/analyze-phase9-8.py`로 비교한다. CPU 예산2배 시험은 **게임 시간2× 시험이 아님**. 이 경우 오디오가 정상이더라도 “2× 중 BGM1× 성공”으로 판정하지 않는다.
- 기존 Phase9-7 공개 검증의 mono 오류 수정과44.1/48kHz 리샘플링 계약을 유지한다. AudioBufferSource의 playbackRate/detune을 배속에 맞추는 코드는 추가하지 않았다.
- RAW53개를 실제 읽었다는 사용자 실기 결과는 반영했지만, RAW File read가 곧 곡 시작/정지/루프 명령이라고 가정하지 않았다. 기존 OPFS→lazy DOS FS 경로는 게임이 읽는 바이트를 제공할 뿐이다. RAW preview는 별도 경로이며 게임 BGM으로 대체하지 않았다.
- OPL 명령, SB PCM/DMA, RAW 파일 입력을 하나의 소스로 취급하지 않았다. 최종 mono 믹스에서 음악과 효과음을 역으로 분리할 수 있는 식별자도 없다.

최종 공개 음원 분석 결과(실제 AudioContext48,000Hz):

| 경로 | cycles12000 주파수 / 활성 구간 | cycles24000 주파수 / 활성 구간 |
|---|---|---|
| OPL | 440.043Hz / 2.0763s | 440.043Hz / 2.0732s |
| SB PCM | 999.948Hz / 1.2139s | 999.948Hz / 1.2139s |

네 경우 모두 Worker와 WebAudio 예약 버퍼의 mono 프레임 수·샘플 값이 동일했다. 활성 구간은 샘플 진폭 기준 분석이며 오디오 장치에서 실제 출력되는 벽시계 길이나 기기 underrun을 측정한 것은 아니다. 공개 OPL/PCM의 CPU 예산 변경 회귀는 통과했지만 RAW BGM2× 분리, 루프·곡 전환, 효과음 동시 재생의 증명은 아니다.

현재 확보한 정보로는 BGM의 곡 선택·루프·정지·재개를 유지하며 게임만2×로 만드는 안전한 경로를 입증하지 못했다. guest의 음악 명령까지 빨라지면 mono 출력의 샘플 rate를 고정하는 것만으로 템포가 유지되는 것도 아니다. **Stage C의 게임 음악 시간 분리는 미완성, Stage D의 배속 결합은 보류**다.

효과음 가속·중첩·타이밍 어긋남도2×에서 미검증이다. 이를 감추는 pitch correction이나 RAW 변환을 하지 않았다.

## 5. 검증 결과와 실패 처리

| 항목 | 결과 |
|---|---|
| 단위 | 303/303: 기존290 + 신규 방향8개/소유권/설정/경계/배속 제한 등13개 |
| 신규 UI 브라우저 | 3/3: 실제 CDP 멀티터치, 회전/비활성/설정·데이터 분리, native fullscreen 입장/퇴장 |
| CPU/BIOS 및 OPL/PCM 공개 비교 | 8/8, Python 주파수 분석 통과 |
| 기존 Chrome E2E38 | 38/38, 합성500MiB 등록 포함 |
| Phase9-7 비저장·RAW 실시간조회·오프라인·조회 timeout | 2/2 |
| VGA468-byte copy/RETF mode3/7/19, 9-5B/9-6 | 6/6 |
| Pages 하위 경로·캐시·오프라인·데이터 보존 | 2/2 |
| TypeScript / production / Worker hash | 통과. 기존 Phase9-3~9-7 버전 고정 Worker·manifest·오프라인 캐시 일치 |
| GPL·엔진·배포 감사 | 통과. Stable 및 Phase9-2~9-6 WASM/대응 소스 해시 유지, Phase9-7 모노 호스트 코드 유지. 런처 대응 소스307개 파일 및 이번 보고서 포함 |

기존 테스트3곳은 제거된 D-pad 셀렉터를 새 조이스틱의 위쪽 좌표로 교체하고 몰입 메뉴 접근을 반영했다. 실제 포인터/멀티터치·저장·재실행·화면 크기 assertion은 삭제하지 않았다. 초기 실패는 남은 옛 D-pad selector와 CDP partial touchEnd 대상 지정 오류였으며, 입력 검증 기대값을 완화하지 않고 대상 지정을 수정했다. 공개 시간 시험의 첫 BAT는 기존 안전 분석기가 거부했으며, 테스트 전용 런타임 fixture로 분리했다.

CDP의 partial touchEnd 대상은 해당 Chrome 구현에서 **해제할 포인터 목록**이다. 문서/구현 차이는 [Chromium 이슈](https://issues.chromium.org/issues/569778218)도 참고했다. PC 자동화 결과를 Galaxy 실기 터치 성공으로 기록하지 않는다.

2×가 활성화되지 않으므로2× 전환/발열/자동1× 복구를 성공 시험으로 기록하지 않는다. 항상1×이고 실패한 전환을 이유로 게임 재시작을 강제하는 경로도 없다. 새로운 CPU 명령 계측·큰 로그·오디오 가공이 없어1× 엔진 실행 경로는 보존된다. 실제 Galaxy 발열/스로틀링·장시간 입력 응답성은 실기 확인이 필요하다.

## 6. 파일·저장·배포 보존

- 실제 변경: `src/play-input.ts`, `src/play-ui.ts`, `src/controls.ts`, `src/main.ts`, `src/style.css`, 공개 시험/분석/감사 스크립트 및 UI 시험.
- `src/engine.ts`, `src/emulator-audio.ts`, `src/experimental-engine.ts`, 기존 Worker/WASM, RAW/저장/백업/스키마 코드는 변경하지 않았다. VGA 호환, CPU trace OFF, Asyncify, mono-v1 유지.
- Stable 기본값 유지. 기존 Phase9-2~9-7 엔진 메뉴 유지. 새로운 실험 WASM을 기본 엔진으로 설정하지 않았다.
- UI 설정을 게임 파일·프로필·세이브에 쓰지 않는다. 기존 `ed4-controls` 보존과 IndexedDB 상태 동일성, 기존 RAW/OPFS·세이브 격리는 자동 시험으로 확인한다. 사용자 실브라우저 저장소를 열거나 초기화하지 않았다.
- 영구 저장 권한을 자동 요청하지 않았고 새로운 저장 경로를 활성화하지 않았다. 기존 일반 실행의 저장 정책과 일회성 진단의 변경분 폐기를 그대로 둔다. **실제 Galaxy 세이브 안정성을 보장하지 않는다.**
- `docs/ed4/` production 갱신. 경로 `/porting-pj/ed4/` 유지. GPL 대응 소스/고지 유지. 상용 게임·RAW·SAVE 파일은 배포에 추가하지 않는다. GitHub Commit/Push는 사용자 작업.

최종 감사: `node scripts/check-phase9-8.mjs` → `artifacts/phase9-8/deployment-audit.json`. 보호 경로 Git diff 없음, 기존 엔진 파일 및 GPL 소스 ZIP의 manifest hash 일치, 런처 소스 ZIP과 작업 파일 바이트 일치, staged 파일 없음. 배포 파일/대응 소스 ZIP 내부에 RAW/EFC/SAV/SVE/ISO/EXE/COM 확장자 파일이 없고, 배포 최대 파일은 기존 Phase9-6 대응 소스 ZIP 2,740,591 bytes로100MiB 미만이다. 공개 DOS 시험 ZIP은 기존 CC0 자료다. 별도의 GitHub 접속/배포는 수행하지 않았다. `git diff --check` 통과.

재현 명령: `npm test`, `npm run build`, `npx playwright test --config playwright.config.ts`, 그리고 `playwright.phase9-8.config.ts`, `playwright.phase9-8-speed.config.ts`, `playwright.phase9-7-ui.config.ts`, `playwright.phase9-6.config.ts`, `playwright.pages.config.ts`를 각각 같은 방식으로 실행한다. 분석은 `python scripts/analyze-phase9-8.py`(기존 NumPy 사용), 최종 감사는 위 Node 명령이다. 총 브라우저59개 통과이며, 서로 다른 목적의 테스트를 합친 수치다. 실제 상용 게임은 실행하지 않았다.

## 7. Galaxy 확인 절차

1. 사용자가 변경을 검토해 Commit/Push 후 온라인에서 기존 탭/PWA를 닫고 다시 연다. **사이트 데이터 삭제·게임/RAW 재등록을 하지 않는다.**
2. 기존과 같은 프로필·GAME.BAT·CPU/메모리·음악 연결을 사용한다. 기본 Stable은 바뀌지 않았으므로, 게임 성공이 확인된 기존 **Phase9-7 일회성 진단**을 명시적으로 선택한다. 저장하지 않는 진단이라는 점은 그대로다.
3. 가로 전체화면과 API 거절 시 대체 몰입 화면에서 한글 메뉴와 원본 비율을 확인한다. 조이스틱 왼쪽, Enter 오른쪽, ESC 그 왼쪽인지 확인한다. 노치·하단 제스처 부근이 잘리지 않는지 검사한다.
4. 위/아래/좌/우·대각선8방향, 중앙 데드존, 드래그 방향 변경, 손 떼기, Enter/ESC 짧은 탭/길게 누름, 조이스틱+두 버튼 동시 터치를 검사한다. 회전·홈 화면 이동/복귀·메뉴 열기 후 계속 걷거나 키가 붙는지 확인한다.
5. 좌상단 메뉴 → 화면·조작 설정에서 크기/위치/투명도/버튼 교환/비율 모드. 채우기는 왜곡 가능하지만 잘림이 없어야 한다. 기본 복원 및 탭 재실행 뒤 UI 설정 유지도 확인한다.
6. 오른쪽 `2×`는 현재 비활성이고 게임은1×다. 이번 빌드에서2× 이동·전투·이벤트나 BGM1× 분리를 시험 완료로 적지 않는다.
7. 기존 정상1× 이동과 소리를 확인하고 필드/전투/곡 전환은 구분해 기록한다. 필요 시 메뉴의30초 성능 측정·진단 JSON을 사용한다. `playUi.revision=phase9-8-ui-1`, `speed.supported=false`, `speed.rate=1`, `engine.audioOutput.adapter=mono-v1`, 기준 WASM hash를 확인한다. RAW는 `musicObservation.source=live-worker-query`일 때만 현재 읽기 수치로 해석한다.
8. 진단 종료는 변경분 폐기. 기존 세이브가 보존되는지 확인하되 실제 영구 저장 성공을 이번 UI 작업의 보장으로 보지 않는다.

## 8. 다음 실사용 통합 제안

1. 이번 UI의 Galaxy 조작성·회전·노치·장시간1× 회귀를 먼저 확인한다.
2. Phase9-7을 일반 플레이 기본으로 승격하는 일은 별도 명시 승인과 실제 세이브/복원 검증 뒤 결정한다. 이번 단계에서 자동 승격하지 않았다.
3. 2× 연구를 계속하려면 게임/드라이버의 음악 선택·루프·정지/재개와 장치별 출력 경로를 먼저 관측해야 한다. RAW 읽기를 임의 재생 명령으로 사용하지 않는다.
4. 독립 가상시간 실험은 PIC/IRQ/DMA/믹서의 clock 경계를 정의하고 공개 OPL/PCM/스트리밍/반복·정지 시험을 통과한 별도 엔진에서만 한다. 검증 전에는 이번 비활성 버튼을 연결하지 않는다.

**완성: 몰입 UI와 조작·설정·1× 보존. 미완성: 실제 게임2×, BGM1× 시간 분리,2× 효과음/발열/자동복구.** 기술적으로 영원히 불가능하다는 결론이 아니라, 현재 증거와 안전 조건에서 아직 활성화할 수 없다는 결론이다.
