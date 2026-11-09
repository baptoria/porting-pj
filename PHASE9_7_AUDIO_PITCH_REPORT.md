# Phase 9-7 — 사운드 경로 및 음높이 조사

작성: 2026-11-09. 작업 경로 `D:\porting\ed4-mobile`. Git Commit/Push 또는 실제 GitHub 업로드 없음.

## 결론과 검증 범위

**공개 시험으로 런처의 모노/스테레오 해석 오류를 재현하고 수정했다.** emulators 0.73.8은 모노 Float32 샘플을 보내는데 기존 런처는 이를 스테레오 인터리브로 취급했다. 각 채널이 매 두 번째 샘플만 받고 버퍼 길이가 절반이 되어, 시험음의 음높이가 약 두 배로 바뀌고 스케줄 공백도 생겼다. OPL 합성이나 WebAudio의 22,050→48,000Hz 리샘플링 자체를 원인으로 확정한 것이 아니다.

**Phase 9-7은 별도 선택 가능한 일회성 오디오 실험 실행 경로다. WASM은 Phase 9-6과 완전히 동일하며 재컴파일하지 않았다.** VGA 호환성·Asyncify·CPU 추적 OFF를 유지하고, 호스트의 버퍼 해석만 모노로 변경했다. 기존 Stable 및 Phase 9-2~9-6 선택지는 이전 출력 방식까지 보존했다. 새로운 CPU/OPL/SB 구현 수정은 없다.

사용자 확인: Galaxy Phase 9-6 게임 실행·이동 정상, 소리가 원본과 다름, 재생 속도는 대체로 정상으로 느껴짐, 음높이 차이는 잠정적인 인상. 이번 수정 후 **Galaxy 게임 사운드 개선 여부는 아직 미검증**이다. 공개 PCM의 PC/웹 재생 길이 차이와 실제 BGM 장치별 사용 여부도 미해결 항목으로 남는다.

## 1. 실제 오디오 경로 — 확인한 것과 모르는 것

| 단계 | 근거와 판정 |
|---|---|
| DOS 장치 설정 | `src/archive.ts`: SB16, base220/IRQ7/DMA1/HDMA5, `oplmode=auto`, `oplemu=default`, `oplrate=22050`, mixer22050. 이는 가상 장치 설정이며 게임이 모두 사용한다는 뜻은 아님 |
| 설치 드라이버 | PC 연구용 `SOUNDRV.COM`은 4,704B이고 `SBPRO.COM`과 SHA-256 동일. 내부 식별 문자열은 Sound Blaster Pro DIGPAK v3.40. 별도 `SB16.COM` 4,798B와 다름. 파일을 교체하지 않았음 |
| Galaxy 드라이버 실행 | 과거 SOUNDRV 설치 메시지는 사용자 실기 확인. PC 드라이버와 Galaxy 드라이버의 전체 해시 일치 및 현재 장치 I/O 사용량은 이 단계에서 실측하지 못함 |
| OPL/FM | 고정 소스 `adlib.cpp`: auto+SB16의 OPL3, default는 DBOPL handler. 공개 OPL 전용 명령으로 PCM 출력까지 확인. 실제 게임 BGM이 OPL을 사용하는지는 혼합 출력만으로 판별 불가 |
| SB PCM | `sblaster.cpp`의 DSP/DMA 처리 → 믹서. 공개 PCM 전용 시험에서 실제 출력 확인. DIGPAK의 설치만으로 모든 실제 소리를 PCM이라고 단정하지 않음 |
| 엔진 믹서 | `native/dosbox-jsdos/jsdos/jsdos-mixer.cpp`: 좌/우를 `(left+right)/2`로 합쳐 **프레임당 float 하나** 전송 |
| Worker 전달 | `worker-protocol.cpp`가 `num_samples`개의 float를 복사해 `ws-sound-push`로 전달. 대응 소스의 `test/audio-node.js`도 `channels=1` 사용 |
| 기존 런처 | `src/engine.ts`: 2채널·length/2로 생성, 채널별 `samples[i*2+c]` 사용. odd length 블록의 마지막 샘플도 잘림 |
| 수정 런처 | Phase 9-7만 1채널·length로 생성, 전체 샘플 복사. 보고된 엔진 주파수 유지 → GainNode → WebAudio destination |
| 브라우저/기기 | 로컬 Chrome AudioContext는 48kHz. Galaxy DAC/블루투스/스피커 경로 및 기기 실제 출력 주파수는 로컬 시험으로 검증하지 않았음 |

즉, **실제 혼합 출력 계약은 확인했지만 Galaxy 게임의 장치별 활성도를 아직 분리 관측하지 못했다.** JSON의 `audioOutput.deviceUsage`에도 unobserved로 명시한다. 그 상태에서 OPL 교체나 SB 드라이버 교체를 하지 않았다.

## 2. PC DOSBox와 동일 공개 음원 비교

상용 게임을 PC에서 실행하거나 녹음하지 않았다. 독립 작성 CC0 `scripts/phase9-7-audio.S` 한 파일을 PC와 웹 양쪽에서 사용했다.

- 공개 COM: 8,401 bytes, SHA-256 `61fea5a955e87bae6822e56418e14c2de50d790774d00060f13691276698ae6c`.
- OPL: 채널0 carrier, FNUM580/block4, 약440.03Hz, BIOS tick으로 key-on 36 ticks. 다른 사운드 장치는 사용하지 않음.
- PCM: 자체 합성 unsigned8 mono 사인파, 8,000Hz/8,000 samples/1,000Hz. SB16 DSP0x41·0xC0, DMA1, 64KiB 경계에 별도 버퍼를 배치해 page wrap 회피. 게임 드라이버 불사용.
- PC: 기존 `dosbox-74-3-debug.exe`, SHA-256 `547dbcabe4286190f99af9d800ac295e6c5eda8d5e48c82392f51bcc6ba71037`. 새 격리 폴더 `artifacts/phase9-7/native`, 프로그램 정상 종료 코드0. 설치/관리자 권한 없음.
- PC CONF: `tests/fixtures/phase9-7-native.conf`. normal core/12000 cycles, SB16, mixer/OPL22050, default OPL, nosound=false. 웹 auto는 해당 시험에서 normal core를 사용하는 Phase 9-6, 동일12000 cycles. 과거 게임 성공 세션의 CONF와 같다고 주장하지 않는다.
- PC Ctrl+F6 내부 믹서 WAV(PCM16 stereo)를 채널 평균으로 분석. 웹 Worker float와 실제 예약 AudioBuffer channel0를 별도로 수집. **스피커/마이크 녹음이 아니라 믹서·브라우저 버퍼 계측**이다.
- 주파수: 활성 구간 중앙 최대400ms에 Hann window, zero-padding FFT(분석 분해능 약2.5Hz, 표시 bin 간격 약0.042Hz). zero-crossing도 보조 기록. 위상 불연속이 있을 수 있어 FFT 지배 주파수를 대표값으로 사용하며 소수점 정밀도를 정확도 보증으로 취급하지 않는다.

| 공개 시험 / 계측 위치 | OPL 지배 주파수 | PCM 지배 주파수 | OPL 활성 span | PCM 활성 span |
|---|---:|---:|---:|---:|
| PC DOSBox 믹서 WAV | 약440Hz | 약1,000Hz | 2.050s | 1.000s |
| 웹 Worker 원시 모노 | 약440Hz | 약1,000Hz | 약2.075s | 1.214s |
| Phase 9-6 예약 버퍼 channel0 | 약881Hz | 약2,003Hz | 약1.037s | 약0.606s |
| Phase 9-7 예약 모노 버퍼 | 약440Hz | 약1,000Hz | 약2.073s | 1.214s |

활성 span은 첫/마지막 유효 진폭 사이 샘플 수/22,050이다. 블록을 이어 붙인 값이며 실제 스피커의 벽시계 길이와 구별한다. GPU/게임 업데이트 속도와도 별개다. 테스트 사이 약간의 callback 경계·timing 차이는 있다.

Phase 9-7 각 블록은 Worker 샘플과 **모든 값·순서·개수가 정확히 일치**한다. odd 길이도 보존한다. 측정 세션에서 1ms 초과 예약 공백은 기존 OPL52/PCM36회에서 수정 양쪽0회였다. 이는 이 로컬 세션 결과이며 Galaxy에서 항상 무공백이라는 보장은 아니다.

### 파형 및 WebAudio 리샘플링 분리

- 활성 시작+200ms 이후 첫 양의 zero crossing부터 12ms를 위상/진폭 정규화해 PC와 수정 웹 파형을 비교했다. 상관계수 OPL 약0.99999999, PCM 약0.99993. 짧은 정상 구간의 유사성이지 전체 파일의 bit 일치가 아니다.
- OPL RMS 웹/PC 약0.7500. PC 0.74-3 `adlib.cpp` scale2.0, 고정 웹 소스 scale1.5와 일치하는 크기 차이. 음높이 차이가 아니며 이번에 gain/OPL을 수정하지 않았다. PCM RMS 비 약1.005.
- [공개 파형 비교 그림](artifacts/phase9-7/waveforms.svg), [전체 수치](artifacts/phase9-7/measurements.json). 모두 공개 시험음만 사용.
- 실제 production adapter에 22,050Hz/1,000Hz/0.8초 입력을 넣고 Chrome OfflineAudioContext로 **44,100Hz와48,000Hz 각각 렌더링**했다. 수정은 두 경우 모두 약1,000Hz/0.800초, 이전은 약2,000Hz/0.400초. 모노가 양쪽 출력 채널로 복제되며 좌우 차이0을 확인했다.
- 따라서 이번 두 배 주파수 문제를 기기 샘플레이트 차이로 설명할 필요가 없다. AudioBuffer rate와 context rate를 구별하는 것은 [Web Audio 표준](https://www.w3.org/TR/webaudio-1.0/#dom-baseaudiocontext-createbuffer)의 계약과도 일치한다.

### 해결했다고 주장하지 않는 잔여 차이

웹 Worker 단계에서 PCM 활성 span이 PC보다 약0.214초 길다. 모노 수정 전후 공통이며 이번 호스트 패치로 해결되지 않았다. jsdos의 wall-clock push 및 믹서 보정/리샘플링과 PC SDL callback 차이가 조사 후보지만 **현재 특정 분기를 원인으로 확정하지 않았다**. 단순 반복 prefix/긴 무음 공백 검사는 해당 설명을 지지하지 않았다. OPL/FM 에뮬레이터나 DSP rate를 임의 변경하지 않았다.

## 3. RAW 53개와 실제 음악 연결

1. 게임 실행의 RAW 경로는 **OPFS File → 읽기 전용 lazy Emscripten FS → 게임이 open/read → 게임의 드라이버/장치 출력**이다. RAW 등록 자체로 WebAudio BGM 플레이어가 자동 재생되는 구조가 아니다. CDDA/ISO 마운트 대체도 아니다.
2. 별도 음악 보관함의 `RawPreview`만 8-byte skip/PCM16LE/stereo/22050을 가정해 직접 WebAudio로 재생한다. 이는 게임의 오디오 경로와 다르다. 이번 모노 수정은 RAW 미리듣기에 적용하지 않는다.
3. 읽기 전용 PC 연구용 `LOGO.EXE`에서 `ed4-01.raw`~`ed4-54.raw` 파일명 문자열을 확인했다. 해당 폴더에는 RAW54개, 433,081,400B가 있고, 모두 앞8바이트의 word2가22050, dword2가 파일크기-8과 일치한다. 첫 word는3. **샘플 형식 플래그의 완전한 규격까지 검증한 것은 아니다.**
4. PC의 54개 RAW basename에는 모두 `_` 접두사가 있어 위 literal과 그대로 일치하는 이름은0개다. 실제 open 경로를 관측한 것은 아니므로 파일명 문제로 단정하거나 자동 변경하지 않았다.
5. Galaxy는 사용자가53개 약422MB로 보고했다. 로컬54개와 같은 집합인지, 접두사·상대 경로가 같은지, 어떤 한 곡이 빠졌는지 확인되지 않았다. 모바일 파일을 재등록하거나 PC 파일과 섞지 않는다.
6. **기존 RAW 읽기0 해석 정정:** `DosEngine.musicMetrics`는 초기0으로 시작해 주로 `ws-persist`에서 갱신됐다. 저장하지 않는 실험에서는 실제 read가 발생해도 해당 필드는 초기값일 수 있다. 따라서 진단13의 요약0만으로 RAW 미사용을 확정할 수 없다. 런타임 예외 payload의 별도 musicReads는 예외 당시 값이지만, 이번 세션은 오류0이었다. 원문 JSON13은 이 작업에서 보유하지 않았다.
7. 새 Phase 9-7은 JSON 다운로드 시 Worker의 현재 누적 `reads/bytes/largestRead/mounted`를 **on-demand**로 조회한다. 파일 열기·음악 읽기·persist를 유발하지 않는다. `musicObservation.source=live-worker-query`인 값만 현재 계측으로 해석한다. 1.5초 무응답이면 `query-timeout-not-current`; 이전 수치가 있더라도 최신으로 간주하지 않는다.

**RAW read>0은 읽었다는 증거이며 BGM의 올바른 디코딩·장치 재생·곡 전환 성공을 증명하지 않는다.** 게임의 FM/PCM 사용률, EFC 효과음과 RAW BGM의 실제 분리는 Galaxy 후속 증거가 필요하다.

## 4. 실제 수정과 보존

| 파일/범위 | 변경 |
|---|---|
| `src/emulator-audio.ts` | 모노 계약대로 AudioBuffer 작성. 기존 분리 방식도 A/B용으로 유지 |
| `src/engine.ts` | Phase 9-7 선택에서만 mono adapter, source/context rate·프레임수·resync 수 등 숫자 진단. on-demand RAW 상태 조회 및 응답 시점 표시 |
| `src/experimental-engine.ts` | phase9-7 ID는 Phase9-6의 기존 directory와 동일 WASM hash 사용 |
| `src/main.ts` | 기존 선택 메뉴에 9-7 한 항목, 비저장 일회성 유지. JSON 생성 전 상태 조회. 레이아웃/CSS 불변 |
| `scripts/prepare-phase9-7-worker.mjs` | 기존9-6 common을 그대로 import하는 별도 content-addressed entry. 읽기 횟수 쿼리만 추가. 공용 Worker·기존 entry 불변 |
| build/source packaging | 새 entry/manifest를 오프라인 캐시에 포함, 대응 런처 소스 제공. Phase9-6 엔진 GPL ZIP 그대로 유지 |
| `tests/phase9-7*`, fixture, scripts | 독립 공개 시험음·WebAudio·저장 보존·조회 실패 회귀 및 수치 분석 |
| `docs/ed4/` | 로컬 production 배포 준비본 갱신. GitHub 업로드는 하지 않음 |

동일 WASM SHA-256:
`f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3`

공통 Worker(9-6과 동일):
`eb1d69c995e7b4e157d424a4b84d67ae24fd8de9661bebf8ac0d6511ec1ff259`

새 Phase9-7 entry SHA-256:
`28b1feae72d99c1f519e9b7cf2e3d65ff0df1385cb2dafd12697d31e218facd9`

WASM은 실제 내려받은 바이트의 SHA-256 확인 후 compile. Worker는 내용 해시가 포함된 경로와 build 시 바이트/hash 검사 및 실행 중 compatibility marker 확인을 유지한다. Worker 바이트 전체를 실행 중 다시 해싱한다는 뜻은 아니다. 새 entry의 내부 DOS 엔진 ID는 의도적으로 `phase9-6`; 아직 phase9-7을 모르는 공용 파일을 불러와 Unknown diagnostic engine을 일으키지 않는다. `audioOutput.runtimeEngine=phase9-6`, artifact ID=phase9-7로 구분한다.

Stable/기존 실험 WASM, CPU·VGA·Asyncify 소스, DOS CONF/cycles, 게임·RAW·EFFECT·세이브·저장 스키마를 변경하지 않았다. 진단 종료 때 변경분 폐기 및 안정 엔진 복귀 유지. 게임 메모리·샘플 바이트는 새 JSON 항목에 포함되지 않는다. 공개 시험에서만 브라우저 오디오 샘플을 테스트 코드로 캡처한다.

## 5. 자동 검증 및 재현

최종 검증 결과는 아래 표에 기록한다. 기존 테스트 삭제·완화 없음.

| 검증 | 결과 |
|---|---|
| TypeScript / production build / Worker hash·PWA cache 검사 | 통과 |
| 단위 테스트 | 290/290 (기존287 + 신규3) |
| 공개 OPL·PCM 9-6/9-7 A/B + 44.1/48kHz rendering | 8/8 |
| Phase9-7 비저장/RAW 실시간조회/오프라인/스토리지 동일성 | 1/1 |
| 상태 조회 무응답 | 1/1 (JSON 수출 및 게임 입력 유지) |
| Phase9-5B/9-6 VGA468-byte copy·RETF modes3/7/19 | 6/6 |
| 기존 Phase9-6 선택·해시 거부·abort·RAW·저장·성능창 | 5/5 |
| Pages 하위 경로·오프라인 캐시·데이터 유지 | 2/2 |
| 기존 Chrome E2E | 38/38 최종 빌드 통과 |

시험 경로는 `/porting-pj/ed4/`, 격리된 로컬 Chrome 프로필. 실제 HTTPS 사이트 배포나 Galaxy 검증을 수행했다고 주장하지 않는다. 배포 검사에서 기존 WASM·Worker·CPU/VGA 소스·RAW/저장 코드와 기존 테스트의 변경 없음, staged 변경 없음, 상용 게임/RAW/세이브 배포 없음, 파일당100MiB 초과 없음 및 GPL 소스 일치를 확인했다. 최대 파일은 기존 Phase9-6 GPL ZIP 2,740,591B다.

재현 명령:

```text
node scripts/prepare-phase9-7-public.mjs
npm test
npm run build
npx playwright test --config playwright.phase9-7.config.ts
npx playwright test --config playwright.phase9-7-ui.config.ts
npx playwright test --config playwright.phase9-6.config.ts
npx playwright test --config playwright.phase9-6-ui.config.ts
npm run test:pages
npm run test:e2e
python scripts/analyze-phase9-7-audio.py
```

Python 분석은 numpy 필요(이번에는 기존 설치 사용), 네이티브 WAV 2개가 있어야 한다. PC WAV는 `captures/audio_000.wav`=OPL, `audio_001.wav`=PCM. DOSBox 창에서 Ctrl+F6→O→AUDIO_DONE→Ctrl+F6, 다음 Ctrl+F6→P→AUDIO_DONE→Ctrl+F6, Q로 정상 종료한다. 실제 게임을 선택하지 않는다. 공개 COM 재어셈블은 기존 WSL의 `as --32 scripts/phase9-7-audio.S -o artifacts/phase9-7/audio.o` 및 `ld -m elf_i386 -Ttext 0x100 --oformat binary artifacts/phase9-7/audio.o -o artifacts/phase9-7/native/AUDIO.COM`; 결과를 위 SHA와 비교한다. 배포에 상용 게임 파일이나 네이티브 WAV를 추가하지 않았다.

## 6. Galaxy 검증 절차

1. 사용자가 GitHub Desktop에서 변경 검토 후 Commit/Push한다. 온라인에서 기존 탭/PWA를 모두 닫고 다시 열어 업데이트한다. **사이트 데이터 삭제·게임/RAW 재등록은 하지 않는다.**
2. 기존 프로필 → BAT 진단 → Phase9-6으로 같은 GAME.BAT, CPU, 메모리, SB16, RAW 연결을 유지해 기준 소리를 듣는다. 로딩 완료 후 같은 메뉴/장면, 같은 효과음에서 비교한다. 음악 미리듣기는 종료하고 블루투스/스피커·볼륨도 고정한다.
3. 저장하지 않고 진단 종료. Phase9-7 모노 출력 수정(9-6 WASM)을 선택하고 같은 장면에서 비교한다. cycles/max, OPL emulator, mixer rate, 드라이버, RAW 유무를 함께 바꾸지 않는다.
4. 각 상태의 진단 JSON 다운로드. 9-7은 artifact ID=phase9-7, WASM hash=`f7f88a…fed3`, audioOutput.adapter=mono-v1, sourceRate=22050(관측값 확인), outputBufferChannels=1, inputFrames=scheduledFrames를 확인한다. contextRate는 Galaxy 실제 값을 기록한다.
5. `musicObservation.source=live-worker-query`와 `music.reads/bytes/mounted`를 확인한다. 타이틀/필드/전투 전환 뒤 다시 JSON을 받아 증가 여부를 비교한다. 현재 `reads=0`이 확인되면 실제 장면에서 RAW 경로를 다시 조사하되 파일명을 자동 변경하지 않는다.
6. 게임 이동/메뉴/전투 속도, 효과음의 음높이·길이, BGM 존재·전환·끊김을 각각 기록한다. 필요하면 동일 장면의 30초 성능 창으로 CPU 속도 회귀도 비교한다. 실제 표시FPS와 callback 평균을 혼동하지 않는다.
7. 종료는 저장하지 않는 진단 종료. 다음 선택은 기본 Stable로 돌아간다. 정상 실행이 확인된 Phase9-6은 계속 별도로 선택 가능하다. 실험 선택을 프로필에 저장하지 않는다.

## 7. 미적용 수정과 남은 과제

- OPL/PCM 합성기·샘플레이트·cycles·SB 드라이버 교체: **미적용**.
- RAW 파일명/헤더/내용 변경, 곡 자동 연결: **미적용**.
- 기존 Stable/9-6 오디오 출력 방식 일괄 교체: **미적용**, Galaxy A/B 결과를 먼저 확인한다.
- PCM의 웹 믹서 단계 duration 차이, 실제 게임 장치별 사용, 실제 RAW 곡 경로 및 기기 출력: **추가 검증 필요**.
- Phase9-7 Galaxy 게임 소리의 원본 일치 및 정상 진행: **사용자 실기 판정 전**.

확정된 수정 대상은 런처의 채널 해석 오류다. 이 수정이 모든 음색 차이·BGM 부재·PCM timing을 해결했다고 보고하지 않는다.
