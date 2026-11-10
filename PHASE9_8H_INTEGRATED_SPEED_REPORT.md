# Phase 9-8H — 전체 오디오 동반 2× 실사용 시험판

작성: 2026-11-10. 기존9-8B/D/E/F/G 소스·보고서를 검토했다. 사용자 요구 변경에 따라 **게임+BGM+SE 전체 가속**을 BGM 분리와 독립적으로 구현했다. 기존 BGM1× 분리 연구는 보존한다.

**별도9-8H 진단에서 실제 제품2× 버튼을 사용할 수 있게 연결했다. 공개 DOS 타이머와 고정 cycles 공개 WebAudio 출력의 약2배 변화 및1× 복귀를 검증했다. **cycles max의 오디오 공급 지연은 재현됐고, 그 조건의 무중단2×는 해결 완료가 아니다. 활성 오디오 공급 지연 시 native1×를 확인하고 해당 세션2×를 제한한다.** 실제 ED4의 이동·전투·이벤트 배속과 Galaxy 음질·발열은 아직 미검증이다.** Git Commit/Push/원격 배포는 수행하지 않는다.

## 1. 명시적 실험 진입과 Worker/native 제어

임시 실행 추적 메뉴에 `Phase 9-8H 전체 2× 실험 · 음악도 가속 · 저장 안 함`을 추가했다. 기본 Stable 및9-7/9-8D/9-8F는 그대로며 기존 프로필을 자동 변경하지 않는다. 선택은 저장하지 않고 다음 메뉴는Stable로 돌아온다.

새 경로:

- `public/vendor/experimental/phase9-8h/` → 배포 `docs/ed4/vendor/experimental/phase9-8h/`.
- 해시를 포함하는 독립 `dos-worker-common-phase9-8h-*.js`, `dos-worker-phase9-8h-*.js`.
- `src/speed-control.ts`, `src/speed-audio.ts`: H 전용 제어·예약.
- `src/engine.ts`, `src/main.ts`: H일 때만 제어 연결/버튼 활성화. 기존4방향/Enter/ESC/전체화면 배치는 보존.
- `src/scene-diagnostics.ts`: 기존 장면 JSON에 `integratedSpeed` 메타데이터 추가.

요청은 session UUID/증가하는 request ID/kind/set rate를 포함한다. Worker는H 엔진·실행 상태·native export·동일 session·중복 요청·정확한1/2를 검사한다. native setter 반환 후 **별도 getter의 실제값**과 PIC tick/오디오 계수 등을 응답한다. 부모는 다른 세션·늦은 ID·다른 엔진·잘못된 수치를 거부한다. 타임아웃을 성공으로 취급하지 않는다.

버튼은 처음1×, 클릭→확인 대기(중복 탭 차단)→native 확인 후2× 활성 표시, 다시 클릭하면1×다.1.5× 없음. H 이외의 엔진에서는 비활성이다. BGM 소유권이나 순정 게임 해시는 활성 조건이 아니다. 런처 Worker/WASM 무결성은 계속 검사한다.

## 2. 타이머와 별도 WASM의 최소 변경

기존9-8F GPL 대응 소스를 검증한 뒤 새로운 `artifacts/phase9-8h/source/instrumented`에 추출했다. 기존 소스·바이너리는 덮어쓰지 않는다. Emscripten3.1.21/기존Node14.18.2/CMake3.24.2/Ninja를 재사용했고 설치·다운로드는 하지 않았다.

변경한 native 파일은2개다:

1. `native/dosbox/src/dosbox.cpp`: 기존 `ed4_test_set_speed(1|2)`와9-8B의 `ticksRemain` 배율 코드는 **그대로** 유지하고, 실제 현재 배율을 반환하는 `ed4_speed_value()`만 추가.
2. `native/dosbox-jsdos/jsdos/jsdos-mixer.cpp`: PCM 배출 시계를 host `GetMsPassedFromStart()`에서 guest `PIC_Ticks`로 변경. 실제 송신 frame 수·underrun·상한 계수 export 추가. `MIXER_CallBack`이 샘플 부족으로 일찍 반환하면 예전 blockBuffer를 다시 보내지 않도록 성공 여부를 반환한다.

CPU opcode/메모리/VGA/IRQ/DMA/BGM 슬롯은 수정하지 않았다. Phase9-5B VGA 호환, Reboot_Handler Asyncify,9-6 CPU trace OFF,9-8F INT69 반환 관측을 유지했다. 빌드의 기존 Asyncify nonmatching 경고는 남아 있고 빌드는 성공했다. 명령 단위 CPU 추적을 재도입하지 않았다.

```powershell
node scripts/prepare-phase9-8h.mjs
wsl -d Ubuntu-24.04 -- bash scripts/build-phase9-8h.sh
node scripts/package-phase9-8h.mjs --stage
npm run build
```

prepare는 새 경로에 `wx`로 추출한다. 이미 준비된 소스에 재실행하면 덮어쓰지 않고 실패한다. 배포 GPL ZIP의 `BUILD-PHASE9-8H.md`에는 직접 빌드 명령, `source-changes.json`에는2개 파일의 전후 SHA가 있다.

**H WASM SHA-256:** `8f799f50bb6ade563124922057195d3bc013e269f40dd7c585307125b780cc14` (1466668B).

## 3. 전체 오디오 가속 방식과 중복 배속 방지

기존 믹서는 guest tick에서 장치 샘플을 생성하지만 host 시간에 맞춰 PCM을 배출했다.9-8B/F 시험에서 게스트 시간이2×여도 전달 PCM 주파수는 거의 그대로이고 활성 구간만 줄었다. 이런 배출 상태에 WebAudio2×만 덧붙이면 공급 부족/불균일 재생이 생길 수 있다.

H는 **guest1초당 약22050 mono frames**를 배출한다. 게스트2×에서는 같은 현실 시간 동안 약2배의 샘플을 전달하고, 브라우저가 `playbackRate=2`로 이를 소비한다. 샘플레이트 필드를44100으로 또 바꾸지 않는다. AudioContext의 실제 출력 rate(예:48000Hz)는 별개의 브라우저 장치 설정이다.

```text
게임 타이머1×/2× → 기존 BGM+SE 믹싱·SB/DMA
→ guest-clock PCM 배출 (source22050Hz mono)
→ AudioBufferSourceNode playbackRate1/2
→ 실제 AudioContext 출력
```

원래 게임 오디오 전체를 재생하며 독립 BGM 플레이어를 켜지 않는다. BGM-only 억제/전체SB음소거/피치 보정/시간 늘이기/RAW 변환은 없다. 음높이 상승을 허용한 새 요구에 맞춘 경로다.

WebAudio에서 playbackRate는 샘플 소비율이고, `start()`의offset은 원본 buffer 기준이다. 따라서 지속시간은 `(buffer.duration-offset)/rate`로 예약한다. [MDN playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate), [MDN start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start).

## 4. 전환·큐·실패 복구

H는 기존 mono-v1 변환을 유지한다.9-8D의 “이미 예약한 소리에 겹쳐 시작하지 않는다”는 원칙도 유지한다. H 전용 초기/late lookahead는60ms다. cycles max 공급 지연에100ms도 시험했으나 해결되지 않아 불필요한 지연 증가를 되돌렸다. 지연을0이라고 숨기지 않고 실패·복구 결과를 부록에 남겼다. 정상 큐는 직전 끝에 이어 붙인다.

1×↔2× 응답을 받으면 현재 AudioContext 시각을 기준으로 각 buffer의 **아직 재생하지 않은 offset**을 계산한다. 이전 source를 정지하고 해당 나머지만 새 배율로 연속 예약한다. 처음부터 재생하거나 전체 큐를 버리지 않는다. 별도 unit 시험에서 offset 진행·연속 예약·반복 전환을 확인했다. 배율 경계의 순간적인 음색 변화와 Galaxy 장치 click 여부는 실기 확인 대상이다.

명시적인 일시정지에서는 AudioContext와 guest를 함께 멈추고, 아직 도착 중인 H packet도 큐에 유지한다. 재개 시 같은 context 시계와 남은 source를 사용한다. 과도한 예약은 무조건 예약점을 앞당겨 겹치지 않고 오류로 처리한다.

안전 정책:

- 1초마다 bounded native status 조회. 제어 요청이 진행 중이면 추가 조회를 겹치지 않는다.
- 2×에서3ms를 넘는 공급 공백이 발생하고 직전/새 PCM block에 비영점 신호가 있으면 즉시1× 복구 시도. 실제 출력 공백이 전혀 없었다는 뜻이 아니라 최초 발견 후 추가 가속을 제한한다. 샘플은 메모리에서만 검사하며 진단에는 audibleUnderruns 계수만 남긴다. 완전한 무음 큐 공백은 별도 underruns로 기록한다.
- 큐500ms 초과/64개 초과,3초 내 반복적인 공급 지연5회, native underflow 증가 또는 clamp도1× 복구 사유다.
- native1× ACK를 받은 뒤 host rate도1로 복귀. 긴 큐는 guest를 잠시 pause하여 기존 오디오를 최대1초간 소진하고 확인 후 재개한다.
- 복구 후에는 해당 세션의2×를 제한하고 오류 이유를 표시한다. 자동 재시작이나 다른 엔진 대체는 하지 않는다.
- 응답이 없거나 큐 복구가 확인되지 않으면 “복구 확인 실패 · 실험 사용 중단/진단 종료”를 표시한다. 실패를 무음으로 숨기지 않는다.
- 128개 buffer의 절대 상한을 넘으면 더 쌓지 않고 누락 수를 기록하여 실험 실패로 처리한다. **이 상태는 허용된 정상 재생이 아니다.** 정상 공개 시험의 누락은0이다.
- 종료 시 native1× 요청/확인을 시도하고 Worker를 폐기한다. 확인 실패는 로그에 남긴다. 다음 실행은 새 WASM의 기본1×를 다시 확인하며 이전 배속을 저장하지 않는다.

RuntimeError가 발생한 게임이1× ACK만으로 정상화됐다고 주장하지 않는다. fatal 오류이면 native1× 확인과 별개로 실험 종료를 안내한다.

## 5. 실제 공개 시험 결과

### 제품 Worker 타이머

임시 public COM이 BIOS36tick을 기다린다. Worker/WASM/버튼은 실제 배포 코드다. CPU12000/max는 공개 fixture의 CONF만 바꿔 비교하고 cycles 숫자 배증을 시간 배속으로 사용하지 않는다.

최종 소수점 계산 보정 전 첫 공개 실행 측정:1×1925.3ms→2×983.9ms→1×1968.7ms→2×970.9ms→1×1944.7ms. native ACK와 UI가 일치했고 재시작1×도 확인했다. 최종12000/max 결과는 아래 검증 부록에 기록한다. 이 수치는 실제 게임 이동 FPS가 아닌 게스트 BIOS 시간이다.

### 동시 합성 BGM/SE와 실제 WebAudio 렌더링

9-8G의 CC0 COM(500Hz BGM+1000Hz SE, 실제 SB DMA/IRQ)을 재사용했다. **BGM 억제 기능은 사용하지 않았다.** Worker에서 전달한 공개 PCM과 실제 source.start 예약/offset/playbackRate를 기록한 뒤48000Hz OfflineAudioContext로 렌더링했다. source rate와 브라우저 최종 출력의 속도를 구분한 시험이며 Galaxy 스피커 녹음은 아니다.

| 선택 | 렌더된 BGM 성분 | 렌더된 SE 성분 | 활성 구간 |
|---|---:|---:|---:|
|1×|500Hz|1000Hz|1.13846초|
|2×|1000Hz|2000Hz|0.56923초|
|1× 복귀|500Hz|1000Hz|1.13848초|

위 표는 최종 소수점 계산 보정 전 공개 실행 측정이다. 최종 빌드 재측정은 검증 부록에 기록한다. 2×에서 주파수 성분이 실제로 두 배이며 길이는 절반이다.1×/2×의 BGM 성분 진폭은 약0.1524,SE는약0.2592로 유지됐다. 이 시험 큐 최대약108ms, overlaps0, droppedFrames0, underruns0. mono source22050Hz는 바꾸지 않았다.9-8G에서 기록한 single-cycle 끝의 짧은 장치 과도음까지 이번에 없앴다고 주장하지 않는다.

### 복구 및 보존

실제 native가2×를 처리한 뒤 ACK를 거부한 fault injection에서 별도 native1× ACK를 확인하여 복구했다. 모든 속도 응답을 막은 시험에서는 미확인 배속을 성공으로 표시하지 않고 명시적 실패/종료 안내를 확인했다. 안정 엔진으로 몰래 대체하지 않았다.

VGA mode3/19 공개 copy/RETF 유지, mode7의 기존 제한 유지, INT69/INT66/IRET 관측 유지, 실제 hash 검증, 오프라인 H 시작, 기존 세이브·OPFS 재사용 및 진단 write 폐기 시험을 추가했다. 신규 unit6개 포함344개 통과. 최종 지속 재생/기존 회귀 수치는 아래 부록에 기록한다. 재빌드 후 저장 시험이 이전 H SHA를 기대해 실패한 경우는 새 바이너리 SHA로 갱신하여 같은 무결성·데이터 비교 조건으로 재검증했다.

## 6. 진단 자료와 관측 한계

일반 진단과 기존 장면 JSON의 `integratedSpeed`에 다음을 포함한다:

- 현재 확인된 rate/verified/pending/fault/recovery count.
- 같은 session의 요청/ACK/실패 최대128개, native guestTicks/cycles/auto flag.
- native audioFrames/underflows/clamps, host frame/audio packet 누계.
- host queueAhead/maxAhead, queuedBuffers, underrun/audibleUnderrun/gap/overlap/drop, 재예약 횟수.

오디오 PCM은 **테스트의 공개 합성음에서만** 수집했다. 제품 진단에는 음악 샘플/게임 메모리/세이브 바이트를 넣지 않는다. 주기 상태와 순간 전환 기록은 제한된 크기로 유지하며 명령당 JS 메시지를 보내지 않는다. 화면 callback 수를 실제 게임 진행량이라고 표현하지 않는다.

처음 작성한 신규 시험에는 전체화면 전 숨겨진 버튼 클릭,9-8F에서 복사한 “버튼 비활성” 기대값,측정 결과의rate를0으로 덮어쓴 fixture 오류가 있었다. 각각 실제 UI 순서/H 활성 요구/변수 저장을 수정했다. 또한 지속 재생 후 일시정지/재개 시험에서 AudioContext.resume() 완료 전에 guest를 재개하여 정상 재개를 오디오 중단으로 오인하는 실제 순서 문제를 찾았다. H 경로에서만 resume Promise 완료 후 guest를 재개하도록 수정했다. 정수 PIC tick으로 배출 시계를 바꾼 뒤 샘플 수의 소수점 잔여분이 잘릴 수 있던 계산도 double로 유지하도록 수정했다. 이는 장기 누적 오차 예방이며 Galaxy 음질 문제의 원인으로 단정한 것이 아니다. 기존9-8F/G 테스트의 조건은 변경하지 않았다. 앱2× 실패를 성공으로 덮은 것이 아니다. 실제 H 오디오 측정은 수정된 시험의 결과다.

## 7. 데이터·기존 연구·배포

9-8G의 슬롯1/2,12800B scratch,합산/공유DMA 경계 보고서·공개 실험은 그대로 보존한다. BGM 분리가 불가능하다는 결론을 추가하지 않았다. 이번에 새 믹서 hook이나 게임 바이너리 패치를 만들지 않았다.

게임·RAW53개·실제 SAVE·프로필·IndexedDB/OPFS를 변경하지 않았다. 실험은 원래 진단 경로의 `discardWrites:true`를 유지한다. 게임 파일 해시를 허용 조건으로 추가하지 않았다. 공개 시험은 별도 임시 Chrome 저장소를 사용하며 실제 Galaxy 데이터 보존을 PC에서 직접 검사했다고 주장하지 않는다.

`docs/ed4/`에 새 실행기/H별도엔진/GPL 대응 소스를 준비한다. 빌드 ID·manifest·서비스 워커는9-8E 방식을 유지하고 새 immutable Worker/H WASM을 오프라인 캐시에 포함한다. 기존 Stable/9-7/9-8D/9-8F 파일은 보존한다. 실제 GitHub 업로드는 사용자 작업이다.

## 8. Galaxy에서 할 최소 시험

1. 사용자가 GitHub Desktop으로 Commit/Push하고 Pages 배포 완료 후, 게임이 종료된 상태에서 기존 **업데이트 적용**을 사용한다. 빌드 ID가 `9-8h-...`인지 확인한다. 사이트 데이터 삭제·게임/RAW 재등록은 하지 않는다.
2. **임시 실행 추적 → Phase 9-8H 전체2× 실험 · 음악도 가속 · 저장 안 함**을 명시적으로 선택해 기존 GAME.BAT를 실행한다. 처음은1×다.
3. 첫 필드에서 전체화면 오른쪽 위 **2×**를 누른다. 확인 뒤 버튼 활성 표시, 이동과 음악/효과음 변화, 끊김·중복·지연 여부를 확인한다.
4. 다시 눌러1×로 복귀한다. 이동·음악 속도가 돌아오는지 확인한다. 가능하면 전투에서2×도 한 번 확인하되, 음악9→10→9 자료를 다시 모으기 위한 필수 순서가 아니다.
5. 문제가 있거나 비교 결과를 전달하려면 기존 장면 진단에서1×/2×/복귀 시점에 **필드**를 각각 기록하고 마지막에 통합 JSON 하나를 받는다.2×/1×는각 snapshot의integratedSpeed에 기록된다. 진단 종료는 저장하지 않는다.
6. 오류가 나면 복구 메시지를 확인한다. “복구 확인 실패/실험 중단”이면 계속 플레이하지 말고 진단을 받은 뒤 종료한다. 기존9-7 정상 경로로 돌아갈 수 있으며 저장소 초기화는 불필요하다.

현재 Galaxy에 전달할 수 있는 **전체 오디오 동반2× 시험판**이며, 실게임 성공 판정은 사용자 실기 이후다. 모바일 CPU 여유·발열·장시간 예약·필드/전투/이벤트의 시간 기준·전환 경계의 실제 음질은 아직 확인해야 한다. 특히 실제 설치본의 cycles max에서2×가 지속될지는 미확인이고, 지연이 관측되면 시험은1×로 복귀·제한된다. 이번에 cycles/CPU 코드를 강제로 변경하여 이 한계를 감추지 않았다. 세이브 영구 저장의 실기 안정성을 이번 작업으로 보장하지 않는다.

## 9. 최종 검증 부록

### 배포 식별자와 보존

- 최종 실행기 빌드: `9-8h-20261110013518083-78b5b0b9`.
- 기존 Git HEAD: `0879a8287b69`. 미커밋 작업 상태이며 Commit/Push하지 않았다.
- H WASM: `8f799f50bb6ade563124922057195d3bc013e269f40dd7c585307125b780cc14`.
- H 공용 Worker: `9fb9a330efa3730f683a2ee774cd74f1f8576e86fb5f0be451156e7c68503d8e`.
- H 진입 Worker: `d35f9ac09899b33c4be2b65b745ad187732f74f3c490c22d7a0694c20b2ce3c2`.
- H GPL 대응 소스 ZIP: `095e1a1c0c2e957689fd06abbd47516fe77c11c3fc14c54103089aec357ebf42`.
- 빌드 manifest121개 파일의 실제 해시, SW 해시, 하위 경로, 엔진 메뉴, Git 줄바꿈 후 바이트 일치 검사 통과. 배포 파일100MiB 초과0, 금지 RAW/EFC/SAV/ISO/CUE 파일0. `.nojekyll` 유지.
- 작업 전180개 파일 비교에서 **기존 엔진/Worker/대응 소스 및 연구 자료178개가 동일**했다. 바뀐2개는 새 런처 코드·보고서를 담는 `public/sources/ed4-mobile-source.zip`, `docs/ed4/sources/ed4-mobile-source.zip`이다.
- 실제 Galaxy 원본 저장소를 읽거나 수정하지 않았다. 공개 임시 Chrome 데이터로 IDB/OPFS/SAVE 유지 및 진단 변경분 폐기를 검증했다.

### 자동 시험

| 구분 | 결과 |
|---|---:|
| 기존338 + 신규6 단위 시험 | 344/344 |
| TypeScript / production build | 통과 |
| 기존 기본 Chrome E2E | 38/38 |
| Pages 하위 경로/오프라인 | 2/2 |
| 9-8 조작 UI / 9-7 UI | 3/3, 2/2 |
| 9-8B / C / D | 7/7, 6/6, 14/14 |
| 9-8E / F / G | 6/6, 11/11, 1/1 |
| 신규 H — 타이머/오디오/복구/저장/메모리 | 13/13 |

기존90개 회귀를 실행한 뒤 H에서 발견한 문제를 수정했고, 최종 빌드에서 H13개·9-8E6개·Pages2개를 다시 실행했다. 총 고유 브라우저 시험103개다. **max 스트레스 시험의 통과는 안전한1× 복귀 검증이며, max 무중단2× 검증 통과가 아니다.** 이전 실패 로그도 남겼다. 기존 테스트의 조건을 낮추거나 삭제하지 않았다.

실행 로그: `artifacts/phase9-8h/final-*.log`, `release-*.log`, `unit-final.log`, `build-release.log`. 최종 수치: `measurements-release.json`. 초기 max 실패의 공개 PCM 자료는 `max-underflow-before.json`으로 별도 보존했고 Git/배포에 포함하지 않는다.

### 최종 타이머·오디오 측정

BIOS36tick 실제 경과시간(ms):

| CPU 설정 | 1× | 2× | 1× 복귀 | 2× 재전환 | 최종1× |
|---|---:|---:|---:|---:|---:|
| 12000 | 1933.3 | 971.7 | 1956.8 | 986.6 | 1938.9 |
| max | 1976.1 | 975.1 | 2031.3 | 1026.1 | 2019.5 |

첫1×/2× 비율은 각각 약1.99/2.03이다. max의 무음 타이머 큐에는4회 공급 공백(도착 지연 합26.0ms)이 기록됐지만 인접 PCM은 무음이었다. 이를 음악2×의 무결점 재생 증거로 사용하지 않는다.

동시500Hz/1000Hz 합성음, 고정cycles12000, 실제 제품 WebAudio 예약을48000Hz OfflineAudioContext로 렌더링한 최종 결과:

| 속도 | 주파수 성분 | 활성 길이 | 큐 중복/누락/공급 지연 |
|---|---|---:|---|
|1×|500/1000Hz|1.138458초|0/0/0|
|2×|1000/2000Hz|0.569229초|0/0/0|
|1× 복귀|500/1000Hz|1.138479초|0/0/0|

위 시험의 큐 최대86.7ms. 지속 시험은 합성음23회, 측정구간23.56초(2× 반복20초+일시정지/재개+복귀)로 큐 최대126.7ms, overlaps0, droppedFrames0, underruns0, native underflow0/clamp0였다. 장시간 Galaxy 배터리·발열 시험은 아니다.

### 해결하지 못한 max 조건과 안전 제한

추가 max 합성음 시험에서는 비영점 PCM 사이의 실제 예약 공백이 재현됐다.100ms 선행 예약으로도 해결되지 않았고, 한 시험의 음악 길이 비율은1.663이었다(기준1.7~2.3 미달). 단순 버퍼 증가를 해결로 처리하지 않았다. 최종 선행 예약은60ms로 되돌렸다.

최종 max 스트레스 시험은 실제2× ACK 이후 공급 지연을 감지하여 **native1× ACK, host1×, 버튼 제한**을 확인했다. 이 실행에서 공급 공백2회, audibleUnderruns2, overlaps0, droppedFrames0가 기록됐다. 별도220ms main-thread 정체 주입에서도1× 실제 복귀와 제한을 확인했다. `gapSeconds`는 기존 큐 끝 대비 packet 도착 지연이며, 늦은 큐에 추가하는60ms 선행 예약까지 포함한 전체 가청 공백 길이와 같지 않다.

즉, 공백을 과거로 되돌려 없애는 복구가 아니다. 이미 발생한 지연은 진단에 남고 추가2×를 중지한다. 복구 ACK가 사라지면 복구 성공을 표시하지 않고 실험 종료를 안내한다. 전체 SB음소거, PCM 버리기, 안정 엔진 자동 대체는 없다.

근본적인 max 공급 변동의 세부 원인(CPU auto-adjust, 게스트 tick 배분/스케줄, Worker 전달 및 host 처리의 비중)은 아직 확정하지 않았다. 기존9-7 및 게임의 cycles 명령을 임의 변경하지 않았다. 다음 최적화는 이 재현 조건을 대상으로 해야 하며, 현재 결과로 Galaxy 모든 장면의2×와 무중단 음악을 보장할 수 없다.

### 완료와 미완료

**완료:** 명시적 H 진입, 제품2× 토글, 실제 native 확인/재시작1×, mono 전체 오디오 가속, 반복 전환, 일시정지 재개, 공급 불안정 시 검증된1× 복구와 제한, 기존 장면 진단, 공개 보존 시험, 별도 WASM/GPL 소스/배포본.

**미완료:** cycles max 조건의 지속적인 무중단2×, Galaxy 실제 ED4의 필드·전투·이벤트2× 및 음질·발열·장기 안정성. 실제 게임 세이브 영구 저장 안정성도 이번 시험의 성공 항목에 추가하지 않는다.
