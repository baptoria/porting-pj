# Phase 9-5A — PC DOSBox 환경 역추적 및 웹 설정 비교

2026-11-09. 프로젝트 `D:\porting\ed4-mobile`, 기준 Git HEAD `72e9a115e95739e4482d40821509aa9e9c13f614`. Git Commit/Push 및 상용 게임 실행은 수행하지 않았다.

## 결론과 증거 수준

**사용자가 기억하는 0.74-3 Debug 성공 당시의 실행 파일·명령행·CONF 조합은 아직 특정하지 못했다.** 파일 존재, 과거 실행 로그, 사용자의 정상 실행 확인을 구분했다. ECE r4412, Daum Debug, 별도 Observed 빌드를 동일한 성공 환경으로 합치지 않았다.

현재 가장 중요한 비교 항목은 CPU 속도보다 **설치본의 DRIVER/LOGO/BAT 차이와 ED4 시작 세그먼트**다. 로컬 네 사본의 ED4.EXE는 동일하지만, 연구용 사본과 ECE/Observed 시험 사본의 DRIVER.EXE·LOGO.EXE·SOUNDRV.COM·BAT가 다르다. Galaxy 파일 해시는 아직 없어 PC와 모바일 바이너리가 다르다고 확정할 수 없다.

동일 ED4.EXE라는 조건하에 Galaxy의 `1C3B:0029 → FFFF:FFFF`는 구체적인 메모리 배치 후보와 연결된다. 해당 시작 코드는 CS+8A00 세그먼트로 자신을 복사하고 그곳의 반환 주소를 RETF로 읽는다. CS=1C3B이면 목적지는 A63B이며 VGA aperture 안이다. 반환 주소가 FFFF로 읽힐 수 있는 소스 경로가 있다. **Galaxy 당시 VGA mapping/메모리 내용은 관측되지 않아 근본 원인 확정은 아니다.** EIP 마스킹·게임 헤더·CPU 연산은 수정하지 않았다.

다음 Galaxy 설정 시험 한 가지는 **`mixer.nosound=false → true`**다. run02 stdout에서 실제 적용 기록이 확인되는 항목이며, SOUNDRV를 생략하는 NOSOUND.BAT 시험과 다르다. 다만 run02가 성공 세션이라는 증거는 없고, 별도 Observed 세션의 값은 false다. 이 시험은 성공 환경의 확정 복원이나 RETF 해결책이 아니라, 같은 엔진에서 호스트 믹서 경로 하나를 배제하는 저위험 비교다. 실패하면 설정을 더 쌓아 바꾸지 않고 파일 해시와 최초 RETF 자료를 우선 대조한다.

## 1. 조사한 자료와 없는 자료

기존 Phase 8 ROOT_CAUSE / WASM_SYMBOL_MAP / FIX_PLAN, Phase 9-1 ASYNCIFY_REPORT, Phase 9-2 REBOOT_REPORT, Phase 9-3 CPU_TRACE_REPORT / HOTFIX_REPORT, Phase 9-4 FIRST_ANOMALY_REPORT, WASM_ERROR_ANALYSIS 및 현재 코드·고정 GPL 대응 소스를 검토했다. 해당 문서는 실제 존재한다.

외부 프로젝트는 읽기만 했다. 주요 근거:

- `D:\ed4_rs_cb\analysis\phase6\RUNTIME_CONNECTION.md`
- `D:\ed4_rs_cb\analysis\launcher\LAUNCHER_COMPATIBILITY.md`
- `D:\ed4_rs_cb\analysis\launcher\PACKING_FIX_INTEGRATION.md`
- `D:\ed4_rs_cb\experiments\launcher\Start_ED4_Direct.cmd`
- `D:\ed4_rs_cb\experiments\phase4\runs\run02\dosbox.conf`, `stdout.txt`
- `D:\ed4_rs_cb\experiments\phase6\integrated\debug_baseline_ready\Start_Debug_Once.cmd`, `prepared.json`, `dosbox.conf`
- `D:\ed4_rs_cb\experiments\launcher\trial\runs\20261106_111742_926283\session.json` 및 `diagnostic_engine\` 내부 CONF, runner 로그, DOS 로그
- `D:\ed4_rs_cb\launcher_research\DosBox\DBECE.conf`
- `D:\game\DGGL\Data\Launcher\DOSBox_ECE\dosbox.conf`
- `D:\ed4_rs_cb\analysis\static\dos_loader_disassembly.txt` 및 `analysis\legacy_evidence\snapshot\ed4-rea-report-4tmb5s_r\REPORT.ko.txt`

사용자의 최신 답변은 “과거 Debug 실행 성공과 디버거·ED4 기록을 확인했지만 정확한 실행 파일과 CONF는 기억나지 않음”이다. 이를 성공 보고로 인정하되 특정 실행 파일에 연결하지 않는다. 이전 문서의 “이 위치가 맞을 것”이라는 표현은 추정이다.

`ed4-diagnostics (11).json`은 Downloads/Desktop/Documents, `D:\ed4_rs_cb`, `D:\porting`의 파일명 검색에서 발견하지 못했다. 전체 PC에 없다는 의미는 아니다. 이번 분석에서는 사용자 제공 CS:IP/SS:SP/RETF 관측을 사용했고 없는 JSON을 생성하지 않았다.

## 2. 실행 파일과 실제 세션의 구분

| 대상 | 확인 가능한 근거 | 확인되지 않은 부분 |
|---|---|---|
| 설치 0.74-3 Debug | `C:\Program Files (x86)\DOSBox-0.74-3\dosbox-74-3-debug.exe` 존재·해시 재확인 | 성공 당시 이 파일을 실행했는지, 명령행·cwd·CONF |
| 0.74_Daum Debug | `D:\game\DGGL\Data\Launcher\0.74_Daum\dosbox_debug.exe` 존재. 별도 바이너리 | 정확한 SVN revision, 현재 게임의 성공 세션 |
| ECE r4412 | 설치 EXE 존재, 과거 정적 배너 조사, 현재 native CONF | 이 CONF가 사용자의 Debug 성공 당시 쓰였다는 증거 없음 |
| run02 | stdout에 DOSBox 0.74-3, 정확한 run02 CONF 로드, No Sound Mode Selected, MIDI none | stdout만으로 Debug/release 판별 불가; 원래 명령행·cwd·게임 정상 진행 증거 부족 |
| 준비된 Debug 기준 실행기 | `Start_Debug_Once.cmd`는 자기 폴더로 cd 후 설치 Debug + local CONF 실행하도록 작성됨 | 준비 기록은 실행 증거 아님. 해당 폴더에 실행 완료 stdout/시작 마커가 없음 |
| Observed 20261106_111742_926283 | runner 로그에 별도 EXE, CONF, 작업 디렉터리, PID, Exit 0. DOS 로그에 실제 후속 리소스 접근 | 화면/필드/전투 성공과 사용자가 기억하는 Debug 세션 동일성은 미확인 |

직접 재확인한 SHA-256:

| 파일 | SHA-256 |
|---|---|
| 설치 0.74-3 Debug, 3,934,208 bytes | `547dbcabe4286190f99af9d800ac295e6c5eda8d5e48c82392f51bcc6ba71037` |
| Daum Debug, 5,587,456 bytes | `88c87dd3eb66a89d5b6d0617fa37394dfa7f6c87dbed38e5371304367de67d90` |
| ECE, 5,763,072 bytes | `b07923ae7b65a002dea7b2187659f9f788814c72bfe91e3de594e138ce65154e` |
| 해당 Observed 세션, 3,193,344 bytes | `947e6a73ecd62402336270c8c4ad5ed14f17ef4b41cccd787833e2a3b0ef049e` |
| run02 CONF | `1f8c3f27349897a66b80a3243789fb06be61752391331824415bc92557976403` |
| 현재 ECE CONF | `0a0f7d2bfc4476ea2b346f9add8f7c88379f88197ffcf0ca2eab065fc7b28ab1` |
| Observed 세션 CONF | `1570e0fae8c5b63b1e0bf591c9f14a666de4dc0b5dc96b71670735d043da1a4d` |
| Observed 세션 DOS 로그 | `54722e549c50fe3041a9141e565744e9b37fb4dad89fc5eeee27a382a43f0cc6` |

`Start_ED4_Direct.cmd`는 자기 폴더로 이동하여 `src\run_trial.py --launch --mode direct --diagnose-autoexec --renderer-root ...\performance\candidate`를 호출한다. CMD 이름만으로 엔진을 결정할 수 없다. 위 runner 로그는 `diagnostic_engine\DOSBox_ED4_Observed.exe -conf ...\dosbox.conf`, 같은 diagnostic_engine cwd를 직접 기록한다. 이번에는 실행하지 않았다.

LAUNCHER_COMPATIBILITY는 작성 시점의 **정적 조사**다. 과거 `ace5a09d...` Observed 빌드와 이후 packing 수정 `947e6a73...`는 다르다. 이 별도 프로젝트의 C++ 구조체 packing 수정 이력을 웹 엔진의 동일 결함 증거로 전용하지 않았다.

## 3. 설정 비교표

“성공 PC”의 확정 열을 임의로 채우지 않고, 출처가 식별되는 환경을 나눴다. 아래 웹 값은 현재 생성 CONF와 공개 프로그램에서 확인한 속성이다. Galaxy 게임 실행 도중 값은 별도다.

| 항목 | Debug 성공 당시 | run02 | Observed 실제 세션 CONF | ECE 현재 CONF | 웹 초기값 |
|---|---|---|---|---|---|
| machine / memsize | 미확인 | svga_s3 / 16 | svga_s3 / 16 | svga_s3 / 16 | svga_s3 / 16 |
| core / cputype | 미확인 | normal / auto | normal / auto | auto / auto | auto / auto |
| cycles | 미확인 | 12000 | 50000 | 50000 | 12000 |
| XMS / EMS / UMB | 미확인 | true / true / true | true / true / true | true / true / true | 생략 시 모두 true, 실제 속성 조회 확인 |
| mixer nosound | 미확인 | true, stdout 확인 | false | false | false 기본값 |
| mixer rate / prebuffer | 미확인 | rate 생략 / 기본 | 44100 / 20 | 44100 / 20 | 22050 / 30 |
| SB / base / IRQ / DMA / HDMA | 미확인 | sb16 / 포트 생략 | sb16 / 220 / 7 / 1 / 5 | 동일 | 동일 |
| OPL emu / rate | 미확인 | 생략 | default / 44100 | nuked / 44100 | default / 22050 |
| GUS | 미확인 | 생략 | true, Y: 패치 경로 | true, Y: 패치 경로 | false 기본값, 조회 확인 |
| MIDI | 미확인 | none, stdout 확인 | intelligent / default | intelligent / default | none / none |
| C: mount | 미확인 | 게임 폴더 자체 | ED4_TRIAL 부모 | ED4_260801 부모 | 등록된 런타임 루트 `.` |
| D: ISO | 미확인 | 명령 없음 | ED4.iso 명령 있음 | ED4.iso 명령 있음 | 명령/전용 입력 경로 없음 |
| 실행 전 LOADER.COM | 미확인 | autoexec에 없음 | 명시적 호출·반환 로그 있음 | autoexec에 있음 | 기본 prelude 없음; BAT/로더 내부 요청은 별도 |

DBECE.conf는 `8|2|50000`, `11|7|nuked`와 같은 **런처 옵션 인덱스 파일**다. DOSBox `-conf`에 넣을 파일이 아니다. 현재 실제 ECE native CONF와 교차 확인했으며, `ipx=@ipx_ipx@` 등 미치환 항목은 적용 성공으로 보고하지 않는다. 현재 AppData의 dosbox-0.74-3.conf는 auto/auto/auto, nosound=false, SB16, XMS/EMS/UMB=true, 빈 autoexec이나 성공 당시 사용 여부는 미확인이다.

## 4. 웹 엔진의 지원 범위와 차이 분류

고정 소스는 upstream `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`, 로컬 대조 경로는 `artifacts/phase9-4/source/instrumented/native/dosbox/`다. `config.h`의 VERSION은 `jsdos` / dosbox-r4392 주석이다. **emulators 0.73.8은 패키지 버전이며 DOSBox 0.73이라는 뜻이 아니다.**

| 분류·우선순위 | 항목 | PC와 웹 차이 / 호환 여부 | 검증 방법·현재 결과 |
|---|---|---|---|
| A 높음 | mixer.nosound | 양쪽 설정 가능. nosound는 SOUNDRV 제거·sbtype=none·볼륨 0과 다름 | 같은 엔진에서 false/true만 비교; 공개 시험에서 native 속성 확인 |
| A 높음 | mount/cwd/prelude | DOS 내 경로 구성은 가능. 호스트 절대경로는 공유 불가 | 부모 mount와 직접 mount를 구분; LOADER 중복 호출 위험 때문에 자동 추가 안 함 |
| A 중간 | cycles, memsize, XMS/EMS/UMB | 설정 가능. 후자의 기본은 이미 true; 16→32는 VGA aperture를 RAM으로 바꾸지 않음 | CONFIG 조회, runtime cycles max 변경 확인. memsize 무작정 증가 안 함 |
| A 중간 | SB 포트, OPLrate, mixer rate/prebuffer | 공통 설정 가능, 현재 포트는 동일 | 한 값씩 진단할 후보. 이번에는 추가 동시 변경 없음 |
| B 높음 | core=auto | PC x86 빌드에서 dynamic 전환 가능; 현재 WASM은 normal 선택 | cpu.cpp:2317 이후/보호 모드 전환 조건부 코드, 빌드 매크로, 실제 심볼 대조 |
| B 높음 | DOS EXEC/MCB/환경·TSR 배치 | 같은 DOS API 이름이어도 버전·드라이버·환경 블록에 따라 load segment가 달라질 수 있음 | 동일 바이너리 해시와 실제 시작 CS 비교가 필요 |
| B 중간 | 사운드·GUS·MIDI | 게스트 장치 일부 구현은 있으나 웹 AudioContext/SDL 경로와 PC 출력은 다름 | GUS 설정만 켜도 PC Y: 패치가 생기지 않음. OS MIDI/default와 웹 none 동일하지 않음 |
| B 중간 | ISO / CD-ROM | 엔진에 이미지 mount 구현 있음, 앱에는 현재 전용 ISO 등록·대용량 CD 읽기 경로 없음 | cdrom_image.cpp/CMake 및 IMGMOUNT 확인. 현재 빌드에서 실제 ED4 ISO mount/필수 여부 미검증 |
| C | native dynamic x86 / dynrec | 현재 WASM에 해당 코어 없음 | Normal/Simple/Full/Prefetch 심볼은 존재, dynamic 심볼 없음; dynamic 문자열 설정으로 native JIT를 만들 수 없음 |
| C | ECE nuked 및 PC SDL/OpenGL·DLL 확장 | 현재 고정 엔진에 ECE 전용 구성 그대로 이식 불가 | 임의 설정/다른 엔진·DLL 복사 없음 |

`dosbox.cpp`의 XMS/EMS/UMB 기본은 true, GUS 기본은 false다. 공개 시험에서 CONFIG -get으로 동일 값을 읽었다. core 속성 문자열 auto와 실제 decoder는 다르다. `cpu.cpp`는 auto를 normal로 초기화하고 dynamic 자동 전환은 `C_DYNAMIC_X86`/`C_DYNREC`에서만 컴파일한다. `config.h`는 native 아키텍처 조건으로 해당 매크로를 켜며 WASM에는 둘 다 없다. 기존 WASM 심볼에 Normal, Simple, Full, Prefetch가 있고 dynamic은 없다. simple/full은 설정 가능하나 게임 호환성 검증은 하지 않았다.

공개 시험에서 시작 `cpu.cycles=12000`, `cycles max` 이후 `max`가 실제 조회된다. 따라서 Galaxy 로그의 정상 `cycles max >nul`이 실행됐다면 초기 12000 또는 50000 설정만 비교해서 런타임 속도 차이라고 주장할 수 없다. 실패 후 반환하지 않으면 이번 AFTER 조회도 없으며 그 경우 미관측이다.

ISO 이미지 코드는 `src/dos/dos_programs.cpp`의 IMGMOUNT, `src/dos/cdrom_image.cpp`, CMake의 빌드 입력에서 확인했다. 브라우저 VFS 내 파일은 별도이며 PC D:나 호스트 경로가 자동으로 보이지 않는다. 현 RAW는 OPFS 원본을 읽기 전용 지연 FS로 연결하는 구조로 CD 드라이브/ISO/CDDA의 대체가 아니다. 대형 ISO를 기존 본체 ZIP에 억지로 넣는 방법은 준비하지 않았다.

## 5. 설치본과 실제 실행 순서

`scripts/audit-phase9-5a.py`로 원본을 실행·복사하지 않고 크기·SHA-256·MZ 숫자 필드만 확인했다. 로컬 결과는 ignored `artifacts/phase9-5a/pc-evidence.json`, `trial-game-evidence.json`이다. 외부 프로젝트의 비공개 소스, 게임, RAW, 세이브를 저장소/배포물로 복사하지 않았다.

| 파일 | 연구용 원본 + run02 | ECE 설치본 + 현재 Observed trial 사본 |
|---|---|---|
| ED4.EXE | 516 bytes, 아래 공통 해시 | 동일 |
| LOADER.COM | 421 bytes, 아래 공통 해시 | 동일 |
| RTM.EXE / DPMI16BI.OVL | 120853 / 50576 bytes | 각각 동일 SHA-256 |
| DRIVER.EXE | 16556 bytes, `0aacd13177882ae96b5f81b912ff08fc3f43462c5b97af13bf3fe91091535b3a` | 347728 bytes, `bc99af5809dfb44670a760af418ca93439e647311b5b6f17e1bf12041a18e7b6` |
| LOGO.EXE | 409850 bytes, `fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1` | 42491 bytes, `de1816665fb3ca41a82fa379c64a0f0a762a303e07965ab6c17534f107a79fed` |
| SOUNDRV.COM | 4704 bytes, `3c7d00b022e9b24267ad9692e901e690dec156b901523ac7bafa448c28019e77` | 4798 bytes, `1cfa45edd967b56b5b20870b6225c952efb9c936d6d0d5b2c2fced5106929e5b` |
| GAME.BAT | 84 bytes, `d2fb9327484e121b725285a60ec5d5017addc722d7d3f72e2e617af2e8291420` | 79 bytes, `d95d33c09d9db83a9c40960cadb14a5d27e4cffca288e9da4df657e7a108e742` |

ED4.EXE 공통 SHA-256: `20ac1206364f2bc83f3309b650094aba27f19b4956ef6e781335c50fedd27e9d`.
LOADER.COM 공통 SHA-256: `462f48eb3749ebeb1d400488a9f39351ef2209554b7aed5cd80ed58e242ed097`.
현재 사본의 해시는 과거 실행 당시 파일의 완전한 보존 증명까지는 아니다. Galaxy도 새 진단 JSON의 effective-file 해시로 대조해야 한다.

- 연구용/run02: autoexec에서 GAME.BAT → SOUNDRV.COM > NUL → DRIVER.EXE ED4.EXE → SOUNDRV.COM/U > NUL. BAT에 직접 LOGO나 선행 LOADER 없음.
- ECE native 설정: PATH.BAT / MIXERSET / keyset / MIXER → C: → CD ED4 → LOADER.COM → GAME.BAT. BAT는 LOGO → SOUNDRV → DRIVER ED4 → SOUNDRV/U.
- Observed 실제 로그: 선행 LOADER 실행·반환 → GAME.BAT → LOGO 및 mantra.dat 접근 → SOUNDRV → DRIVER 인수 ED4 → INT2F1687 unhandled → dpmi16bi.ovl/RTM/overlay → hangul.fnt/EFC/DATA10·11·12·A 등 후속 접근. 그 로그에는 별도 `EXEC:Execute ED4.EXE` 행이 없었다. DRIVER 인수를 ED4 실행 시작 증거로 바꾸지 않았다.
- Galaxy: 사용자 제공 DRIVER → LOADER → LOGO/DPMI overlay/RTM → ED4 loader-prepared → 실제 1C3B:0000 명령 관측 → RETF FFFF:FFFF. 이 순서는 연구용 BAT와 부합하는 부분이 있지만 부모 실행기와 파일 동일성을 확정하지 않는다.

한글: Observed의 hangul.fnt 접근은 게임 내부 폰트 사용 단서다. DOS 콘솔 한글 로더를 실행했다는 증거와 다르다. LOADER.COM을 한글 지원 프로그램이라고 가정하지 않는다.

## 6. LOADER와 비정상 명령, DPMI

로컬 LOADER.COM의 짧은 정적 분석에서 `Please run GAME.BAT!`는 시작 경로에서 출력하는 안내 문자열이다. 이 문자열 하나로 실패 원인을 확정할 수 없다. 해당 LOADER는 INT21 hook/signature를 검사하고 기존 설치 상태에 따라 설치 또는 해제하는 경로가 있으며 특수 AX 값을 처리한다. 표준 EXEC 호출 모두를 단순 대체하는 한글 로더로 볼 근거가 없다. **두 번 실행하면 동일 효과라는 보장이 없어 prelude에 자동 삽입하지 않았다.** 이 분석은 위 해시 파일에만 해당한다.

`ouGGuG ddggw`, `cgGe normal`, `oplggte 44100`은 조사한 두 GAME.BAT/NOSOUND.BAT에 없다. 고정 웹 소스/런처도 이를 생성하지 않는다. 연구용 DRIVER/LOADER/LOGO의 원시 문자열 검색으로 직접 생성자를 식별하지 못했다. DRIVER의 압축·런타임 조립 가능성이 있어 검색 부재로 생성하지 않는다고 판정하지 않는다. ASCII 명령의 변형은 한글 OEM 코드페이지 깨짐만으로 설명할 수 없지만, 메모리/인수 조립/로더 전제/쉘 호환성 중 무엇인지 미확정이다. 임의 명령 치환은 하지 않았다.

Phase 8 공개 시험에서 Illegal command 자체는 같은 WASM 트랩을 만들지 않았다. 이 명령들이 실행환경 변경에 실패한 간접 영향은 남지만 RETF와의 인과관계는 아직 없다. `cycles max`는 별도로 유효한 설정 명령이다.

WASM과 PC Observed 로그 양쪽에 INT2F1687 unhandled가 있다. 이 인터럽트의 DPMI host 탐색에 호스트 서비스를 제공하지 않는 것과 게스트 RTM/overlay 자체 실행이 불가능한 것은 다르다. 웹 CPU에는 보호 모드 구현이 있으며 “웹은 DPMI를 전혀 지원하지 않는다”고 결론 내릴 수 없다. RTM 버전 호환, 부모의 메모리 해제/재배치, 환경·PSP 복귀 조건은 추가 비교 대상이다. DOS EXEC 요청은 성공 증거가 아니고 loader-prepared 역시 게임 초기화 성공이 아니다.

## 7. 초기 RETF와 메모리 배치 후보

사용자 관측: ED4 첫 명령 `1C3B:0000`, 이후 `SS=A63B, SP=01CA`, 첫 수상한 전이 `RETF 1C3B:0029 → FFFF:FFFF`.

로컬 동일 해시 ED4의 MZ 숫자 필드: header 48 bytes, 초기 CS:IP=0000:0000, SS:SP=0000:02E0, min/max allocation=7FE1 paragraphs, relocation 2개. 파일은 516 bytes이고 로드 모듈 실제 데이터는 468 bytes다. DOS_Execute의 CS/SS 초기화는 loadseg를 MZ 상대 세그먼트에 더한다(`src/dos/dos_execute.cpp:422–423`). 따라서 같은 파일·loadseg=1C3B라면 초기 SS:SP는 **1C3B:02E0**다. **A63B:01CA는 MZ 헤더가 준 초기 스택이 아니라 시작 코드가 직접 설정한 상태**다.

기존 정적 disassembly를 실제 파일의 해시·헤더·재배치 필드와 대조했다. 대량 원본 명령 바이트를 문서에 복사하지 않았다.

1. 시작 코드가 현재 CS에 8A00을 더해 ES/SS에 설정한다.
2. SP=01CA로 바꾸고 원래 모듈 468 bytes를 그 세그먼트로 복사한다.
3. offset 0029의 RETF는 복사된 01CA/01CC의 offset/relocated segment를 읽는다.
4. 정상 복사·재배치를 가정한 예상 목적지는 `(loadseg+8A00):002A`, 현재 값으로 **A63B:002A**다.
5. 복사 대상은 선형 A63B0~A6583, 반환 tuple은 A657A/A657C다. 모두 일반 conventional RAM이 아닌 VGA aperture A0000~BFFFF 안이다. A20 wrapping 대상도 아니다.

고정 소스 `src/hardware/vga_memory.cpp:747–758`의 VGA_Empty_Handler는 readb=FF, writeb 무동작이다. `:889–923`의 graphics mapping 선택에 따라 텍스트 B8000 창 밖 A0000 영역에 이 handler가 연결될 수 있다. 따라서 복사가 유효한 RAM에 도달하지 못하고 두 반환 word가 FFFF로 읽힌다는 설명은 실제 소스 및 관측 목적지와 일치한다.

추가 공개 COM은 독립 작성한 sentinel 두 word만 A63B:01CA/01CC에 쓰고 읽는다. 텍스트 mode 3을 명시하므로 **공개 시험의 해당 mapping 동작만 검증**하며 Galaxy 게임의 VGA mode, 실제 tuple, 게임 내부 메모리 전체는 수집하지 않는다. 결과는 아래 테스트 절에 기록한다.

남은 확인 사항:

- Galaxy ED4/DRIVER/LOGO/LOADER/DPMI 파일 해시가 어느 사본과 같은가?
- 성공한 PC에서 ED4의 실제 loadseg, 초기 SS:SP, 해당 RETF와 그 목적지는 무엇인가? 기존 Observed 로그에는 CPU 주소/이 반환 스택이 없어 답할 수 없다.
- Galaxy의 당시 VGA mode/mapping은 무엇인가? 받은 프롬프트만으로는 FF 반환을 확정할 수 없다.
- DRIVER·RTM·TSR·환경·MCB 배치가 높은 loadseg를 만든 것인가? 그보다 이른 메모리 손상이 있었는가?

현재 비교 우선순위는 **동일 설치본 확인 → 성공 실행기의 명령행/CONF 확정 → loadseg/메모리 배치 비교**다. 확장 메모리를 늘리는 것만으로 이 DOS 주소가 RAM이 되지는 않는다. core=normal은 현재 웹 auto의 실제 normal과 같고, EIP 마스킹은 최초 RETF의 FFFF:FFFF를 설명하지 못한다. 게임 헤더 수정, 원본 로더 교체, VGA mapping 변경은 하지 않았다.

엔진 수정 후보는 메모리 할당/환경 생성 또는 보호 모드 복귀의 버전 차이가 동일 바이너리·동일 DOS 환경에서도 재현되는 경우로 한정한다. 현재는 그 결함을 입증하지 못했다. Asyncify 수정은 이후 BIOS 재부팅의 null function을 해결한 별도 문제이며 초기 RETF의 해결 근거가 아니다.

## 8. 구현한 일회성 비교와 보존

기존 임시 진단 select에 두 항목만 추가했다. 레이아웃/CSS는 변경하지 않았다.

- **PC 환경 기준: 현재 설정 · 믹서 출력 켬**: GAME.BAT, 현재 profile settings와 RAW를 유지하고 mixer.nosound=false.
- **PC 환경 비교: mixer.nosound=true만 변경**: 같은 조건에서 mixer.nosound만 true.

두 진단 CONF는 이 boolean 한 줄만 다르다. 원본 BAT는 그대로이고 생성 임시 BAT에 동일한 CONFIG 조회를 넣는다. BEFORE/AFTER의 mixer.nosound와 cpu.cycles를 `bootSettings.environment.observations`에 기록한다. AFTER가 없으면 프로그램이 돌아오지 않았거나 관측되지 않은 것이며 값을 추측하지 않는다.

CONFIG -get은 DOSBox 속성 조회이지만 DOS 쉘의 CONFIG 환경 변수도 설정한다. 양쪽 모두 마지막 조회는 같은 초기 cpu.cycles이므로 진입 시 같은 값이 남는다. 따라서 두 시험 간 차이는 통제하되, 이 관측 BAT가 평상시의 완전 무계측 실행과 동일하다고 주장하지 않는다. 속성은 SDL 실제 오디오 장치 개방 여부·전 구간 런타임 값까지 보증하지 않는다. 기존 오디오 상태/오류 로그도 함께 확인한다.

등록된 effective file(원본+레이어+기존 저장 overlay)의 9개 지정 실행 관련 파일에 대해 basename, 길이, SHA-256, ED4 MZ의 제한된 숫자 필드만 기록한다. 게임 데이터/메모리/명령 바이트/개인 경로를 JSON에 넣지 않는다. 해시는 원본 인증서가 아니라 실행 대상으로 조합된 파일의 식별자다.

저장 스키마/IndexedDB/OPFS 구조와 기본 프로필은 변경하지 않는다. 진단 중 checkpoint·종료 저장은 기존대로 차단하고 변경분을 폐기한다. 비교 설정·엔진 선택은 저장하지 않으며 다시 열면 수동 진단/안정 엔진으로 돌아간다. 같은 Phase 9-4 엔진으로 두 시험을 수행해야 엔진 차이가 섞이지 않는다.

변경 파일: `src/environment-comparison.ts`, `src/archive.ts`, `src/runtime-comparison.ts`, `src/runtime-builder.ts`, `src/runtime-worker.ts`, `src/main.ts`; 신규 unit/browser tests, 읽기 전용 audit 및 공개 probe 스크립트, 이 문서/Galaxy 안내. production 앱과 대응 소스 ZIP은 docs/ed4에 갱신한다. **네이티브 소스·WASM·DOS Worker 공용/진입 파일은 수정하거나 재빌드하지 않는다.**

## 9. 자동 검증

로컬 Chrome의 `/porting-pj/ed4/`에서 공개 DOS/합성 RAW/독립 작성 COM만 사용했다. 상용 게임은 실행하지 않았다.

| 시험 | 결과 | 근거 |
|---|---|---|
| 변경 전 단위 | 272/272 | `artifacts/phase9-5a/unit-before.json` |
| 변경 전 기존 Chrome E2E | 38/38 | `artifacts/phase9-5a/e2e-before.json` |
| 변경 후 단위 | **281/281** (기존272 + 신규9) | `artifacts/phase9-5a/unit-after.json` |
| 변경 후 기존 Chrome E2E | **38/38** | `artifacts/phase9-5a/e2e-after.json` |
| 신규 환경 비교·기본값·VGA 공개 시험 | **4/4** | `artifacts/phase9-5a/browser-tests.json`, `browser/` |
| 기존 Phase9-4 선택/저장 폐기/RAW/GPL/오류 거부 | **4/4** | `artifacts/phase9-4/ui-tests.json` |
| 기존 Phase9-4 캐시 혼합·온라인/오프라인·실제 CPU 이력 | **6/6** | `artifacts/phase9-4/cache-tests.json` |
| 기존 Pages 하위 경로·오프라인·저장 복원 | **2/2** | `artifacts/phase9-5a/pages-tests.json` |
| TypeScript / production build / Worker 해시 검사 | 통과 | `npm run build` |
| 보존·GPL·배포 파일 감사 | 통과 | `node scripts/check-phase9-5a.mjs`, `artifacts/phase9-5a/deployment-audit.json` |

이번 변경 후 재실행한 브라우저 시험은 합계 **54개**다. Phase9-2/3 네이티브 A/B 전체 및 Phase9-4 26개 CPU 전이 A/B를 이번에 모두 재실행했다고 주장하지 않는다. 해당 테스트는 수정하지 않았고 모든 네이티브 엔진·계측 소스는 그대로다. 기본 실행·키보드·저장 복원·현재 진단 선택과 캐시 경로를 중심으로 검증했다.

신규 시험은 안정 엔진과 Phase9-4 각각에서 기준/비교 CONF가 nosound 한 줄만 다른지, native 속성 BEFORE/AFTER, 게임 반환 전 AFTER 부재, 공개 저장 로드·삭제 후 진단 종료 시 기존 저장 복구, RAW 읽기/seek, IndexedDB 전 store와 OPFS 파일 해시 동일성, 오프라인 재실행, 다음 실행의 안정 엔진 복귀를 확인했다. 파일 재등록 없이 수행됐다. 브라우저 테스트는 격리된 임시 프로필이며 사용자의 브라우저 저장소를 열거나 초기화하지 않았다.

공개 VGA 시험: 텍스트 mode 3에서 A63B:01CA/01CC에 각각 1234/5678 sentinel을 쓴 후 두 word 모두 FFFF로 읽혔다. `PUBLIC_TEXT_VGA_SENTINELS_READ_FFFF` 출력 및 RuntimeError 0을 확인했다. 게임 startup을 복제하거나 실행한 시험이 아니며, Galaxy 당시 mapping은 여전히 미확인이다.

개발 중 새 시험의 최초 버전은 자동 등록인데 선택창을 기다려 실패했고, 키보드 type()으로 보낸 따옴표/퍼센트가 DOS scancode에서 다른 문자로 입력되어 설정 조회가 실패했다. 공개 BAT의 명시적 선택/리터럴 명령으로 시험 장치를 수정했다. 새 mjs probe 선언 파일 누락으로 난 TypeScript 오류도 선언 추가로 수정했다. 기존 테스트/검증 조건을 완화하거나 삭제하지 않았다. 최종 위 실행은 실패·skip 없이 통과했다.

안정 WASM SHA-256 `5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf`, Phase9-2 `d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc`, Phase9-3 `a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b`, Phase9-4 `13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738` 모두 유지했다. 신규 WASM은 없다.

docs에는 상용 게임/RAW/세이브를 추가하지 않았고 배포 ZIP 내부도 검사했다. 기존 공개 CC0 DOS 시험과 GPL 대응 소스를 유지했다. 파일당100MiB 초과 없음; 최대 파일은 기존 Phase9-4 GPL 소스 ZIP 2,738,474 bytes다. CSS·기본 엔진·기존 테스트·Git HEAD 유지, staged 변경 없음. GitHub 배포 접속이나 Galaxy 실기 성능/게임 성공을 이번 로컬 검증으로 대체하지 않는다.

## 10. 다음 Galaxy 시험

1. 사용자가 변경 내용을 검토해 Commit/Push한다. 온라인에서 기존 탭/PWA를 닫고 다시 열어 업데이트한다. 사이트 데이터 삭제·재등록은 하지 않는다.
2. 기존 실패 프로필 → BAT 실행 순서 · 임시 진단 → 엔진 **Phase 9-4** → **PC 환경 기준**을 선택한다. GAME.BAT, 기존 CPU/메모리/사운드/RAW를 확인한다.
3. 같은 실패 지점까지 기다려 JSON을 받고 저장하지 않는 진단 종료를 누른다.
4. 같은 프로필·같은 Phase 9-4 엔진 → **PC 환경 비교: mixer.nosound=true만 변경**. 다른 값은 바꾸지 않는다. 결과 JSON을 별도로 받는다.
5. 두 JSON의 실제 WASM SHA-256, `bootSettings.config`, environment.files, BEFORE/AFTER, first target entry/RETF 주소를 비교한다. Phase 9-4 해시는 `13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738`이어야 한다.
6. 첫 JSON의 ED4/DRIVER/LOGO/SOUNDRV 해시부터 위 표와 대조한다. 동일 ED4만으로 동일 설치본이라고 하지 않는다. RETF 목적지가 같으면 믹서 차이를 해결책으로 채택하지 않는다. 변화가 있어도 그 자체로 정상 게임 실행 성공은 아니다.

실제 Galaxy 게임 결과, 성공 당시 PC CONF 및 PC 첫 RETF는 **미확인**이다. 추가 엔진 제작이나 다른 Phase로 자동 진행하지 않는다.
