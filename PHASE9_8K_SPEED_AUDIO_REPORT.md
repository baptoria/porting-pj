# Phase 9-8K — 실제 2× 공급 안정화 시험

작성: 2026-11-10. 기존 프로젝트와 일반9-7 실행을 유지했다. Git Commit/Push 및 원격 배포 조작 없음. 실제 게임은 이 작업에서 PC로 실행하지 않았다.

## 판정 범위

별도 K 엔진에서 **네이티브 시간 계산·협력적 실행 양보·속도별 공급 관측·2× 오디오 전환 준비**를 구현했다. 기존 I의 공개 max 공급 부족을 다시 재현했고 K에서 개선된 구간을 확인했다. 이는 PC 공개 DOS 시험 결과다. **Galaxy ED4의 이동·전투 약2×와 장시간 음질 개선은 아직 미검증**이며 안정 버전으로 승격하지 않는다.

일반9-7, 기존 Stable/H/I 등은 그대로다. K는 사용자가 명시적으로 선택하는 저장하지 않는 진단이다. J 저장 시스템은 동결했다. BGM 분리·피치 보정·게임 파일 분석은 추가하지 않았다.

## 1. Galaxy19 자료와 해석

프로젝트 루트/Downloads에서 원본18·19 JSON을 찾지 못했다. 사용자 제공 사실을 사용한다: I 무결성/2× ACK 정상, 실제 음악 가속, 출력 부족967회·약11.095초, overflow/drop0, native underflow/clamp 마지막 관측0, 복귀 후에도 부족, 화면 콜백 약12.95/s. Worker 평균 패킷 간격21ms/최대105ms, 복사·전송 평균0.011ms, 최대 출력 큐72ms는 **속도가 섞인 세션 통계**다.

이 값만으로 2× 공급량이나 실제 휴대폰 CPU 사용률을 계산하지 않았다. native underflow0은 믹서가 실행된 시점에 필요한 데이터를 갖고 있었다는 관측이지, 실시간에 필요한 만큼 PIC tick/PCM이 생성됐다는 뜻이 아니다. Worklet은 AudioContext 시간에 계속 소비하므로 게스트 진행이 늦어지면 native 오류 없이도 실제 출력 공백이 생긴다.

22050Hz mono의 소비 목표는 1×22050 source frame/s, 2×44100 source frame/s다. outputRate=48000Hz일 때 각각 source step=0.459375/0.91875다. 출력 장치 샘플레이트를22050으로 가정하거나 패킷 수만으로 음악 재생 속도를 판정하지 않는다.

## 2. 소스에서 확인한 경로와 병목 후보

`native/dosbox/src/dosbox.cpp::Normal_Loop/increaseticks`, `native/dosbox-jsdos/jsdos/jsdos-mixer.cpp::MIXER_Mix`, I Worker bridge/Worklet을 비교했다.

- I는 CPU/PIC 작업 묶음을 처리한 뒤 다음 Normal_Loop 진입에서 약16ms 양보 기한을 검사한다. 긴 묶음 중에는 JS 메시지 처리를 기다릴 수 있다.
- wall tick 증가를20ms로 제한한 다음 기존2× 배율을 곱한다. 긴 host 정체에서는 제한 밖의 시간이 처리되지 않는다. K는 제한을 임의 해제하지 않고 횟수/시간을 기록한다.
- JS 포크의 같은 밀리초 재확인 분기에는 `ticksDone=0`이 있었다. 이미 누적된 처리 시간도 지워져 auto cycles 계산이 처리/대기 시간을 제대로 구분하지 못할 수 있다.
- 믹서는 PIC_Ticks 차이로 샘플 수를 계산하고 최소512 source frame 이상에서 전송한다. 정상적인 약24ms guest 구간은1×에서약24ms,2×에서약12ms wall 공급 간격에 해당한다. 믹서/PIC가 적게 실행되면 WebAudio 노드 교체만으로 공급량을 늘릴 수 없다.
- I의 Worker-local Asyncify 재개와 Worker→Worklet 직접 전송은 유지한다. 메인 스레드가 PCM을 중계하지 않는다. 기존 자료에서 복사0.011ms를 Galaxy의 확정 병목이라고 볼 근거는 부족하다.

공개 A/B에서는 I max가 부족과1× 복귀 후 계속 부족을 재현했다. K의 변경이 모든 실제 게임/기기 지연 원인을 설명한다고 확정하지 않는다. OS 스케줄링·개별 guest tick의 높은 실행 비용·오디오 시계와 wall 시계 차이는 여전히 제한이다.

## 3. 실제 수정

### 네이티브 K — DOSBox 파일 한 개

검증된 I GPL ZIP을 추출하고 `dosbox.cpp`만 변경했다. Emscripten3.1.21, 기존 WSL/CMake/Ninja, CPU_TRACE_ENABLED=OFF를 재사용했다.

1. Normal_Loop 진입 및 **완료된 guest tick 경계**에서4ms 경과를 확인하고 기존 DelayWithYield(0)로 양보한다. 명령 단위 계측/CPU 명령 생략/PIC·IRQ·DMA 생략은 없다. 한 tick 자체가4ms보다 오래 걸리는 경우까지 강제 선점하지 못한다.
2. 같은 wall tick 대기에서 누적 busy 시간을0으로 지우지 않는다. 대신 실제 idle 대기의 wall 시간만 측정하고 소수 잔여를 보존해 기존 cycles 조정식의 처리 시간에서 제외한다. 기존 목표 비율/상하한/게스트 cycles 명령은 유지한다. 고정 cycles를 자동으로 강제하지 않는다.
3. 양보 횟수, 양보 사이 최대 wall 시간(`maxBusyMs`: 이름과 달리 OS CPU 사용 시간이 아님), idle 시간,20ms clamp 횟수/처리되지 않은 wall tick을 읽기 전용 scalar로 제공한다.

**폐기한 후보:** 처음에는 idle 시간을 빼지 않고 누적값만 보존했다. 공개 max에서 cycles200까지 감소해 타이머만2×이고 계산 처리량이 훼손될 수 있었다. 해당 후보를 성공으로 판정하지 않았으며 현재 배포용 K WASM은 이 후보가 아니다. `candidate1/`에 근거를 보존했다.

### 공급·소비 관측

- Worker 생성/전송 frame 수, PIC tick, cycles/auto, packet 수, 마지막 생성 이후 공백, native counters를 약500ms 구간과 실제 속도 변경 경계에서 나눈다.
- Worklet 소비 frame 수·실제 부족 frame·입력 도착·queue 변화는 **AudioContext render clock** 기준으로 따로 나눈다.
- 각 구간에는1×/2×가 있으며 총계도 속도별로 분리한다. 전환 직후에는 이전 속도로 준비된 pending guest ticks/PCM이 존재할 수 있어 안정 구간과 구별해야 한다.
- 보존 상한256행, 전송은 최근2행만 사용하고 중복/누락/퇴역 행 수를 표시한다. 기존 SpeedControl 요청/ACK 이력128행 상한도 유지하므로 긴 세션의 최초 제어 이벤트까지 모두 남는 것은 아니다. 속도별 누적계와 구간 getter 관측을 함께 확인한다. 과거를 추정 복원하지 않는다. 4Hz/2Hz 메타데이터이며 명령마다 JS 호출하지 않는다. 샘플·RAW·게임 메모리·세이브를 내보내지 않는다.
- I의 처음60초 오디오 초기 통계는 유지하되 K는 그 이후에는 최초 비영점 신호가 관측된 뒤 매 샘플 peak/DC 스캔을 반복하지 않는다. 처음60초 이후에 음악이 시작해도 최초 신호 관측은 유지한다.

### Worklet 전환 준비

PCM 링은 기존65536 float(256KiB), 최초60ms 준비를 유지한다. 용량/부족 기준을 높이지 않았다. 이미1×로 재생 중이면 같은 source frame 큐가2×에서는 절반 길이가 된다. K는 native2×를 요청한 뒤 **실제2× 기준60ms 공급이 준비될 때까지 기존 큐를1×로 계속 재생**하고, 준비 후 Worklet2× ACK를 반환한다. 짧은 전환 준비 시간이며 지속 부족을 정상으로 숨기는 정책이 아니다. 2초 응답 상한 안에 준비하지 못하면 기존1× 복구로 실패를 드러낸다. 버퍼 복제/샘플 삭제/강제 무음/재부족 때 반복 preroll은 없다.

호스트 UI는 native와 Worklet 확인이 끝나야 전환을 완료한다. 요청 속도와 확인 속도를 구분한다.1× 복구 ACK 이후에는 별도로 최근 출력 상태를 관측하여 `recent-output-healthy`, `continued-output-starvation`, `recent-output-gaps`, `output-not-observed`, `native-ack-failed` 등을 JSON에 기록한다. native1× ACK만으로 오디오 회복까지 보장하지 않는다.

## 4. 공개 시험과 실패 이력

### 동일 공개 COM/합성음 31초 비교

|엔진|cycles|guest tick/s|PCM frame/s|화면 callback/s|실제 공백 ms|Worker 간격 최대 ms|종료 시 속도|
|---|---:|---:|---:|---:|---:|---:|---|
|phase9-8i|12000|2000.0|44100|12.53|0.00|24.1|2×|
|phase9-8i|16000|2000.0|44100|12.43|0.00|24.1|2×|
|phase9-8i|24000|2000.0|44100|12.30|0.00|24.2|2×|
|phase9-8i|max|975.8|21642|5.83|1360.04|102.5|1×|
|phase9-8k|12000|2000.0|44100|12.30|0.00|24.1|2×|
|phase9-8k|16000|2000.0|44100|12.17|0.00|24.2|2×|
|phase9-8k|24000|2000.0|44100|12.33|0.00|24.1|2×|
|phase9-8k|max|2000.0|44100|12.17|0.00|24.3|2×|

I max는2× 실패→1× 복귀가 섞인 구간이므로 지속2× 수치로 해석하면 안 된다. Worker 최대 간격/누적 공백은 해당 실행의 초기 구간도 포함한다. guest tick/s와 화면 callback/s는 별도30초 성능 창, PCM frame/s는 측정 전후 Worker frame/경과시간 차이이다. 표의 K max 실행에서 마지막 cycles는78010이었다. 고정cycles에서 약2×를 유지하는 것과 모든 실제 ED4 계산이2×로 끝난다는 것은 다르다.

### 전환·장시간·부하

최종 후보 기능 시험16/16 통과. 고정16000의 mobile/touch viewport844×390, renderer CPU throttling4×에서1×→2×120초→1×→2×→1×를 확인했다. 각 구간 누적 출력 공백0, runtime exception0, drop0. 별도 Worker8ms/50ms 부하를625회 넣어 실측5000.1ms의 CPU 작업을 추가한31초 시험은guest1999.47tick/s, 출력 공백0, Worker최대간격24.10ms, 화면callback12.43/s였다. 이 부하는 계측 도구로 공개 Worker에만 넣었고 제품/게임 코드는 아니다.

실제 Worklet 출력 tap의 공개500/1000Hz 성분이2×에서1000/2000Hz,1× 복귀 후500/1000Hz로 돌아오며 재생 길이 비율1.9~2.1 범위를 통과했다. 샘플 공급 수만으로 청감 결과를 대체하지 않았다. 의도적350ms 공급 중단은 실제 공백→native1× ACK→추가3.5초 관측의recent-output-healthy를 확인했다.

기존 회귀/최종 배포 검증 집계는 아래에 기록한다. 모든 시험은 새 Playwright 컨텍스트와 공개 COM/합성 PCM·RAW를 사용한다. 실제 ED4 음악/파일을 녹음하거나 실행하지 않았다.

첫 전체 K 후보 시험은11개 중10통과/1실패였다. 고정16000에서769 output frame/48000Hz=16.0208ms 공백이 있었고2×는 유지됐다. 해당 시점 Worker 최대 간격36.7ms, clamped wall tick51(초기 구간 포함), recent queue 약24ms였다. 이 값은 제한된 시계/시간 구간 자료이므로 특정 OS 정체 하나로 원인을 확정하지 않았다. 기존 공백0 검증을 완화하지 않았고 `candidate2-evidence/`, `candidate2-tests.json`, `all-k.log`에 실패를 보존했다. 같은 후보의120초2× 시험은 공백0이었다. 최종 Worklet 전환 준비를 적용한 재검증 결과와 구별한다.

## 5. 화면·입력·성능 한계

Canvas 해상도/렌더링,4방향/Enter/ESC/전체화면 배치는 변경하지 않았다. 기존 프레임 전송 지연과 화면 콜백/paint 기회 계측을 사용한다. 콜백/s는 실제 게임 애니메이션이나 물리 디스플레이 FPS가 아니다. decoder 1/1024 표본 합계는 전체 Worker CPU 시간/휴대폰 부하로 외삽하지 않는다.

모바일 크기 및 CDP renderer4× throttling 시험과 별도로 Worker에8ms/50ms 공개 부하를 주는 시험을 구성했다. renderer throttling이 Worker에도 동일하게 적용됐다고 주장하지 않는다. Galaxy의 발열·스로틀링·전투 프레임·터치 응답은 사용자의 실기에서 판정한다.

4ms는 협력 양보 목표이며 보장된 실시간 deadline이 아니다.20ms wall clamp와 호스트 정체가 계속되면 PCM 부족이 남을 수 있다. 안전 복귀/오류 표시를 유지하며 K를 정상 일반 실행으로 몰래 선택하지 않는다.

## 6. 보존·배포

저장 관련7파일의 작업 전 실제 바이트 SHA-256과 비교하고, 공용 파일의 checkpoint/startGame 본문/openRecovery/recoveryAction/saveControls/engine.save 본문을 줄바꿈 정규화 후 비교했다. 저장 의미 변경 없음. stop handler의 변경은 종료 후 K 오디오 진단 갱신 분기만이다. DB 스키마·tombstone·복구 지점 생성·원본/RAW/SAVE/프로필 마이그레이션은 변경하지 않았다.

기존 public 엔진/GPL 자료87개에서 런처 소스 ZIP 재생성을 제외한 변경 없음. Stable/9-7/H/I WASM을 덮어쓰지 않았다. K Worker/Worklet은 내용 해시 경로, WASM은 실행할 실제 바이트 SHA 검증을 사용한다. 기존 E 업데이트·오프라인 manifest 범위와 데이터 보존 정책을 유지한다.

현재 K WASM SHA-256: `3956d653260f5e69a1cef18785376ba13676d6e5f33d2a118dfde9aa10f89010` (1,467,543B). 기존 Asyncify non-matching onlylist 경고는 로그에 보존했다. 빌드 설치/관리자 변경 없음.

재현: `node scripts/prepare-phase9-8k.mjs`(fresh verified source) → `wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-8k.sh` → `node scripts/package-phase9-8k.mjs --stage` → `npm run build`. 전체 대응 소스 ZIP과 변경 manifest/빌드 스크립트를 함께 제공한다. `docs/ed4/` 준비는 실제 GitHub Pages 업로드 성공을 뜻하지 않는다.

## 7. Galaxy 최소 확인

1. 사용자가 Commit/Push한 뒤 기존 업데이트 적용으로9-8k 빌드 표시를 확인한다. 사이트 데이터 삭제·게임/RAW 재등록은 하지 않는다. 일반 플레이는 기존9-7 선택을 유지한다.
2. 임시 실행 추적에서 **Phase9-8K 공급 균일화 시험 · 전체2× · 저장 안 함**을 명시적으로 선택한다. 우선 cycles는 **게임 설정 유지(max 포함)**로 비교한다. 원본 BAT/프로필 변경 없음.
3. 필드1×에서 음악·이동이 정상인지 잠깐 확인한 뒤2×로30초, 가능하면2분 유지하고 다시1×로 복귀한다. 실제 이동량·음악 끊김·입력·화면과 가능하면 전투 한 구간을 확인한다. 음악 번호9→10→9를 다시 조사할 필요는 없다.
4. 기존 장면 기록/통합 진단 JSON 한 번을 내려받는다. 실제 engine/WASM, `audioSupply.rateWindows`, `integratedSpeed.audio.rateWindows`, speed ACK와 `recoveryOutput`을 확인한다.2× 실패/1×에서도 끊김이면 해당 시험을 끝내고 기존 일반9-7로 돌아간다. 실험 쓰기는 폐기한다.
5. 고정16000 비교는 필요할 때 별도 세션에서 한 변수만 바꾼다. 공개 시험값을 ED4 최적 cycles로 확정하지 않는다.

**미완료:** Galaxy 실제2× 지속 성공, 게임 장면별 계산 처리량·프레임·발열 개선, 모든 host 정체 상황에서 무공백 출력. 세이브 기능 개선 및 BGM1× 분리는 이번 범위 밖이며 현재 구현을 보존했다.


## 8. 최종 자동 검증 집계와 변경 파일

- 수정 전 단위361/361, 수정 후 **366/366**. 기존 조건 삭제/완화 없음. K PCM 출력 불변 비교,256행 상한/누락 표시,실제2× 준비 전 ACK 금지,1× 복구 시 pending2× 취소를 추가했다.
- K 기능 후보 **16/16** 통과(실제 출력/공급 중단 복구/Worker 부하/cycles4종/모바일120초/반복타이머/일반9-7·저장·RAW·오프라인·해시 거절). 이후 속도별 packet 최대 간격·처리 시간 통계와 복구 상태 구분을 보완했다. WASM과 PCM 출력 알고리즘은 동일하다.
- **최종 Worker 추가·재검증4/4**: 실제 출력,350ms 공급 중단 후 확인된1× 및최근출력회복, max31초, max 부팅→일회성16000의2×31초→max 복원1×31초. 마지막 시험은 두 구간 모두 출력 공백0,2×에서cycles16000/auto0,복귀1×에서auto1(마지막124958)을 확인했다. 후보16개와 겹치는 재검증은 중복 집계하지 않으며 고유 K 시나리오는17개다.
- 최종 공개 출력의 유효 음원 길이:1× **1.13065초** →2× **0.56265초** →1× **1.13065초**. 두 합성 성분500/1000→1000/2000→500/1000Hz를 확인했다.
- 기존 브라우저 회귀는 **128/129 통과**. 기본38,Pages2,9-7 UI2,9-8 UI3,B7,C6,D14,E6,F11,G1,H13,J5는 모두 통과. I는20/21이다.
- **보존한 I의 실패를 숨기지 않는다:** 모바일 max 부팅→16000 31초 시험에서1537 output frame=**32.0208ms** 누적 공백으로 기존 공백0 조건이 실패했다.2×는 유지됐고guest1997.29tick/s,1× 복귀/auto 복원은 확인됐다. I 바이너리/Worker/Worklet은 변경하지 않았다. 이전 I 보고서에도 모바일 미세 공백이 기록돼 있으나 이번 공백의 모든 원인을 과거와 동일하다고 확정하지 않는다. 재실행하여 실패를 지우거나 기존 조건을 낮추지 않았다. **전체 회귀가 모두 통과했다고 보고하지 않는다.**
- J 저장 회귀5/5와 기존 저장/백업/마이그레이션/오프라인/모딩 시험은 통과했다. 사용자의 실제 모바일 저장소를 테스트한 결과가 아니라 격리된 공개 자료 시험이다.
- TypeScript, production build,하위경로, Worker/WASM/Worklet/source manifest·SW 파일 해시,100MiB 한도 및금지 확장자 배포 검사 통과. 실제 온라인 Pages 배포나 Galaxy K 성공을 뜻하지 않는다.

배포 식별자는 `src/build-info.json`과 `docs/ed4/build-manifest.json`에서 확인한다. 테스트 후 보고서·소스 패키지를 포함해 최종 빌드를 다시 생성하며, 코드/엔진 변경이 없는 이 포장 빌드에는 배포 무결성과 Pages 스모크를 적용한다.

최종 공용 Worker SHA: `38f8b4d65f003a5c78fa7717ea7d95ebcd005da1562971893c43cacf039e33ac`.
진입 Worker SHA: `3ab5b8e59286cedc55371877dfcde4bbd78f1a371b0e5085b2cecba3c938bea5`.
Worklet SHA: `49773dd9179413cad15e41fe5c32d11cd84c3e921021e099237728c34c03f948`.
Native 대응 소스 ZIP SHA: `c7352ef0dfbabab269feda2af3e06d2c558f1b205eda1b36d5d1a293f4b26b63`.

주요 변경:
- native 패치 생성/빌드/검증: `scripts/prepare-phase9-8k.mjs`, `build-phase9-8k.sh`, `package-phase9-8k.mjs`, `licenses/phase9-8k-engine.json`; 실제C++ `artifacts/phase9-8k/source/instrumented/native/dosbox/src/dosbox.cpp`와동봉GPL ZIP.
- K 통신/출력: `scripts/phase9-8k-audio-bridge.js`, `phase9-8k-speed-worker.js`, `phase9-8k-ring.mjs`, `prepare-phase9-8k-worker.mjs`, `prepare-phase9-8k-worklet.mjs`.
- 호스트 연결/계측: `src/engine.ts`, `src/experimental-engine.ts`, `src/worklet-audio.ts`, `src/audio-supply.ts`, `src/rate-windows.ts`, `src/generated/phase9-8k-*`.
- `src/main.ts`는K 선택/type/cycles 비교/종료 시 오디오 진단 갱신만 변경. 저장 함수 본문은 그대로다.
- 빌드/배포 검증 스크립트와원본소스 패키징, 신규 `tests/audio-k.test.ts`, `tests/phase9-8k/`, `playwright.phase9-8k.config.ts`, `docs/ed4/`.

로컬 증거: `artifacts/phase9-8k/measurement-summary.json`, `final-k-tests.json`, `final-k.log`, `release-smoke.log`, `release-smoke/`, `regression-exits.json`, `regression-summary.json`, `preserved-i-mobile-failure.json`, `preservation.json`, `unit-delivery.log`, `build-native-2.log`, `build-delivery.log`. 중간 실패는 `candidate1/`, `candidate2-evidence/`, `all-k.log`에 보존했다. 이 폴더는Git 업로드 대상이 아니다.
