# Phase 9-8I — 일반 실행 경로와 전체 2× 공급 안정성

작성일: 2026-11-10. 로컬 작업이며 Git Commit/Push 및 원격 배포는 수행하지 않았다.

## 판정

일반 실행에서 사용자가 **Phase 9-7 호환 엔진을 명시적으로 선택**하고 원래 GAME.BAT를 직접 실행하는 경로를 구현했다. Stable 바이너리/기본 선택은 유지했다. 공개 프로그램의 일반 실행·저장·복원·동일 BAT 엔진 비교는 검증했지만, 사용자의 Galaxy 일반 실행 실패 원인은 그 경로의 진단 JSON이 없어 확정하지 않았다. **Galaxy 일반 실행 복구 완료로 보고하지 않는다.**

별도 I 시험 엔진에는 Worker 내부 Asyncify 재개, Worker→AudioWorklet 직결 PCM, 짧은 링 버퍼, 일회성 cycles 비교를 구현했다. 고정 cycles 공개 시험에서 실제 약 2× 시간 진행 및 전체 오디오 가속을 확인했다. **max에서는 공급 부족이 남았으며, 1× 복구는 무중단 2× 성공이 아니다.** Galaxy 개선 여부는 다음 실기로 판정한다.

## 1. 근거와 조사 범위

B/D/E/F/G/H 보고서, 9-5B 메모리 호환 보고서, 실제 소스·고정 엔진·GPL 소스 및 기존 자동 테스트를 대조했다. `ed4-diagnostics (18).json`은 검색한 로컬 프로젝트/다운로드/바탕화면에서 찾지 못했다. 원본 JSON을 생성하거나 있다고 가정하지 않았다.

사용자 제공 Galaxy 수치: H 2× ACK 약50630ms, 1× 복구 요청55106ms/ACK55128ms, 2× 약4.5초, audibleUnderruns5, 누적 공급 공백41.4ms, overlaps/droppedFrames/native underflows/native clamps/runtime errors 모두0, recoveries1. 음악 2×는 허용된 정상 동작이다. cyclesAuto1 및 cycles92130→34733→30659→74726→75366→35981은 자동조절 관측이며 휴대폰 CPU 사용률이 아니다.

이번 작업에서는 상용 게임을 PC에서 실행하지 않았다. 참고 프로젝트의 GAME.BAT는 읽기만 했다. 84B, SHA-256 `d2fb9327484e121b725285a60ec5d5017addc722d7d3f72e2e617af2e8291420`; ECHO OFF → SOUNDRV.COM > NUL → DRIVER.EXE ED4.EXE → SOUNDRV.COM/U > NUL → ECHO ON이다. 이 파일과 현재 모바일 모딩 파일이 같다고 단정하지 않는다. 비정상 명령 문자열은 이 BAT에 없으며 출력만으로 파일 손상 또는 일반 실행 실패를 판정하지 않았다.

## 2. 일반/진단 실행의 차이와 수정

| 경로 | 진입 | 엔진/오디오 | 쓰기 |
|---|---|---|---|
| A 기존 일반 | 프로필 원래 GAME.BAT 직접 | Stable 원래 WASM/host | 기존 체크포인트/종료 저장 |
| B 진단 Stable | bootPlan 임시 ET*.BAT 마커 | 같은 Stable | 폐기 |
| C 진단9-7 | 같은 임시 마커 | 9-6 WASM(VGA 호환+CPU 추적OFF), mono host | 폐기 |
| D 진단H/I | 같은 임시 마커 | 별도 해시 검증 WASM/Worker | 폐기 |
| 추가 일반9-7 | 원래 GAME.BAT 직접, 임시 BAT 없음 | 기존9-7과 동일 WASM/Worker/mono | 기존 저장 코드 |

프로필 CPU/memory/sound, RAW 마운트, ZIP 경로 정규화, 레이어/세이브 합성은 공통이다. 진단은 명시적인 비교 옵션만 임시 적용한다. 실험 I의 cycles override는 2× 요청 시점에만 적용한다. 원본 BAT·프로필 파일은 수정하지 않는다.

공개 `GAME.BAT → PROBE.COM`으로 A/B에서는 `PUBLIC_APERTURE_READBACK_MISMATCH`, 일반9-7/C/D/I에서는 `PUBLIC_468_COPY_AND_RETF_OK`를 확인했다. 마커 유무보다 엔진의 VGA 호환 차이가 결과를 설명한다. Stable은 이전에 발견한 A000 텍스트 비활성 aperture 동작을 유지하고, 9-7은 9-5B 수정이 있다. 이는 **공개 재현 및 강한 원인 후보**이며 Galaxy 일반 실패 당시의 load segment/첫 프레임 실패를 직접 관측한 결과는 아니다.

메인 화면에 작은 일반 엔진 선택만 추가했다. 초기 선택 Stable을 유지하며 사용자가 고른9-7만 `ed4-play-engine-v1` UI 설정에 보존한다. 기존 프로필·조작 설정·DB 스키마 변경 없음. 일반9-7/I는 실제 컴파일 WASM SHA를 검증한다. Stable은 기존 로딩 계약과 배포 manifest 무결성 검사를 유지하며 진단의 Stable SHA는 release pin이지 실행 중 해시 측정값이 아니다. 실패 시 profile-read/raw-mount/runtime-build/worker-wasm-start/backend-ready 단계를 기록하고 화면에 오류를 표시한다. Stable을 다른 엔진으로 자동 대체하지 않는다.

별도로9-7 기존 회귀에서 `No frame received` 시작 실패를 실제 확인했다. 기존 코드는 backend ready 직후 `ci.screenshot()`을 무조건 호출했다. 이제 이 특정 상태에서는 이미 등록한 첫 frame 이벤트를 기다린다(3초 상한, 다른 예외는 그대로 실패). 고정 지연 후 무작정 재시도하는 방식이 아니다. Stable/9-7의 frame 전달을300ms 지연시키는 공개 시험을 추가했다. 이 화면 경합과 Stable의 VGA 동작은 다른 원인 후보이며, Galaxy 일반 실행의 정확한 실패 원인은 여전히 미확정이다.

초기 회귀에서 시작 실패 표시가 늦은 Worker 오류 통지로 덮어써지는 문제도 수정했다. 기존 Phase7 기대값은 그대로 유지한다. 추가했던 Stable 선행 WASM 컴파일/해시 강제는 기존 B의 로컬 독립 엔진 시험 계약과 충돌하여 제거했다. Stable 기존 로더와 배포 manifest 검사를 유지하며, Stable의 pinned release SHA를 실측 해시로 표시하지 않는다.

일반9-7 저장은 기존 저장 경로를 재사용한다. 공개 파일 저장/종료/재실행/불러오기 검증과 실제 Galaxy 게임 SAVE의 안정성은 구별한다. 사용자 세이브에 테스트하지 않았다.

## 3. 재현한 공급 경로 문제

H: CPU/PIC→믹서→PCM→Worker→main→블록별 AudioBufferSourceNode→AudioContext. 여기에 `jsdos-asyncify.cpp::initMessageSyncSleep`의 `ws-sync-sleep → main → wc-sync-sleep` 왕복이 있다. 따라서 PCM만 Worklet으로 직결해도 UI 스레드가 정체되면 **네이티브 재개와 PCM 생성 자체가 기다린다**.

공개220ms main 정체 시험에서 PCM 직결만 적용한 초기 I는 출력 공백/1× 복귀가 재현됐다(`direct-smoke.log`). 이 비동기 재개를 I Worker 내부 MessageChannel로 처리한 뒤 같은 정체 시험은 공백0으로 통과했다. 기존 `Module.receive`, sessionId/alive 확인, Asyncify unwind/rewind, 원래 pause/exit 동작을 사용한다. 동기 재귀 재개·CPU 명령 건너뛰기·opcode 추적은 없다. Stable/H Worker에는 적용하지 않았다.

이 시험은 main 의존성의 인과관계를 입증하지만 Galaxy 모든 지연의 원인을 확정하지 않는다. max의 네이티브 생성 불균일성은 별도 문제로 남았다.

고정 DOSBox `dosbox.cpp::increaseticks()`는 wall tick 차이를 계산한 뒤 `ticksRemain`을20ms로 제한하며, H/I는 그 뒤2×를 곱한다. auto cycles는 ticksScheduled/ticksDone 기반 목표 비율로 CycleMax를 재조정하고 긴 tick에서는1/3로 줄이는 경로도 있다. 따라서 처리 묶음이 오래 걸릴 때 게스트 catch-up과 PCM 생성이 균일하지 않을 수 있다. max 공개 시험에서는 Worker PCM 생성 간격이 수십ms까지 벌어졌지만 I의 local yield 지연은1ms 미만, main 통계 전달 지연은 수ms 수준이었다. 이 구간은 출력 노드 생성 비용만으로 설명되지 않는다. 각 내부 loop의 소요시간을 전부 계측하지 않았으므로20ms clamp 하나를 Galaxy의 확정 원인으로 단정하거나 제거하지 않았다. CPU auto-adjust/타이머 budget의 별도 검증이 다음 후보이다.

## 4. I 출력 구조와 측정

- 원래 mono PCM22050Hz와 H의 PIC 기반 오디오 생성/게스트2× 코드를 유지했다. BGM·SE를 분리하지 않는다.
- 생성 PCM을 Worker에서 한 번 복사해 transferable MessagePort로 Worklet에 전달한다. WASM 메모리를 detach하지 않는다. main에는250ms 간격의 경량 통계만 전달한다.
- 65536 float 링(256KiB), 최초60ms 준비, 이후 공백마다60ms를 다시 더하지 않는다. 실제 큐는 실험 결과에서 별도 확인했다. 저장 파일/RAW를 버퍼로 재인코딩하지 않는다.
- Worklet은 실제 output sampleRate와 render block 길이를 사용한다. 소비 step=`22050×속도/outputRate`. 2×에서 게임과 모든 소리가 같이 가속된다. 배속 변경 때 미소비 샘플/분수 위치를 보존해 기존 샘플 재생 중복을 피한다. 별도 playbackRate=2를 다시 적용하지 않는다.
- I의 AudioBufferSourceNode 생성수와 main PCM 메시지는0이다. 9-7/H 출력 경로는 유지했다. I 미지원/무결성 오류 시 명확히 실패하며 몰래 경로를 대체하지 않는다.
- worker 생성 간격/전달 처리시간, Worklet 도착 간격/실제 소비 부족 프레임, main 통계 메시지 지연, PIC ticks, native 샘플링 decoder 시간, 프레임 전송 지연을 구별한다. main 통계 지연은 PCM 전달 지연이 아니다. OS CPU 시간/휴대폰 사용률은 미측정이다.
- native decoder 시간은 기존 1/1024 호출 표본 합계이며 전체 Worker CPU 시간으로 외삽하지 않는다. 화면 콜백/rAF 기회는 물리 디스플레이 FPS나 ED4 이동량이 아니다. 초기 로딩과30초 측정구간을 분리했다.

[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet), [process](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage) 공식 API 문서를 확인했다. HTTPS/localhost secure context와 AudioWorklet 지원을 검사한다. SharedArrayBuffer/COOP 헤더는 필요 없다. 해시 파일을 기존 오프라인 manifest에 포함했다. Android 실제 지원/오디오 장치 상태는 Galaxy 확인 대상이다.

낮은 output sampleRate에서 소비 step이1을 넘을 때에도 충분한 입력 프레임이 없으면 부분 소비/외삽하지 않도록 단위 시험을 추가했다. 선형 리샘플링은 공개500/1000Hz 시험으로 확인한 범위이며 고주파 aliasing/모든 게임 음질이 동일하다는 보장은 아니다. 샘플은 진단 JSON에 포함하지 않는다. 테스트용 출력 tap은 공개 합성음 시험 코드에만 있으며 제품에는 없다.

## 5. cycles와 안전 복구

H와 I에서 같은 공개 COM/오디오, 같은12000/16000/24000/max CONF를 사용했다. I의 optional native `ed4_cycles_override` 외에 CPU/DOS/VGA/사운드 구현을 바꾸지 않았다. H 소스 대비 변경 native 파일은 `native/dosbox/src/dosbox.cpp` 하나이며 준비/빌드/패키지 스크립트가 이전 해시와 diff를 검증한다.

고정 비교는 사용자가 선택한 I 세션의2× 요청 이후에 적용되므로 GAME.BAT의 cycles max 이후를 비교할 수 있다. 1×에서는 변경 직전 cyclesAuto/값을 복원한다. 게임의 이후 설정 명령을 지속적으로 강제 덮어쓰지 않으며 ACK에 실제 cycles/auto를 기록한다. 자동조절을 복원하면 값은 다시 움직일 수 있다. Stable CONF/BAT 변경 없음.

I는 실제 Worklet 소비 공백을 기록한다. 순간 공백은 누적하고 최근2초 공백24ms 초과, 큐500ms 초과/용량 초과, native underflow/clamp, 제어 오류를 구별한다. H의3ms 도착 기준을 단순 상향한 것으로 해결 처리하지 않았다. H와 I gap 수치는 정의가 달라 직접 같은 지표로 빼지 않는다. I gap은 실제 부족 output frame/sampleRate이고 H gap은 예약 끝 대비 도착 지연이다. I의 무음 구간 부족도 총 공백에 포함되며 비영점 인접 여부는 별도 통계다.

네이티브 ACK와 Worklet ACK를 모두 받은 뒤 UI 상태를 확정한다. pending 중 중복 탭 금지. 1× 복구 후에도 출력 부족이 지속되면 별도로 실험 종료를 안내한다. 복구실패는 성공으로 표시하지 않고 음악을 강제로 숨기거나 Stable로 대체하지 않는다. 큐 overflow는 계수/오류로 드러내며 정상으로 취급하지 않는다.

## 6. 측정 및 회귀 결과

### 30초 동일 공개 합성음 A/B

각 측정 구간31초 이상, 연속 PCM 스트림에서500/1000Hz 합성음을 반복했다(음 사이 무음 구간 포함). PIC tick은 게스트 ms이다. max 행은 보호 복귀 전후가 섞인 측정이며2× 유지 성공이 아니다.

|엔진|cycles|게스트 tick/s|PCM frame/s(약)|화면 callback/s|공백 ms|최대 큐 ms|최종 속도|
|---|---:|---:|---:|---:|---:|---:|---|
|phase9-8h|12000|2000.0|44091|12.43|0.00|105.3|2×|
|phase9-8h|16000|2000.0|44100|12.06|0.00|100.0|2×|
|phase9-8h|24000|2000.0|44106|11.87|0.00|100.0|2×|
|phase9-8h|max|1175.6|25535|7.10|130.68|129.3|1× 복구|
|phase9-8i|12000|2000.0|44264|12.46|0.00|72.0|2×|
|phase9-8i|16000|2000.0|43958|12.26|0.00|74.6|2×|
|phase9-8i|24000|2000.0|43979|12.23|0.00|77.3|2×|
|phase9-8i|max|975.8|21680|5.53|1228.04|77.3|1× 복구|

고정 설정에서2× 소비 목표44100 mono frame/s에 맞는 공급과2000 PIC tick/s를 함께 확인했다. max는 H/I 모두 실패 및 실제1× 복귀를 확인했다. H/I 공백의 정의가 달라 I값이 더 크다는 이유만으로 청감상 몇 배 악화됐다고 비교하지 않는다. I의 max에서는1× 복귀 후에도 공백이 계속됐으므로 실험 중단 안내가 필요하다. 모든 행에서 중복/누락 계수0, native underflow/clamp0(마지막 ACK 시점), Worker runtime errors0. 보호 복귀 이후 status ACK가 멈춘 세션의 native 카운터는 마지막 확인값이지 종료 시점 관측값이 아니다.

### 공급·처리 지연

|엔진/cycles|PCM 도착/생성 간격 평균/최대 ms|Worker 복사·전송 평균/최대 ms|main→canvas 전달 평균/최대 ms|decoder 표본 합 ms / 호출 수|
|---|---:|---:|---:|---:|
|phase9-8h/12000|12.06/35.40|미계측|1.12/6.10|5.40/4057|
|phase9-8h/16000|12.05/29.40|미계측|1.04/7.20|6.90/5839|
|phase9-8h/24000|12.05/33.40|미계측|0.94/2.80|11.90/8494|
|phase9-8h/max|20.34/105.80|미계측|1.05/2.00|35.50/31181|
|phase9-8i/12000|12.06/24.60|0.036/0.500|0.93/2.30|4.40/4226|
|phase9-8i/16000|12.05/24.20|0.056/0.500|1.07/4.50|7.30/5489|
|phase9-8i/24000|12.05/24.10|0.056/0.500|1.13/2.50|10.70/8503|
|phase9-8i/max|23.68/99.60|0.043/0.500|1.17/2.20|27.60/36885|

H 간격은 main 수신, I 간격은 Worker 생성/전송 관측이다. Worklet 도착 간격·main 통계 전달 지연·cycles 관측 배열은 `artifacts/phase9-8i/measurements-final.json`에 보존했다. WASM heap은 각64MiB이며 전체 프로세스 peak/RSS 측정은 아니다. 이 표본 CPU 시간은 전체 Worker CPU 사용률로 해석할 수 없다. H main 오디오 작업과 I direct 출력의 처리 위치가 달라 단순 ms비율도 총성능 배율이 아니다.

### 실제 출력과 전환

공개 혼합음의 Worklet 출력(48000Hz)을 별도 시험 tap으로 측정했다. 1×에서500Hz/1000Hz, 2×에서1000Hz/2000Hz, 복귀 후500Hz/1000Hz 성분을 확인했다. 유효 출력 길이는1.12798초 → 0.56531초 → 1.13065초였다. 입력 패킷 생성량만으로 가속을 주장하지 않는다. 게임 상용 음원은 녹음/내보내지 않았다.

고정12000의 공개 BIOS36 tick 대기: 1×1971.6ms → 2×958.3ms → 1×1927.7ms → 2×984.0ms → 1×1929.8ms. 입력/ACK/실제 출력과 재시작 기본1×를 함께 검사했다. PC 공개 프로그램 결과이며 Galaxy 게임 이동·전투 시간이 아니다.

### 자동 검증 집계와 실패 기록

- TypeScript 및 production build 통과. 현재 배포 빌드로 아래 회귀를 실행했다.
- 단위349/349 통과(기존344 + 새 ring5).
- 기존 Chrome E2E38, Pages2, 9-7 UI2, 9-8 UI3, B7, C6, D14, E6, F11, G1, H13: **총103/103 통과**. 기존 조건을 완화하거나 테스트를 삭제하지 않았다.
- 신규 I 전체 실행: **20통과/1실패**. 실패는 모바일 크기 31.58초 시험의 실제 출력 공백129frame/48000Hz=2.6875ms 한 번이었다. rate2·guest1999.47tick/s·overlap/drop0·fault없음이지만 공백0 조건은 실패했다. `verified-phase9-8i.log`, `mobile-gap-first.json` 및 전체 JSON은 보존했다.
- 해당 모바일 시험은 공백 검증 전에1× 복귀와 진단 저장을 수행하도록 순서만 수정했다. 공백0 조건은 그대로 두고 **한 번만 재시험**했다: 31.25초,2000tick/s, 공백0, 최대 큐77.32ms, rate2→1 및 cyclesAuto0→1 확인, 통과(`mobile-return.log/json`). 이전 실패를 지우거나21개 전체가 한 번에 통과했다고 보고하지 않는다. 드문 공백의 재현성과 Galaxy 안정성은 남은 과제다.
- 일반 Stable/9-7의 첫 프레임300ms 지연, 동일 GAME.BAT direct/trace 비교, 일반9-7 공개 저장 복원, I 임시 변경 폐기 및 RAW/IDB/OPFS 보존, 오프라인, 잘못된 Worklet 해시 거절, 실제 장면 JSON, pause/resume, 네이티브/호스트 ACK, max 복구를 검증했다.
- 220ms main 정체에서 I 출력 공백0. 별도350ms 공급 중단 시험에서는 실제 출력 부족과1× 복구를 확인했다. 음악 강제 무음/몰래 Stable 대체 없음.

초기 실패 로그도 보존했다. 직접 PCM 전송만으로 해결되지 않았던220ms 정체, 첫 프레임 경합, 늦은 오류 UI 덮어쓰기, Stable 로더 계약 충돌은 원인을 확인해 수정했다. 시험 코드의 bounded 로그 줄 수에 의존한 계수와 모바일에서 이미 열린 전체화면을 다시 누르던 부분은 시험 하네스를 수정했다. max 공급 불안정과 모바일 미세 공백은 해결된 것으로 바꾸지 않았다.

주요 증거: `artifacts/phase9-8i/verified-exits.json`, `verified-*.log`, `verified-i-evidence/`, `measurements-final.json`, `unit-release.log`, `build-corrected.log`, `mobile-gap-first.json`, `mobile-return.json`. 이 폴더는 로컬 시험 자료이며 사용자 게임 자료가 아니다.


## 7. 보존과 배포

원본 게임/모딩 파일/RAW/SAVE/브라우저 사용자 저장소를 수정하거나 재등록하지 않았다. 테스트는 매번 격리된 Playwright 브라우저 컨텍스트와 공개 COM/합성 RAW/세이브만 사용한다. I 실험 종료의 IDB/OPFS 스냅샷 일치 및 일반9-7 저장 복귀를 검사한다. 게임 해시는 실행 조건이 아니다.

시작 전226개 자산 해시와 비교해224개 동일, 누락0을 확인했다. 차이는 public/docs의 런처 소스 ZIP 두 개뿐이다(`preservation.json`). 기존 Stable,9-2~9-7,C/D/F/H 엔진과 기존 native GPL ZIP은 보존했다. 새 I WASM/Worker/Worklet은 별도 경로이며 엔진·공용 Worker·entry·Worklet·배포 manifest 해시를 검사한다. 기존 업데이트 캐시 소유 범위/사용자 승인/실행 중 업데이트 금지는 유지한다. GPL native 전체 대응 소스와 런처 소스를 함께 제공한다. 원격 Pages에 새 버전이 배포됐다는 뜻은 아니다.

I WASM SHA-256: `a10cbc965e710fda680df68ce69f74bea2f4343ac64d1efdaec8d312c517c873` (1,466,849B). 기존 Emscripten3.1.21/WSL 빌드 도구를 재사용했다. 새 설치/관리자 변경 없음. 명령: `node scripts/prepare-phase9-8i.mjs`(fresh source만), `wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-8i.sh`, `node scripts/package-phase9-8i.mjs --stage`, `npm run build`. 실제 명령/환경과 기존 Asyncify 경고는 `artifacts/phase9-8i/build-native.log`에 있다.


최종 실행기 빌드 ID: `9-8i-20261110031007430-9353bf84`. HEAD `f3489ae3affe`, dirty 작업 빌드(커밋 생성 아님).

- 공용 Worker: `dos-worker-common-phase9-8i-25b4e39c37e65a1a.js`, SHA `25b4e39c37e65a1aa794153640558344496f765b95d80fd405421e863f0b2894`
- 진입 Worker: `dos-worker-phase9-8i-1c0932991575ab36.js`, SHA `1c0932991575ab366701fbd64c9fe1fb251cb7ace8af0d891a3f4320dd74e4e9`
- Worklet: `audio-worklet-phase9-8i-31bb6b4237d030a5.js`, SHA `31bb6b4237d030a599b5e47f4a28b4fb04978da55a829f9d9196ae269c1afa07`
- I native 대응 소스 ZIP SHA: `3ec48eef68f528df8aeb143691c01dce5e16bc03f38a8bfe16004d0f4bfe42bb`
- SW SHA: `ff91c2421757c8d12fd4457405c298eb89242dffb3adb6eeba2f55a31eaee742`

Worker는 빌드/서비스 워커의 파일 해시 및 immutable bootstrap metadata 일치로 검증한다. WASM은 실제 컴파일할 bytes SHA를 확인한다. Worker가 보고한 선언 해시를 별도의 실행 중 self-hash 측정으로 표현하지 않는다.

## 8. Galaxy 최소 확인 절차

1. 사용자가 GitHub Desktop으로 Commit/Push한 뒤 기존 업데이트 적용 기능으로 새9-8i 빌드 ID를 확인한다. 사이트 데이터 삭제/재등록을 하지 않는다.
2. **일반 실행 엔진에서 `Phase 9-7 ED4 호환 · 1× · 일반 저장`을 직접 선택**하고 게임 실행. 원래 GAME.BAT로 한글·필드·음악과 가능하면 전투를 확인한다. 이 단계가 실패하면 오류 문구와 진단 JSON을 보관한다. 원래 Stable도 선택 가능하다.
3. 일반 실행을 종료한 뒤 임시 실행 추적에서 `Phase 9-8I 공급 안정화 · 전체 2× · 저장 안 함`을 선택한다. 공개 max 시험에 한계가 있으므로, 첫 공급 비교는 **2× 동안 cycles16000 고정**을 명시적으로 선택한다. 이는 ED4 최적값 확정이 아니라 일회성 비교다. 처음1×에서는 기존 게임 설정이다.
4. 첫 필드에서2×를30초 정도 시험한 뒤1×로 복귀한다. 실제 이동량·음악 변화·끊김·입력과 가능하면 전투만 확인한다. 9→10→9 음악 명령을 다시 수집할 필요 없다. 게임 시간 약2×와 실제 캐릭터/전투 약2×는 별도 확인한다. 고정cycles가 CPU 처리량을 제한해 게임이 느려지면 성공이 아니다. 1×에서 이미 공급 부족/전환 제한이 뜨면2×를 강행하지 말고 진단을 남긴 뒤9-7로 돌아간다.
5. 기존 장면 기록/전체 진단 JSON 한 번으로 남긴다. `integratedSpeed`, `audioSupply`, 실제 cycles/auto, Worklet gap/queue, local yield 지연, runtimeErrors를 확인한다. 공급 부족/복구실패/1×에도 부족 안내가 나오면 실험 종료 후 일반9-7로 돌아간다. 저장은 실험에서 폐기한다.

## 9. 실제 변경 파일과 남은 사항

- 실행/상태: `src/main.ts`, `src/engine.ts`, `src/experimental-engine.ts`, `src/speed-control.ts`, `src/scene-diagnostics.ts`.
- I 오디오: `src/audio-supply.ts`, `src/worklet-audio.ts`, `scripts/phase9-8i-audio-bridge.js`, `scripts/phase9-8i-ring.mjs`, `scripts/phase9-8i-speed-worker.js`.
- I 빌드/패키지: `scripts/prepare-phase9-8i*.mjs`, `scripts/build-phase9-8i.sh`, `scripts/package-phase9-8i.mjs`, `licenses/phase9-8i-engine.json`, generated engine/Worker/Worklet metadata.
- 공개 시험: `tests/phase9-8i/`, `tests/audio-ring.test.ts`, `playwright.phase9-8i.config.ts`, `scripts/summarize-phase9-8i.mjs`.
- 배포/GPL: 기존 build/prepare/package/check 스크립트 및 ignore/attributes/NOTICE, 신규 public I 자산과 `docs/ed4/` 생성물. 기존 보고서/엔진 소스 ZIP은 덮어쓰지 않았다.


Galaxy 일반 실행 복구, 실제 게임의 고정cycles에서 충분한 CPU 진행/한글/필드/전투/오디오, 2× 지속성·입력 지연·발열·다른 AudioContext sampleRate·블루투스/앱 전환은 미검증이다. max 자동조절에서의 PCM 생성 불균일성은 해결 완료가 아니다. 기존 세이브의 실기 영구 저장 안정성도 아직 보장하지 않는다. BGM1× 분리 연구는 보존만 했으며 이번 모드의 음악2×를 결함으로 보지 않는다.
