# Phase 9-8F — BGM 제어 경계와 2× 통합 준비

작성: 2026-11-10. 기존 프로젝트/9-8E 실행기를 유지했다. **공개 시험의 게임 타이머 2× + 독립 BGM 1× 연결은 구현·검증했다. 실제 ED4의 원래 BGM만 억제하는 어댑터는 미완성이다. 제품 2× 버튼은 계속 비활성이다.** 기존 9-7 정상 실행을 교체하지 않았다.

## 1. 증거의 범위

사용자가 제공한 Galaxy 관측을 실기 사실로 사용했다. 원본 통합 JSON은 로컬에 없으며 재생성하거나 임의로 보충하지 않았다.

| 실제 장면 | guestTick | INT69 요청 | 이후 읽기 |
|---|---:|---|---|
| 첫 필드(기존 타이틀 표기는 오기) | 36963 | AX=0009, BX=9 | `_ED4-09.RAW` |
| 전투 | 49814 | AX=0009, BX=10 | `_ED4-10.RAW` |
| 필드 복귀 | 91421 | AX=0009, BX=9 | `_ED4-09.RAW` |

세 호출의 CS=7227/복귀 IP=2560은 그 실행의 관측값이다. 후킹 주소/게임 판별 조건으로 사용하지 않았다. AX=000A가 요청 직전 있었다. **실제 타이틀은 무음**이며 강제 재생하지 않는다. 과거9-8E 안내의 “타이틀 음악이 나온 뒤” 조건을 이번 절차에 적용하지 않는다.

관측은 선택 ID와 파일 읽기의 강한 대응 근거다. 샘플의 독점 소유권, 드라이버 성공 반환값, 루프/일시정지 의미까지 증명하지 않는다. 모딩 파일의 내용 해시를 실행 조건으로 추가하지 않았다.

## 2. INT69 AX9/AX0A 정적 역추적

읽기 전용 참조 `D:/ed4_rs_cb/ED4/LOGO.EXE`의 NE 세그먼트/체인 relocation을 해석했다. 크기409850B, SHA-256 `fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1`. 이는 조사 파일의 식별자이며 Galaxy 파일 일치나 모딩 제한을 뜻하지 않는다.

재현 도구: `scripts/inspect-phase9-8f-reference.py`; 결과 `artifacts/phase9-8f/reference.json`. 보고서/결과에는 주소·메타데이터만 남기고 게임 바이트/디스어셈블리 전체를 포함하지 않았다. 아래는 **파일 offset과 NE 논리 세그먼트**이며 실제 실행 CS가 아니다.

| 경로 | 확인한 정적 연결 |
|---|---|
| seg6 dispatch table, file0xCD4B | case9→0xCC9F, case10→0xCCAC |
| case9 far-call operand0xCCA3 | NE seg2:06E4, file0x7AE4 |
| case10 call0xCCAC | NE seg2:07CE, file0x7BCE |
| play측 call0x7BC1 | seg5:0F80, file0xB780, 논리 사운드 슬롯 초기화 후보 |
| stop측 call0x7C08 | seg5:1535, file0xBD35, 지정 슬롯 해제 후보 |

case9는 DS:3A20 조건, ID 감소 후54개 범위 검사, 이전 파일 핸들449C:449E 정리, 슬롯1 처리, 파일명 포인터 테이블0308/030A+(ID-1)*4 및 prefix를 통한 이름 조립, 파일 열기/8바이트 헤더 읽기, 슬롯1 초기화로 연결된다. 파일열기0x7B63→seg1:2930, 읽기0x7B8D→seg1:2AD8의 relocation도 확인했다. **모든 버전에서 ID와 파일명을 숫자로 직접 조립한다는 뜻이 아니다.**

case10은 gate 확인 후 비어 있지 않은 기존 핸들을 닫고(0x7BF2→seg1:24DA), 관련 핸들을0으로 만들며 슬롯1 해제 경로로 이어진다. 따라서 **이 참조 파일에서 AX0A는 기존 음악 정지/해제일 가능성이 높다.** 실제 INT69 dispatch 대응, Galaxy에서의 완료·오디오 효과는 아직 추가 확인 대상이다. 제품에서 AX0A를 외부 플레이어 stop으로 자동 실행하지 않았다.

슬롯 배열 간격은0x3A이며 슬롯1 관련 활성 상태를 다룬다. 이 구조는 논리적 BGM 슬롯과 다른 슬롯의 분리 가능성을 지지한다. 최종 DMA 버퍼가 BGM 전용이라는 증거는 아니다. ID2/54에서만 달라지는 DS449A 값은 반복 정책 후보지만 전체 소비 경로/실제 반복까지 확인하지 못했다.

오인 방지: file0xA0ED/0xA149의 AX9/AX0A wrapper는 relocation을 따라가면0x9E2A의 **INT31(DPMI)** 호출이다. INT69 음악 명령 근거로 혼용하지 않았다. `CD 69` 바이트 검색이나 파일offset만으로 런타임 후킹하지 않았다. 기존9-8C/D의 SOUNDRV/DIGPAK 후보 분석과 KERN/범위 검증을 유지했으나, 이번에는 원본 드라이버를 실행·변조하지 않았다.

## 3. 실제 구현: 경로 연결 분석과 반환 관측

### 런처 분석

`src/bgm-link.ts`는 순서가 있는 native INT69 요청과 후속 RAW 읽기, 마운트된 상대 경로 메타데이터를 연결한다. 새로운 선택/AX0A에서 연결 구간을 닫는다. ID9→10→9를 보존하되 특정 파일명·CS·게임 내용 해시를 고정하지 않는다.

- 단일 후보, 서로 다른 경로, basename 해시 충돌/동일 basename, 관측 누락을 구분한다.
- 이전 스냅샷 중복 sequence 제거, 최대128개 요청·요청당16개 RAW 후보.
- 대응 후보가 하나여도 `permissionToPlay:false`, `ownershipConfirmed:false`다.
- 원본 해시가 아니라 native basename 식별 해시를 쓴다. 실제 경로가 둘 이상이면 모호함을 남긴다.
- `SceneSession.report().bgmLink`에 통합한다. 기존 장면·증가량·이벤트 손실 표시·업데이트 기능을 유지한다. 내보낼 때 분석하므로 매 명령 JS 처리가 아니다.

### 별도 Phase9-8F 엔진

9-8D 대응 소스에 제한된 INT69 반환 관측과 **기존9-8B dosbox.cpp의 동일 해시 타이머 변경**만 결합했다. `-DED4_CPU_TRACE_ENABLED=OFF`이며 명령 단위 추적을 재도입하지 않았다.

변경 C++:

- `native/dosbox/include/ed4_bgm.h`: IRET 종료 관측 선언/RAII scope.
- `native/dosbox/src/cpu/cpu.cpp`: CPU_IRET 결과 상태 관측. CPU 반환 동작은 변경하지 않음.
- `native/dosbox/src/cpu/ed4_bgm.inc`: AX9/AX0A 요청 최대16개, 요청 CS:IP/SS:ESP/실행모드와 IRET 후 상태 일치 시 kind5 기록.
- `native/dosbox/src/dosbox.cpp`: 기존9-8B 타이머 원본과 변경 파일 SHA를 검사한 뒤 그대로 재사용. 기본1×. 기존 Asyncify/VGA 호환성 보존.

kind5에는 요청 sequence/AX/BX/tick, 반환 AX(`command` 필드)/BX/CX/DX/FLAGS/SS:SP 및 DMA1/5 메타데이터가 있다. 요청·반환 중첩을 sequence로 짝지으며 매칭 수/대기 수/넘침 수를 공개한다. 원본 오디오나 게임 스택 바이트는 읽거나 내보내지 않는다. 일치한 IRET는 **함수가 해당 문맥으로 복귀한 관측**이며 재생 성공 판정은 아니다.

한계: RETF 등 IRET가 아닌 복귀, DOS extender의 다른 context 복구, hook에서 확인할 수 없는 모드 전환은 매칭하지 못할 수 있다. 오래된 미완료 요청과 우연히 재사용된 문맥도 완전히 배제하지 못한다. 이런 기록으로 음소거 권한을 부여하지 않는다. pending16 초과는 누락 수로 남긴다. 매 IRET에서 최대16칸 검사하므로 비용이0은 아니다. 추가 저장량은 대기구조16개(현 ABI 약640B, 추정)와 카운터; 기존 first32/tail256 이벤트 링을 재사용한다. 모바일 장시간 비용은 미측정이다.

빌드: 기존 WSL Ubuntu-24.04, Emscripten3.1.21/Node14.18.2/CMake3.24.2/Ninja 재사용. 설치 없음.

```text
node scripts/prepare-phase9-8f.mjs
wsl -d Ubuntu-24.04 -- bash scripts/build-phase9-8f.sh
node scripts/package-phase9-8f.mjs --stage
npm run build
```

prepare는 새로운 artifacts/phase9-8f/source 경로에만 wx로 추출한다. 이미 있는 소스 위에 재실행하지 않는다. 독립 GPL ZIP의 BUILD-PHASE9-8F.md에는 추출 소스 직접 빌드 방법이 있다. 기존 Asyncify nonmatching 경고15개는 남았고 빌드는 성공했다.

새 WASM SHA-256: `2fab041279ae5f52dd1cf5a0bdef060c3faab0fef797475b0e0f69d87c879d85` (1466459B).

공용 Worker SHA: `55fa6d525a72d9532e149097c2c4b4e7c94bf930cf8353d0495c5b69cbea9c4f`.
진입 Worker SHA: `dbcd3ef6cacd512fb5e1bcff7840f68f1981b6aeffc0deb066b402037bf7c9f3`.

별도 `vendor/experimental/phase9-8f/`와 해시 포함 Worker 파일명을 사용한다. 9-8E 빌드 manifest/검증된 SW 캐시 및 실제 WASM/Worker 해시 검사를 유지했다. UI에는 명시적 일회성 **Phase9-8F INT69 반환·BGM 연결 후보 ·1×·저장 안 함**만 추가했다. 이전 엔진 선택과 기본Stable은 그대로다.

## 4. BGM-only 억제 경계: 구현하지 않은 부분

DOSBox `native/dosbox/src/hardware/sblaster.cpp`의 `MixerChan.Install(&SBLASTER_CallBack,22050,"SB")` 이후에는 이미 SB 스트림이다. 여기에서 음소거하면 SE도 손실된다. native INT66의0688/068F/0695/0698/069C 및 DMA 관측은 그대로 두었다.

**다음 연결이 아직 미확인:**

1. INT69 case9가 선택한 파일 → guest 논리 슬롯1 → 실제 INT66 버퍼/재충전 범위의 소유권.
2. 슬롯1과 효과음의 합산이 일어나는 정확한 guest 믹싱 경계.
3. 슬롯1의 샘플 기여분만 제거해도 핸들·상태·반복·IRQ·DMA 진행이 동일한지.
4. 모딩된 설치본에서도 같은 정책이 성립하는지.

공유 SB/DMA 출력을 통째로 끄거나, INT69 요청을 삼키거나, INT66/IRQ를 건너뛰거나, RAW 읽기 결과를0으로 바꾸지 않았다. 정적 DS offset에 쓰는 패치도 하지 않았다. 반환 이벤트와 런타임 버퍼 후보가 다음 판단 근거다. 향후 후보는 **믹싱 이전의 논리 슬롯 기여분** 또는 독점 사용이 입증된 RAW 공급 경계다. 현재는 어느 쪽에도 안전한 억제 구현을 붙이지 않았다.

## 5. 독립 BGM 브리지와 2× 결합

새 `scripts/phase9-8f-bgm-bridge.mjs`는 기존 RealtimeBgm을 재사용하는 **로컬 공개 시험용**이다. 제품 번들에서 import하지 않는다.

- 같은 세션의 단조 증가 명령 sequence, 명시적 play/stop/pause/resume/loop/파일경로/형식 근거가 필요하다.
- native BGM-only 억제와 SE/IRQ/DMA 보존을 증명하는 외부 adapter lease가 없으면 재생/2×를 거부한다. RAW 연관 분석만으로 이 lease를 만들지 않는다.
- 실제 경로를 전달하며 ID별 이름을 합성하지 않는다. 9→10→9 선택 전환, 이전 외부 노드 해제, 루프·정지·일시정지·재개를 처리한다.
- 1×↔2×는 기존 엔진 export로 확인받고 음악 노드/시계를 재시작하지 않는다. 소유권 상실/읽기 실패 등에는 외부 플레이어를 정리하고1× 복귀 확인을 시도하며, 확인 실패를 정상 복귀로 표시하지 않는다.
- PCM prototype은 **검증된 PCM16LE stereo22050Hz/header8B 계약만** 지원한다. 실제 수정 RAW의 형식을 자동 확정하지 않는다. 파일 재인코딩/변경 없음.
- 실시간 AudioContext 시계, 최대0.5초 단위 읽기, playbackRate=1. 효과음 피치 보정 없음.

제품 Worker에는 이 테스트용 speed 메시지 경로가 없다. native export는 공개 시험 shim에서만 조작했다. production은1×이며 2× 버튼을 활성화하지 않았다.

## 6. 자동 검증

검증은 공개 COM·합성 RAW와 격리된 Playwright 저장소에서만 수행했다. PC에서 실제 ED4는 실행하지 않았다.

### 신규 공개 시험

11/11 통과 (`playwright.phase9-8f.config.ts`).

- 기존9D 공개 INT69 요청3건/반환3건, INT66 707건 유지, pending/overflow0.
- 새 CC0 `phase9-8f-return-probe.S`: 요청 AX0A/BX9 및 AX9/BX10 이후 AX1234 반환을 관측. 중간 INT1C의 IRET를 outer INT69 복귀로 오인하지 않음.
- 공개 OPL/PCM 출력 두 시험: mono-v1, Worker 샘플과 출력 버퍼 전체값 일치, 샘플레이트22050 유지.
- VGA mode3/13h의468B 복사·RETF 유지. mode7은 기존 의도된 aperture mismatch 결과 유지(지원 확대 주장 아님).
- 기존 저장/RAW 재사용, 진단 중 SAVE 삭제 변경분 폐기, IDB/OPFS 스냅샷 전후 일치, offline Stable 복귀.
- 합성 브리지: 권한 없는 재생/2× 차단, 임의 경로9→10→9의440/660/440Hz, 정지/반복/재개, 음악 연속성, 소유권 상실 시1×, 세션 혼입 차단.

공개 BIOS 타이머를 각 속도에서3번 측정한 중앙값:

| 설정 | 1× 처음 | 2× | 1× 복귀 | 관측 비율 |
|---|---:|---:|---:|---:|
| cycles12000 | 1946.7ms | 979.7ms | 1942.0ms | 1.987× |
| cycles max | 1973.9ms | 1040.4ms | 2017.8ms | 1.897× |

두 경우 동시 합성 BGM은440Hz, source22050Hz, 각 buffer0.5초, playbackRate1, 관측 underrun0. 타이머 입력은 native BGM을 생성하지 않는 공개 프로그램이며 억제 adapter는 **명시적인 fixture**다. 따라서 실제 ED4의 native BGM 중복 제거·곡 루프·SE와의 공존을 증명한 시험이 아니다. 화면 FPS와 게임 진행량도 동일시하지 않는다. 실제 이동/전투2×는 미검증이다.

### 기존 회귀

- 변경 전 단위322개 통과; 변경 후330개 통과(신규8개, 기존 조건 삭제/완화 없음).
- 기존9-8E 업데이트/장면/반복다운로드/저장 보존6/6 통과.
- 나머지 기존 Chrome/Pages/UI/B/C/D 결과는 아래 최종 검증 부록에 기록한다.

테스트 작성 중 새 엔진 상수명과 반환 AX 필드명을 잘못 쓴 fixture 오류를 고쳤다. 첫 로컬 clock module 주입은 SW manifest 검증 때문에 거부되어, 기존9B 로컬 시험과 동일하게 해당 fixture만 SW를 차단했다. 제품 SW 검증은 유지했고 별도의 실제 앱 offline/update 시험을 통과했다. 기존 테스트를 수정하거나 완화하지 않았다.

## 7. 타이틀 무음과 시작 기계음

타이틀 무음은 이번 실기 관측 그대로 유지했다. 음악 시작을 강제하지 않는다.

9-7의 오디오 스케줄은 future queue가0.25초를 초과하면 예약점을 앞당길 수 있었고,9-8D는 이미 예약된 버퍼를 겹치지 않게 두며 늦어진 경우만 재동기화한다.9-8F는9-8D의 동일 mono/예약 정책과 audioStartup 통계를 재사용한다. DC 필터·gain·샘플 변경을 추가하지 않았다.

audioStartup은 시작60초, 일반 audioOutput은 이후 장면을 포함한다. 이번에 제공된 Galaxy 자료에는 기계음 구간의 DC/peak/경계 jump/queue 값이 없다. 따라서 DC 오프셋, 버퍼 불연속, 실제 장치 초기화 음 중 하나로 확정하지 않는다. 정상 음악을 필터링해서 증상을 감추지 않았다. 시작 기계음이 재발하면 첫 필드까지의 통합 JSON과 발생 시점(타이틀 전/후, 게임 시작 버튼 직후 등)만 필요하다.

## 8. 보존 및 배포

기존 Stable와9-2~9-8D의 WASM/Worker를 덮어쓰지 않았다. UI4방향/Enter/ESC,9-7 mono,9-5B VGA,9-6 CPU trace OFF,9-8E 안전 업데이트와 통합 장면 수집, 모딩 파일 허용 정책을 유지했다. 저장 스키마/등록 파일/프로필 기본값을 바꾸지 않았다.

기존 BGM 원본·RAW53개·세이브·사용자 OPFS/IDB는 수정하지 않았다. 공개 시험용 저장소만 사용했다. 실제 Galaxy 데이터는 로컬에서 검사한 것으로 주장하지 않는다. 상용 파일을 소스ZIP/docs에 넣지 않았다. GPL 대응 소스·고지 및 새로운 별도 엔진ZIP을 포함해 `docs/ed4/`를 갱신한다. Git Commit/Push/실제 원격 배포는 수행하지 않는다.

## 9. Galaxy 최소 검증 절차

1. 사용자가 Commit/Push하고 Pages 배포 성공을 확인한 뒤, 게임을 종료한 상태에서9-8E의 **업데이트 적용**을 사용한다. 사이트 데이터 삭제나 재등록은 하지 않는다. 실행기 빌드가 `9-8f-...`인지 확인한다.
2. 기존 게임/RAW 연결 그대로 **임시 실행 추적 → Phase9-8F INT69 반환·BGM 연결 후보**를 선택한다. 진단은1×/저장 안 함이다. 실제 엔진id와 위WASM SHA가 맞는지 확인한다. 제품2× 버튼은 비활성 상태가 맞다.
3. 타이틀 무음은 정상 관측으로 두고 첫 필드에서 음악이 시작되면 **필드** 기록, 전투 음악에서 **전투**, 필드 복귀 음악에서 **복귀**를 기록한다. 첫 필드를 타이틀로 기록하지 않는다. 메뉴를 닫고 게임/음악을 계속 진행한다.
4. 전체 진단 JSON 하나를 다운로드한다. AX0A/AX9의 요청/IRET 반환, pending/overflow,9→10→9 경로 후보, INT66/DMA 및 이벤트 누락 표시를 확인할 자료다. 한 곡이 자연스럽게 반복되는 시점 또는 실제 음악 정지 장면을 관측했다면 추가 스냅샷으로 표시할 수 있지만, 일반 메뉴 열기를 음악 일시정지라고 가정하지 않는다.
5. 진단 종료 후 기존9-7 경로를 계속 사용할 수 있다. 새 엔진에서 문제가 생기면 엔진id/오류/장면을 전달하고9-7로 돌아간다. 저장소 초기화 불필요.

## 10. 완료/미완료

완료: 정적 AX0A stop/release 후보 및 슬롯 경계 구체화, 런타임 요청→RAW 경로 후보 분석, 제한된 IRET 반환 진단 엔진, 기존2×타이머+독립BGM 브리지 공개 시험, 기존 저장/오디오/UI 보존과 배포 준비.

미완료: Galaxy9-8F 실기 반환·루프·정지 검증, guest 논리 슬롯1→INT66→DMA의 독점 소유권, native BGM만 안전하게 억제하는 adapter, 실제 게임2×/BGM1×/SE공존 통합. 이 경계가 확인되기 전 제품2×는 열지 않는다. 다음 단계로 자동 진행하지 않는다.

## 최종 검증 부록

| 검사 | 결과 |
|---|---:|
| 단위 테스트 | 330/330 |
| 기존 기본 Chrome E2E | 38/38 |
| 기존 Pages 하위 경로 | 2/2 |
| 기존 전체화면·조작 UI | 3/3 |
| 기존9-7 UI/오디오/저장 경로 | 2/2 |
| 기존9-8B timer/audio prototype | 7/7 |
| 기존9-8C | 6/6 |
| 기존9-8D | 14/14 |
| 기존9-8E | 6/6 |
| 신규9-8F | 11/11 (최종 빌드에서도 통과) |

기존 브라우저78개와 신규11개, 합계89개다. 각 시험의 장치/공개 프로그램 범위는 위 내용을 따른다. Windows Chrome 모바일 크기 시험을 Galaxy 실기 결과라고 표현하지 않는다. 기존 엔진/Worker/대응 소스112개는 Git HEAD의 바이트와 비교해 변경0개였다(`artifacts/phase9-8f/preservation.json`).

로그: `artifacts/phase9-8f/unit-final.log`, `final-browser.log`, `regression*.log`, `regressions.json`. 실제 타이머 측정값: `clock-12000.json`, `clock-max.json`. 이전 테스트 파일은 변경하지 않았으며 신규 테스트만 추가했다.

새 엔진 GPL 대응 소스 ZIP SHA-256: `d717c93d4d929e7f5267f09c868f9101a8a8d7aa2199d1709f97c21daf4f1ab4`.

최종 빌드 ID: `9-8f-20261109233317841-f502c19b` (작업 기준 커밋 `0879a8287b69`, 미커밋 변경 포함). TypeScript/production build 통과. 최종 빌드에서 신규11개 및9-8E6개 재검증 통과. `build-manifest.json`의111개 파일·SW·HTML의 JS 참조·모든 이전 및 새 Worker 해시 검증 통과. 100MiB 초과/배포 RAW·EFC·SAV·ISO·CUE/배포 파일 Git 줄바꿈 변형 모두0건. 기존 엔진 관련112개 파일은 최종 빌드 후에도 바이트 동일. 실제 원격 배포나 Galaxy9-8F 실행 성공은 아직 주장하지 않는다.
