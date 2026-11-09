# Phase 9-8B — 게임 2× / BGM 1× 분리 실험

작성: 2026-11-09. 프로젝트 `D:\porting\ed4-mobile`. 참고 `D:\ed4_rs_cb`는 읽기 전용. Git Commit/Push 없음.

## 판정

**별도 엔진에서 실제 DOS 타이머 약2×와 1× 복귀를 구현·측정했다. 합성 RAW를 독립 WebAudio 시계로 재생하는 코드와 동시 실행 시험도 구현했다. 그러나 ED4의 곡 명령/원래 BGM만 차단하는 연결점은 미확정이므로, 실제 게임용 2× 버튼은 계속 비활성이다.**

이번 제한은 효과음의 음높이 보정 때문이 아니다. 요구사항을 게임1×/2×, SE 가속·음높이 변화 허용, BGM 속도·음높이1×로 적용했다. 효과음 보정 코드는 만들지 않았다. 1.5× 모드는 없다.

기존 Phase9-8 전체화면·조이스틱·Enter/ESC와 Phase9-7 모노 출력, Phase9-5B VGA 호환성, Phase9-6 CPU trace OFF를 보존했다. 새 코드는 **로컬 공개 시험 전용**이며 제품 런처가 import하지 않는다. `docs/ed4/`, public Worker/WASM, 사용자 IndexedDB/OPFS, 게임·RAW·SAVE는 이번 단계에서 갱신/초기화하지 않았다. 이 보고서는 Galaxy에서 이미 게임이 실행된다는 사용자 확인과, 이번 신규 2× 검증을 구별한다.

## 1. 실제로 작성한 코드와 엔진

| 파일 | 역할 |
|---|---|
| `scripts/prepare-phase9-8b.mjs` | 해시 고정 Phase9-6 대응 소스를 별도 artifacts에 풀고 `dosbox.cpp`만 수정 |
| `scripts/build-phase9-8b.sh` | 기존 Emscripten3.1.21/CMake/Ninja로 별도 빌드 |
| `scripts/package-phase9-8b.mjs` | 모든 소스를 원본 ZIP/변경 manifest와 대조, 별도 JS/WASM/심볼 및 GPL 대응 소스 ZIP 생성. 배포 복사 기능 없음 |
| `scripts/phase9-8b-bgm.mjs` | 명시적 곡 명령·원래 BGM 억제 확인을 요구하는 독립 PCM 스트리밍 프로토타입 |
| `tests/phase9-8b/clock.spec.ts` | 1→2→1 타이머, VGA/RETF, 동시에 독립 BGM 재생, 잘못된 배율 거절 |
| `tests/phase9-8b/audio.spec.ts` | guest1×/2×에서 공개 OPL/PCM의 믹서 출력 변화 측정 |
| `tests/phase9-8b/bgm.spec.ts` | 합성 RAW 주파수/루프/정지/재개/곡 교체/비동기 취소/중복 명령/억제 미확인 거절 |
| `scripts/inspect-phase9-8b-reference.py` | 연구용 EXE 해시·정적 명령 후보/RAW 헤더 메타데이터만 읽기. 샘플/게임 바이트 수출 없음 |
| `scripts/analyze-phase9-8b.py` | 공개 타이머와 합성 음원의 측정값 집계 |

새 엔진: `artifacts/phase9-8b/engine/`. 대응 소스: 같은 폴더 `corresponding-source.zip`. 전체 빌드 소스/로그는 `artifacts/phase9-8b/source/instrumented`, `logs/`. Git ignore된 로컬 산출물이다. 기존 정상 엔진으로 오인하여 업로드하지 않는다.

| 구분 | SHA-256 |
|---|---|
| 기존 Phase9-6/9-7 WASM, 유지 | `f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3` |
| 새 로컬 실험 WASM | `ec20d6c333b7a717e5adf1376e092a46b521c3418da3821d823a4584debef4f0` |
| 새 JS + 기존 worker-server | `78c8148b706a10bf484ea829c3aa6c41862cd0456d64b8cc6256d53480efe920` |
| 실험 대응 소스 ZIP | `8b38636141759af0e12f4ebfc0e26378494509a1c972592d17d9ad3e37aa7fa2` |

도구 설치·다운로드 없이 기존 Emscripten3.1.21 사용. 첫 WSL 호출은 sandbox의 E_ACCESSDENIED였고 승인된 실행 경로로 기존 도구를 사용해 빌드 완료했다. 기존 Asyncify 목록의 non-existing/non-matching 경고15개는 남아 있다. Phase9-1에서 기록된 종류와 같으며 Reboot_Handler 추가를 제거하거나 다른 엔진 옵션을 바꾸지 않았다.

## 2. 가속 구현과 실제 효과

기존 `Normal_Loop`에서 `increaseticks()`가 호스트 경과시간으로 계산한 `ticksRemain`을 반환한 직후, 로컬 실험에서만1 또는2를 곱한다. 다음 루프는 기존 `TIMER_AddTick`, PIC/PIT/IRQ, CPU 실행을 그대로 수행한다. `GetTicks`, `GetMsPassedFromStart`, WebAudio 시계와 호스트 yield 시간을 전역 치환하지 않았다. CPU opcode 처리·VGA·메모리·게임 파일은 수정하지 않았다.

추가 export `ed4_test_set_speed`는 기본1이며1/2만 받는다. JS 시험 어댑터도 WASM 호출 전에 정확한1/2인지 검사한다. 기존 DOSBox fast-forward `ticksLocked`에는 중복 배율을 적용하지 않는다. 전환 시 이미 배정된 짧은 tick 묶음은 처리한 뒤 새 배율이 적용되고 게임을 재시작하지 않는다. 과부하 시 기존 host tick 제한/auto cycles 조정이 남으므로 정확히2배를 항상 보장하지 않는다.

### 공개 BIOS36 ticks 대기 — 각3회 중앙값

| CPU 설정 | 1× | 2× | 다시1× | 실제 시간 비율 |
|---|---:|---:|---:|---:|
| fixed12000 | 1947.6ms | 986.7ms | 1950.9ms | 1.974× |
| max | 2009.3ms | 1022.5ms | 2004.0ms | 1.965× |

출처: `artifacts/phase9-8b/clock-{12000,max}.json`. stdout 도착 시각이며 브라우저 스케줄링/BIOS tick 위상 오차가 있다. 이전 Phase9-8의 cycles12000→24000 시험은 타이머가 빨라지지 않았지만, 이번에는 실제 게스트 BIOS 시간이 빨라졌다. 두 시험 모두 실행 중1×로 돌아온 뒤 정상 종료했고 RuntimeError는 없었다. 공개 mode3 VGA468-byte copy/RETF도 함께 통과했다.

**이 결과는 실제 ED4 필드·전투·이벤트가 모두 약2배라는 증명이 아니다.** CPU-bound 처리, vsync 대기, 장치 DMA 대기 등은 시간 기준이 다를 수 있다. 실제 게임은 이번 PC 시험에 사용하지 않았다. Galaxy의 발열·CPU 여유·장시간2×·입력 지연·배속 전환 안정성은 미검증이다. 자동 과부하 복귀는 제품에 연결하지 않았다.

## 3. 효과음 가속을 허용해도 남는 오디오 결합

고정 소스의 `jsdos-mixer.cpp`는 게스트 tick마다 MIXER_Mix로 생성하면서, host `GetMsPassedFromStart()` 기준으로 Web Worker에 샘플을 보낸다. SB DMA/완료 IRQ는 PIC 이벤트와 연결되어 있고 OPL key-on/off는 게스트 프로그램 명령 시점을 따른다. 게스트 시간만2×로 만들면 음악 명령과 장치 소비가 영향을 받는다.

이번에는 효과음 속도·음높이 변화 자체를 실패 기준으로 삼지 않았다. 다음은 **BGM에 이 경로를 그대로 사용할 수 있는지 보는 결합 측정**이다.

| 공개 경로 | 1× 지배 주파수 / 활성 span | 2× 지배 주파수 / 활성 span |
|---|---|---|
| OPL | 440.043Hz / 2.0687s | 441.935Hz / 1.0329s |
| SB PCM | 999.948Hz / 1.2139s | 1001.715Hz / 0.6452s |

Worker의 원시 mono를 분석했다. 소스 rate는22,050Hz. 합성 공개 프로그램만 사용했으며 실제 게임 녹음이 아니다. span은 전달받은 샘플의 활성 구간이지 스피커 출력 벽시계 시간이 아니다. OPL 프로그램 완료 시간도2450.5→1228.8ms, PCM은1627.6→807.9ms로 줄었다. 2×에서 주파수가 정확히2배가 되지 않는다고 BGM이 보존된 것은 아니다. **음악 길이/명령 타이밍은 이미 달라진다.** 믹서의 보정 동작과 짧은 활성 구간의 FFT 오차를 구별하며 음질 무결성을 주장하지 않는다.

제품의 Phase9-7 mono adapter는 그대로 유지했다. 위 로컬 라우팅 시험은 배포 경로를 바꾸지 않기 위해 테스트 브라우저에서만 실험 엔진을 제공하며, Stable의 기존 stereo 호스트 출력은 분석 대상이 아니다. 실제 공급한 WASM 해시는 결과 파일에 기록했다. 기존 엔진 해시 검증을 제품 코드에서 우회하지 않았다.

## 4. RAW와 사운드 명령 조사 — 새로 좁힌 지점

### 확인한 로컬 파일 계열

| 파일 | bytes | SHA-256 |
|---|---:|---|
| ED4.EXE | 516 | `20ac1206364f2bc83f3309b650094aba27f19b4956ef6e781335c50fedd27e9d` |
| DRIVER.EXE | 16556 | `0aacd13177882ae96b5f81b912ff08fc3f43462c5b97af13bf3fe91091535b3a` |
| LOGO.EXE | 409850 | `fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1` |
| SOUNDRV.COM | 4704 | `3c7d00b022e9b24267ad9692e901e690dec156b901523ac7bafa448c28019e77` |

ED4 해시는 과거 Galaxy 제공값과 일치하지만 LOGO/DRIVER/SOUNDRV의 Galaxy 전체 해시는 이번에 확보하지 못했다. 로컬54 RAW와 Galaxy53 RAW를 같은 집합으로 취급하지 않는다. 원본을 실행·변경·복사하지 않았다.

### 명령 후보와 근거

LOGO의 `ed4-01.raw` literal은 파일 offset0x4B158, 전체54개 이름 참조가 있다. 이것만으로 재생 명령 위치가 정해지지는 않는다. 인접한 사운드 래퍼 구간을 제한된 i8086 정적 디스어셈블리로 확인했다.

| LOGO 정적 파일 offset | 관측 | API 대응 후보 |
|---|---|---|
| 0x9457 | 스택의 레지스터 구조에 AX=0688 설정, 이어 INT번호66을 래퍼에 전달 | 디지털 샘플 재생 |
| 0x9577 | AX=068F 상수 | 정지 |
| 0x95BA | AX=0695 상수 | 다음 샘플 버퍼 등록 |
| 0x9604 | AX=0698 상수 | PCM 재생 형식 |
| 0x971D | AX=069C 상수, INT66 래퍼 | DMA backfill |
| 0x9755/0x9758 | AX=069D 뒤 직접 INT66 | DMA 위치 조회 |
| 0x978A | AX=069E 상수 | DMA 경계 검사 |

DIGPAK 작성자의 공개 래퍼 소스에서 위 함수 번호와 pending/stop/play-mode 경로를 대조했다. 이 매핑은 **API 의미**의 근거이며, 해당 함수가 Galaxy BGM 재생 중 호출되었다는 증거는 아니다. [DIGPLAY.ASM 원저자 소스](https://github.com/jratcliff63367/digpak/blob/master/DIGPLAY.ASM).

로컬 RAW54개의 첫 word3, 다음 word22050, payload 길이 word가 파일크기-8과 맞는 것을 다시 확인했다. 공개 DIGPAK 헤더에서 형식3은16-bit stereo이고 샘플 구조에는 버퍼 포인터·길이·재생 상태·주파수가 있다. 따라서 기존 RAW PCM16 stereo 해석을 지지하는 근거가 추가되었다. **게임이 RAW 헤더를 그대로 그 API에 넣는지는 아직 확인하지 못했다.** [DIGPLAY.H 원저자 헤더](https://github.com/jratcliff63367/digpak/blob/master/DIGPLAY.H).

이 주소들은 **파일 offset**이다. 동적 로드 CS:IP나 안정적인 후킹 주소로 바로 사용하지 않는다. 정적 상수 패턴 전체는 `reference.json`에 보관했으며 모두 실행 가능한 코드/도달한 코드라고 단정하지 않았다. 재생 래퍼에는 재배치 대상 FAR CALL도 있으므로 파일 offset만 guest 주소로 환산해 패치하지 않았다.

### 확인된 경로와 미확인 경계

1. 확정: OPFS 파일 → 읽기 전용 lazy FS → 게임의 파일 읽기. Galaxy RAW read는 사용자 확인.
2. 근거 있는 후보: LOGO의 RAW 이름 테이블 → 게임 버퍼/디코딩/혼합 → DIGPAK INT66 재생·pending·backfill → SB PCM/DMA.
3. 확정: DOSBox의 SB/OPL 장치 → MixerChannel → 공통 mono 믹스 → Worker → Phase9-7 WebAudio.
4. 미확정: 특정 RAW 파일과 특정 INT66 버퍼의 연결, BGM/SE가 이미 소프트웨어에서 혼합되는지, 곡 선택/루프/정지/재개 호출자, 실제 BGM의 OPL 사용 여부.

**RAW read를 play로, close를 stop으로 치환하지 않았다.** 파일 선읽기·메모리 캐시·버퍼 반복에서는 read가 없어도 재생되고, close 이후에도 재생될 수 있다. 실제 사운드 명령과 파일 읽기는 동일 사건이 아니다.

## 5. 믹서 이전 분리 가능성

`sblaster.cpp:1694`의 `MixerChan.Install(...,"SB")`, `adlib.cpp`의 FM 채널, `jsdos-mixer.cpp`의 `MIXER_MixData`를 대조했다. 채널 분리는 **장치 단위**다. 게임 의미인 BGM/SE 단위는 아니다.

| 실제 게임 경로가 무엇인지 | 가능한 방법 | 아직 필요한 증거 |
|---|---|---|
| BGM 전용 PCM 버퍼와 SE 버퍼가 분리 | BGM 버퍼를 식별해 원래 BGM의 오디오 기여만 억제하고 외부 RAW 재생 | RAW 파일/샘플 버퍼 provenance, 상태 flag·DMA/IRQ 유지 |
| BGM은 FM, SE는 SB | FM 출력만 독립 처리 후보 | 실제 장치 활성도, 가속되는 노트 명령을 실시간으로 재구성할 수 있는 곡 경계 |
| BGM+SE가 게임 내부에서 먼저 PCM 혼합 | DOSBox SB 채널에서 단순 분리 불가능 | 혼합 이전의 게임/라이브러리 명령 경계. 전체 SB mute는 SE까지 없앰 |
| RAW를 외부에서만 재생 | 게임 곡 명령과 독립 플레이어 동기화 | 루프/정지/재개/교체, 원래 BGM만 억제하는 확인 응답 |

SE가 빨라져도 된다는 조건으로 효과음 보정은 제거할 수 있지만, **BGM 식별과 중복 출력 방지**는 여전히 필수다. `INT66` 재생 호출 자체를 무조건 건너뛰면 재생 상태·pending flag·DMA 완료를 기다리는 게임 로직을 바꿀 수 있다. 이 방식은 적용하지 않았다. SB 전체 mute, RAW 읽기0 반환, 원본 RAW 음소거/재인코딩도 하지 않았다.

## 6. 독립 WebAudio 구현 및 검증

`RealtimeBgm`은 실제 시간인 `AudioContext.currentTime`만 사용한다. guest speed·PIC ticks를 입력으로 받지 않는다. 22,050Hz/PCM16LE/stereo/8-byte offset **명시적 형식 계약**과 허가된 곡 명령을 받아0.5초 단위로 읽고, 약0.25~0.75초 앞까지 예약한다. 한 read 최대44,100B이고 곡 전체나422MB 전체를 메모리에 올리지 않는다. RAW 변경/변환 파일은 생성하지 않는다.

play/pause/resume/stop/loop/곡 교체, 명령 sequence 중복/역순 거절, stop 후 완료된 비동기 read 폐기, 이전 예약 source 취소를 구현했다. native BGM suppression과 명령 provenance가 확인되지 않은 play는 거절하도록 외부 승인 함수를 요구한다. **실제 게임 어댑터가 이 승인을 제공하는 코드는 아직 없다.** 테스트는 합성 fixture에 한해서만 승인한다.

- 합성440Hz RAW →48kHz OfflineAudioContext에서3초 렌더: guest1/2 조건 모두440Hz, 샘플 배열 전체 동일. looping 및 예약 underrun0.
- 실제 WASM의 BIOS 타이머1→2→1 시험과 **동시에** 별도 AudioContext의 합성 RAW를 재생: guest2× 구간에도22,050Hz 원래 buffer rate, playbackRate1, 440Hz, 0.5초 chunk 유지. fixed/max 각각48개 버퍼를 검사했고 예약 underrun0이었다. 이 공개 타이머 프로그램은 BGM을 내지 않으므로 원래 음악 중복이 없다.
- pause 시 source0개, resume은 저장한 프레임에서, 곡 교체는 이전 예약을 제거, stop/지연 read 취소 후 source0개. 형식/억제 미확인 상태는 재생 거절.

독립 플레이어 가능성은 확인했지만 **ED4 명령 동기화·원래 BGM 억제의 성공은 아니다**. 실제 자동 명령 공급자가 없으므로 products/UI에는 연결하지 않았다. 실제 장치 출력 녹음, 블루투스 지연, 백그라운드 타이머 제한, 모바일 장시간 underrun은 미검증이다.

## 7. 자동 검증

| 항목 | 결과 |
|---|---|
| 새 로컬 공개 시험 | 7/7: timer동시BGM2 + 장치오디오4 + BGM수명주기1 |
| 단위 테스트 | 303/303 |
| TypeScript | 통과 |
| 기존 Chrome E2E38 | 38/38, 합성500MiB ZIP/폴더 및 저장 격리 포함 |
| Phase9-8 조이스틱·fullscreen·저장 분리 | 3/3 |
| Phase9-7 RAW·세이브·오프라인·timeout | 2/2 |
| Pages 경로/PWA/오프라인 | 2/2 |
| 기존 엔진/Worker/GPL 보존 감사 | `node scripts/check-phase9-8.mjs` 통과. 보호 경로 변경 없음, 모든 기존 엔진 hash·대응 소스 일치, staged 없음 |

브라우저 합계52개 통과(신규7 + 기존45), skipped/flaky로 대체하지 않았다. `git diff --check`도 통과했다. 이 단계는 production 코드를 바꾸지 않아 앱 버전/production 빌드/캐시 버전을 불필요하게 갱신하지 않았다. 작업 트리에 남은 `src/`, `docs/` 변경은 앞선 Phase9-8 결과이며 이번 단계의 정상 엔진 교체가 아니다.

초기 실패도 기록한다. JS에서1.5를 WASM `int` 인수로 넘기면1로 변환되는 사실을 신규 거절 테스트가 검출했다. 시험 Worker에서 정확한1/2인지 먼저 검사하도록 수정했고 기존 기대값을 완화하지 않았다. TypeScript가 테스트 전용 동적 import의 고정 경로를 모듈로 찾지 못한 문제는 런타임 URL 변수로 수정했다. 기존 제품 Worker를 수정한 것이 아니다.

재현:

```text
node scripts/prepare-phase9-8b.mjs
wsl bash scripts/build-phase9-8b.sh
node scripts/package-phase9-8b.mjs
npx playwright test --config playwright.phase9-8b.config.ts
python scripts/analyze-phase9-8b.py
python scripts/inspect-phase9-8b-reference.py
npx tsc --noEmit
npm test
```

기존 회귀는 `npx playwright test --config playwright.config.ts`, `playwright.phase9-8.config.ts`, `playwright.phase9-7-ui.config.ts`, `playwright.pages.config.ts`를 각각 실행했다. Python 분석에는 기존 NumPy를 사용했다. 원자료/최종 수치는 `artifacts/phase9-8b/comparison.json`, `clock-*.json`, `audio-*.json`, `bgm.json`, `reference.json`에 있다.

prepare는 새 디렉터리의 배타적 생성이며 재실행해 기존 소스를 덮어쓰지 않는다. 이미 준비된 경우 build/package부터 실행한다. 실험 엔진은 테스트의 로컬 HTTP 응답에만 주입하고 기존 배포 파일/서비스 워커 캐시를 바꾸지 않는다. 새로운 GPL source ZIP은 실험 WASM과 함께 로컬에 보관했다. 원저자 DIGPAK 코드는 조사 링크로만 참조하며 게임/드라이버 바이트나 외부 소스 사본을 배포에 추가하지 않았다.

## 8. 다음에 필요한 최소 작업과 Galaxy 판정

우선순위는 추가 CPU 추적이 아니라 **INT66 명령과 RAW 버퍼의 관계 확인**이다.

1. 기존 정상1× 경로에서 현재 SOUNDRV/LOGO의 hash를 확인한 뒤, INT66의 재생0688/후속0695/정지068F/형식0698/backfill069C 및 상태 변화만 제한적으로 기록한다. DPMI 경유 호출도 같은 인터럽트 경로에서 관측되는지 확인한다. 메모리·오디오 샘플 덤프는 하지 않는다.
2. RAW의 read 목적지·논리 offset과 사운드 버퍼 범위·주파수·모드·명령 순서를 대조한다. 복사/변환을 거쳐 provenance가 사라지면 unknown으로 남긴다. read 시각만으로 곡 전환을 만들지 않는다.
3. 같은 장면에서 BGM만/SE 동시 재생을 비교하여 PCM이 이미 혼합됐는지 판단한다. 혼합 전 분리점이 확인된 경우에만 BGM 기여를 억제하되 상태 flag·DMA/IRQ 등 실행 의미는 유지한다.
4. 곡 시작·끝·반복·정지·재개·전투 전환을 명시적 명령으로 연결하고 중복/잔류 소리가 없음을 검증한다. 이 어댑터가 독립 플레이어의 승인 조건을 만족해야 한다.
5. 그 뒤 별도 엔진으로 Galaxy 동일 장면1×/2×/1×를 비교한다. 이동 거리/전투 동작 수/이벤트 대기 시간을 각각 측정하고 음악 길이·음높이·전환을 별도 판정한다. 2×가 지속되지 않으면 성능 제한을 기록한다.

지금 Galaxy에서는 기존 Phase9-7 정상 경로와 Phase9-8 UI를 계속 사용할 수 있다. 이 단계의 로컬 엔진은 선택 메뉴나 Pages에 추가하지 않았으므로 새 엔진을 찾거나 게임·RAW를 재등록할 필요가 없다. 세이브 영구 저장을 새로 활성화하거나 보장하지 않았다.

**완료된 범위:** 실제 게스트 시간2× 최소 구현, 독립 BGM 스트리밍 프로토타입, 두 시계의 공개 동시 시험, DIGPAK 명령 후보와 분리 한계 확인. **미완성:** 실제 ED4 곡 명령 식별·원래 BGM만 억제·게임/전투/이벤트2× 실기·2× 버튼 활성화. 현재의 구체적인 장애물은 효과음 보정이 아니라, BGM의 명령과 버퍼 소유권을 아직 검증하지 못한 것이다.
