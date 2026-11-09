# Phase 9-5B — 구버전 원본 메모리 배치 호환성

## 결론과 검증 수준

이번에 **설치된 DOSBox 0.74-3 Debug에서 구버전 ED4의 한글 메인 메뉴 표시를 실제 확인**했다. 과거 성공 기록을 재해석한 것이 아니라, 원본을 새 격리 폴더에 복사해 수행한 새 시험이다. ECE/Daum/Observed 실행 파일을 사용하지 않았다. 전투·플레이·게임 저장까지 검증한 것은 아니다.

PC에서도 ED4의 시작 주소는 Galaxy와 같은 **1C3B:0000**이었다. 그러나 PC에서는 첫 RETF가 **1C3B:0029 → A63B:002A**로 성공했다. 따라서 높은 load segment 또는 최초 RETF 자체만으로 DOS EXEC/CPU 결함을 판단할 수 없다.

확인한 구현 차이는 **텍스트 모드에서 비활성 VGA A0000-AFFFF aperture를 어떻게 처리하는가**다. 0.74-3 소스는 기본 RAM handler로 되돌리지만 고정 웹 소스는 읽기 FF/쓰기 폐기 handler를 설치한다. PC 실기에서 반환 tuple을 직접 읽고 RETF를 단일 실행했으며, 독립 공개 COM의 복사·비교·RETF A/B로 해당 차이의 영향을 검증했다.

이 증거에 근거하여 S3 텍스트 모드의 해당 aperture만 이전 RAM 동작으로 복원하는 **별도 Phase 9-5B 실험 엔진**을 만들었다. DOS 할당/CPU/게임 파일은 변경하지 않았다. **Galaxy의 실제 mapping과 메모리를 직접 관측한 것은 아니므로, Galaxy 게임의 최종 원인 및 실행 성공은 후속 실기로 확정해야 한다.**

## 1. 원본 계열과 해시

참고 원본은 `D:\ed4_rs_cb\ED4`이며 읽기 전용으로 취급했다. 사용자가 제공한 모바일 ED4.EXE 해시와 아래 ED4.EXE 해시가 일치한다. 나머지 네 파일은 제공된 크기가 일치하지만 모바일 SHA-256이 제공되지 않아 **모바일과 5개 파일 전체가 해시 일치한다고 주장하지 않는다.** ECE/Observed 계열 바이너리는 혼합하지 않았다.

| 파일 | bytes | 로컬 SHA-256 |
|---|---:|---|
| ED4.EXE | 516 | `20ac1206364f2bc83f3309b650094aba27f19b4956ef6e781335c50fedd27e9d` |
| DRIVER.EXE | 16556 | `0aacd13177882ae96b5f81b912ff08fc3f43462c5b97af13bf3fe91091535b3a` |
| LOGO.EXE | 409850 | `fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1` |
| SOUNDRV.COM | 4704 | `3c7d00b022e9b24267ad9692e901e690dec156b901523ac7bafa448c28019e77` |
| GAME.BAT | 84 | `d2fb9327484e121b725285a60ec5d5017addc722d7d3f72e2e617af2e8291420` |

`ed4-diagnostics (11).json`, `(12).json`은 사용자 확인대로 PC에 없다. 프롬프트의 Galaxy 관측값을 인용하며 없는 JSON을 생성하거나 분석한 것처럼 취급하지 않았다.

## 2. 새 PC Debug 시험 환경과 증거

- 실행 파일: `C:\Program Files (x86)\DOSBox-0.74-3\dosbox-74-3-debug.exe`
- SHA-256: `547dbcabe4286190f99af9d800ac295e6c5eda8d5e48c82392f51bcc6ba71037`
- 명령행: 위 실행 파일에 `-conf dosbox.conf`.
- 작업 디렉터리: `D:\porting\ed4-mobile\artifacts\phase9-5b\native-old-03`.
- C:는 그 안의 `game` 복사본만 마운트. D: ISO 미마운트, RAW 미복사, 사전 LOADER 호출 없음.
- `machine=svga_s3`, `memsize=16`, `core=normal`, `cputype=auto`, `cycles=12000`; XMS/EMS/UMB=true.
- SB16/220/IRQ7/DMA1/HDMA5, oplemu=default, oplrate=22050. mixer nosound=true/rate22050, MIDI none. **오디오 실제 출력 검증은 아니다.**
- GAME/DRIVER 흐름 중 `cycles max`가 실행되므로 12000이 세션 전체의 고정값이라는 뜻은 아니다.
- CONF SHA-256: `2fca5c650a1d24bb78a57dcf12ffd4779a4a9dec74b852f333b8cc0673e75340`.

원래 BAT는 그대로 실행했다. 그 전에 직접 작성한 5-byte 종료 프로그램 `PDGATE.COM`을 `DEBUG`로 실행하여 중단점을 설정한 뒤, 이 프로그램을 종료하고 GAME.BAT로 진행했다. MCB에서 gate의 상주 점유가 없음을 확인했다. DOS EXEC callback의 RETF 직전과 `BP 1c3b:29`에서 중단하고 F11로 단일 실행했다. 이는 게임 바이너리 패치가 아니다.

| 관측 시점 | 실제 PC 관측 | Galaxy 제공 관측 |
|---|---|---|
| ED4 최초 명령 | CS:IP=1C3B:0000, SS:SP=1C3B:02E0 | CS:IP=1C3B:0000 |
| startup RETF 직전 | CS:IP=1C3B:0029, SS:SP=A63B:01CA, ES=A63B, SI=DI=01D4, CX=0 | 1C3B:0029, SS:SP=A63B:01CA |
| 반환 tuple | A63B:01CA의 두 word=002A, A63B | 실제 메모리 내용 미관측 |
| RETF 단일 실행 후 | CS:IP=A63B:002A, SS:SP=A63B:01CE | FFFF:FFFF |
| 비디오 상태 | BDA 0040:0049=03 (BIOS mode 3) | 당시 실제 mapping 미관측 |
| 이후 | 한글 메인 메뉴 4개 항목 실제 표시 | FFFF 경로 실행 후 reset-vector |

BDA mode 값만으로 handler 내부 포인터를 읽었다고 주장하지 않는다. **실제 A63B 쓰기/읽기 지속 및 코드 실행**과 대응 소스의 mapping 구현을 함께 근거로 삼는다.

비공개 증거: `artifacts/phase9-5b/native-old-03/observations.json`, `debug.log`, `menu.png`, `manifest.json`, `dosbox.conf`. 원본 내용·세이브가 있는 복사본과 화면은 모두 Git 무시 경로에 두고 배포 ZIP/대응 소스에서 제외했다. `scripts/check-phase9-5b-native.py`로 실행 후 원본 191개와 복사본 191개 해시가 모두 유지됨을 확인했다.

앞선 `native-old-02`는 SAVE 폴더의 기존 CFG를 복사하지 않은 시험이었다. 첫 RETF는 성공했지만 이후 `C:SAVE\ED4_98.CFG` 열기를 반복하며 화면이 진행하지 않았다. 이를 게임/엔진 결함으로 판정하지 않고, 새 `native-old-03`에 SAVE를 포함한 원본 복사본으로 다시 시험했다. 실제 기존 세이브를 선택하거나 저장하지 않았다. `native-old-01`은 단축키로 debugger를 열지 못한 사전 시도로 성공 근거에 사용하지 않았다.

## 3. 왜 load segment가 1C3B인가

고정 웹 소스 `native/dosbox/src/dos/dos_execute.cpp`의 `DOS_Execute()`는 환경 블록을 준비하고 최대 빈 블록을 조회한 뒤 MZ 크기/min/max에 맞춰 PSP 블록을 할당한다. 일반 MZ는 **loadseg=pspseg+16 paragraphs**다. PC 0.74-3에서도 이 파일에 적용되는 계산은 같다.

ED4 MZ 숫자 필드: header 48 bytes, 초기 CS:IP=0:0, SS:SP=0:02E0, min/max=7FE1 paragraphs, relocation 2개. 실제 파일 payload는 468 bytes. DOSBox는 할당 산정 시 페이지 수×512−header=976 bytes를 사용하여 `(976 + 7FE1h*16 + 256)`을 paragraph로 올림한다. 결과 **802Eh paragraphs=525024 bytes**이며 실제 PC MCB와 일치한다. 파일의 마지막 부분 페이지 크기를 실제 로딩 데이터 길이와 혼동하지 않았다.

ED4 첫 명령 전 PC `DOS MCBS` 핵심:

| MCB | bytes | owner PSP | 의미 |
|---|---:|---|---|
| 0191 | 3936 | 0192 | SOUNDRV 상주 블록 |
| 0292 / 034D / 0518 | 2976 / 7168 / 544 | 0293 | DRIVER 블록 |
| 053B | 144 | 1C2B | ED4 환경 블록 (상속 이름 DRIVER) |
| 164D | 672 | 164E | LOADER |
| 1678 / 1823 | 6816 / 16480 | 1679 | RTM |
| 1C2A | 525024 | 1C2B | ED4 프로그램 블록 |
| 9C59 | 4656 | 0000 | 남은 빈 블록 |
| 9D7D | 10256 | 1679 | RTM |
| 9FFF | 196608 | 0008 | SC 예약 영역 |
| D000 | 8656 | 1679 | RTM UMB |

`1823h + (16480/16) + 1 = 1C2Ah` → MCB 다음 PSP=1C2B → loadseg=**1C3B**. RTM과 상주/환경 블록의 실제 점유가 이 배치를 설명한다. 작은 빈 블록들이 있지만 ED4의 약 513KiB 요청에는 충분하지 않다.

할당 직후 ED4 블록과 그 뒤 빈 블록을 합친 구간의 크기는 계산할 수 있으나, **EXEC 직전 DOS가 BX로 보고한 최대 연속 블록 값 및 당시 allocation strategy 변수는 직접 중단해 읽지 않았다.** 소스의 초기 전략은 first-fit(0)이다. 게임/RTM이 중간에 바꿨을 가능성을 관측 없이 배제하지 않는다. Galaxy MCB는 없으므로 이 표는 PC 실측이지 Galaxy MCB 덤프가 아니다.

## 4. 왜 A63B에 접근하고 RETF가 달라지는가

기존 정적 분석과 이번 단일 실행을 함께 보면, ED4 startup 자체가 `CS+8A00h` 위치로 468-byte 시작 모듈을 복사하고 SS를 그 위치로 옮겨 복사본의 반환 tuple을 읽는다. 따라서 `1C3B+8A00=A63B`, 반환 주소는 A63B:002A다. 이는 MZ 로더가 처음 설정한 SS=1C3B와 구분해야 한다. 이 고정 offset의 원저자 설계 의도나 모든 DOS 설치 환경에서의 유효성은 확인하지 못했다.

복사 범위는 **A63B0–A6583 inclusive**, tuple은 A657A/A657C. ED4의 DOS 소유 블록은 **1C2B0–9C58F**이므로 복사 위치는 소유 블록 밖, VGA 예약 구간이다. A20 wrapping 문제가 아니다. 작은 CS를 강제하는 방식은 사용하지 않았다.

소스 근거:

- PC `D:\ed4_rs_cb\ed4_draw_hook\vendor\dosbox-0.74-3\src\hardware\vga_memory.cpp`, `VGA_SetupHandlers()`의 graphics miscellaneous map=3: B8000 text handler 설치 후 A0000 및 B0000 비활성 구간에 `MEM_ResetPageHandler()`.
- 고정 웹 `artifacts/phase9-4/source/instrumented/native/dosbox/src/hardware/vga_memory.cpp:918` 부근: 같은 map=3에서 A0000에 `vgaph.empty` 설치.
- `VGA_Empty_Handler`: readb=FF, writeb 폐기. tuple 두 word가 FFFF로 읽히는 직접적인 구현 후보.
- `src/hardware/memory.cpp:154`, `MEM_ResetPageHandler()`는 `ram_page_handler`를 설치한다.

0.74-3 대응 소스와 설치된 Debug 바이너리가 완전히 같은 소스에서 빌드됐다는 재현 빌드 증명은 없다. 다만 설치 바이너리에서 해당 메모리 동작과 첫 RETF/메뉴를 직접 확인했다. 이는 소스만 보고 추정한 성공과 다르다.

## 5. 최소 수정과 범위

설정만으로 이 handler 선택을 바꾸는 확인된 기존 옵션은 없다. memsize/EMS/UMB/TSR/환경 크기 변경은 load segment 및 다른 프로세스 공간을 바꿀 수 있지만, 소유권 밖 접근과 전체 복사 범위의 안전성을 자동 보장하지 않는다. 단순 저주소 강제, min/max 패치, EIP 마스킹, 콜백 건너뛰기는 하지 않았다.

Phase 9-4 소스를 별도 추출해 **한 파일의 한 분기만 수정**:

`native/dosbox/src/hardware/vga_memory.cpp`, `VGA_SetupHandlers()` map=3:

```cpp
if (vga.mode == M_TEXT && svgaCard == SVGA_S3Trio)
    MEM_ResetPageHandler(VGA_PAGE_A0, 16);
else
    MEM_SetPageHandler(VGA_PAGE_A0, 16, &vgaph.empty);
```

기존 B0000 hole, mode7 mapping, 그래픽 mapping, S3 MMIO 후속 override는 유지한다. `PAGING_ClearTLB()`도 그대로다. 수정은 반복 명령 실행이 아닌 mapping 구성 시점의 분기다. 추가 큰 버퍼나 매 명령 JS 메시지는 없다. 모바일 성능/열/전력은 미측정이다.

이는 **레거시 호환성 복원**이지 실제 VGA 하드웨어가 이 영역을 일반 RAM으로 제공한다는 주장이나 DOS 메모리 소유권 수정이 아니다. FF 읽기를 기대하는 프로그램의 동작을 바꾸며, 그래픽 모드 전환 이후에는 mapping이 바뀐다. 모든 게임 구간에서 유효하다고 보장하지 않으므로 기본값으로 승격하지 않았다.

도구체인: 기존 WSL `Ubuntu-24.04`, Emscripten **3.1.21**, Node14.18.2, CMake3.24.2, Ninja1.11.1. 새 설치/다운로드/관리자 프로그램 실행 없음. 기존과 동일한 unmatched Asyncify 경고 15개가 남으며 숨기지 않았다. 최초 WSL 호출은 sandbox 접근 제한, 그 다음 잘못된 `Ubuntu` 배포명으로 실패했고, 기존 기록의 `Ubuntu-24.04`로 수정해 빌드했다. 임의 새 compiler를 사용하지 않았다.

```text
node scripts/prepare-phase9-5b.mjs
wsl -d Ubuntu-24.04 -- bash /mnt/d/porting/ed4-mobile/scripts/build-phase9-5b.sh
node scripts/package-phase9-5b.mjs
npx playwright test --config playwright.phase9-5b.config.ts
node scripts/package-phase9-5b.mjs --deploy
npm run build
```

`--deploy`는 공개 A/B 해시 검증을 통과한 파일을 **로컬 public 경로에 준비**하는 옵션이며 원격 업로드를 하지 않는다. 이 단계에서 원본 파일 또는 기존 stable WASM은 덮어쓰지 않는다.

실험 WASM SHA-256:
`81ee12956f39cc0b8ffc1ef5b1a5b6bd282231af253fde598aa70eb826f89e9a` (1471603 bytes).

Asyncify Reboot_Handler, 원래 abort, Phase 9-2/3/4 계측은 상속하며 코드 바이트를 수정하지 않았다. 소스별 before/after는 `artifacts/phase9-5b/source-changes.json`, 빌드 명령과 경고는 `logs/commands.txt`, `logs/build.log`에 있다. GPL 전체 대응 소스와 BUILD.md는 `public/sources/emulators-0.73.8-phase9-5b-source.zip` 및 `docs/ed4/sources/`에 제공한다.

## 6. 공개 검증

직접 작성한 CC0 `scripts/phase9-5b-probe.mjs`는 게임 코드를 재사용하지 않는다. A63B에 468개의 합성 바이트를 복사해 **전체를 비교한 경우에만** 직접 작성한 작은 RETF stub을 실행하고 DOS로 복귀한다. mode3/7/13h를 명시하여 실제 게임 mapping을 추정하지 않고 비교한다.

| 시험 | 기존 Phase9-4 | Phase9-5B | Native 0.74-3 Debug |
|---|---|---|---|
| mode3 복사/RETF | readback mismatch, 실행 생략 | 정상 복사·RETF·DOS 복귀 | 정상, exit code 0 |
| mode7 복사 | readback mismatch | 동일 mismatch | 이번에 미실행 |
| mode13h 복사/RETF | 정상 | 정상 | 이번에 미실행 |

브라우저 A/B **6/6 통과**, RuntimeError 0. '기존에서 mismatch'는 차이를 확인하는 기대 결과이며 숨긴 테스트 실패가 아니다. 네이티브 결과는 `artifacts/phase9-5b/public-copy-retf/result.txt`의 `PUBLIC_468_COPY_AND_RETF_OK`와 종료 코드로 확인했다. 초기 sandbox 안의 Chrome 서버 대기는 중단한 뒤, 로컬 브라우저 실행 권한을 갖춘 환경에서 실제 테스트를 완료했다.

추가 회귀 테스트 결과는 아래 최종 검증 절에 기록한다.

## 7. Galaxy 검증 절차와 판정

1. 사용자가 GitHub Desktop에서 변경 내용을 검토하여 Commit/Push한다. Codex는 실행하지 않았다. 온라인에서 새 오프라인 준비가 끝난 뒤 기존 탭/PWA를 닫고 다시 연다. **사이트 데이터 삭제나 게임 재등록은 하지 않는다.**
2. 기존 원본 프로필의 GAME.BAT로 임시 진단을 연다. 비교 설정은 동일하게 유지하고, 엔진만 **Phase 9-5B 텍스트 메모리 호환 · 저장 안 함**을 선택한다. Stable/9-2/9-3/9-4는 그대로 남는다.
3. 시작 후 JSON의 artifact.id=phase9-5b, 실제 WASM hash가 위 값인지 확인한다. 다른 해시라면 결과를 혼합하지 않는다. Worker는 내용 해시 경로와 revision으로 고정하며 자동 stable 대체하지 않는다.
4. 이전과 같은 DRIVER 조작을 한다. 화면, 다음 EXEC, 재부팅 유무를 기록한다. 멈추면 진단 JSON을 내려받는다. 재부팅 시 기존 최초 anchor/ring buffer를 함께 내보낸다.
5. 첫 RETF가 A63B:002A로 이동하면 startup 호환성 단계의 개선이다. 이후 다른 오류/검은 화면이 남으면 별개 문제로 기록한다. **게임 화면이 실제 표시되어야 Galaxy 화면 성공으로 판정한다.**
6. 정상 메뉴가 뜨더라도 이번 진단은 저장 변경분을 폐기한다. 종료 후 일반 실행은 Stable로 돌아간다. 아직 기본 엔진 변경이나 기존 세이브로 진행하는 장시간 플레이는 검증 대상 밖이다.

현재 trace는 reset 시 history를 전송한다. 재부팅 없이 메뉴로 진행하면 최초 RETF의 상세 이력이 JSON에 없을 수 있다. 화면 성공을 상세 CPU 이력 수집 성공과 혼동하지 않는다. 원본·RAW·세이브 내용은 JSON으로 수집하지 않는다.

## 8. 남은 원인 후보와 다음 판단

- Galaxy에서도 같은 text aperture 비활성 mapping이었는지, 실험 엔진에서 최초 RETF가 정상화되는지: 실기 필요.
- 모바일 DRIVER/LOGO/SOUNDRV/GAME의 전체 SHA: 미제공. 필요하면 기존 진단의 파일 해시로 계열을 확인한다.
- 다음 단계의 DPMI/그래픽 전환/리소스 및 음악 호환성: PC 메뉴만으로 검증되지 않는다.
- PC에서도 같은 `ouGGuG`, `cgGe`, `oplggte` 명령이 나타났지만 메뉴에 도달했다. 이 메시지만을 첫 RETF 실패의 충분한 원인으로 볼 수 없다. 임의 치환하지 않았다.
- DOS 최대 연속 블록의 실제 EXEC 직전 BX 반환값, 런타임 allocation strategy는 미관측. 현재 확인한 PC/웹 동일 CS 및 aperture 차이를 설명하는 데 강제 allocator 변경은 필요하지 않다.

설정만으로 해결됐다고 주장하지 않는다. 원인 후보를 좁힌 후 별도 실험 엔진의 단일 mapping 차이만 검증했으며, 실제 Galaxy 게임 성공은 아직 미확인이다.

## 9. 최종 검증 및 변경 목록

| 검증 | 결과 |
|---|---|
| TypeScript / production build | 통과 |
| 기존 단위 테스트 | 281/281 |
| 기존 Chrome E2E | 38/38 (기존 테스트 수정·삭제 없음) |
| 새 공개 aperture A/B | 6/6 |
| Phase9-5B 일회성 선택·저장/RAW 보존·해시 검증 | 4/4 |
| 구버전 캐시 혼합·offline·실패 차단 | 6/6 |
| Phase9-4 대 Phase9-5B CPU/INT18/INT19/reset/종료 회귀 | 26/26 |
| 기존 Phase9-5A 설정 비교·Stable/9-4 보존 | 4/4 |
| 기존 Pages 하위경로·오프라인·저장 복구 | 2/2 |
| 원본 및 네이티브 복사본 실행 전후 해시 | 191/191 각각 일치 |

새 캐시 시험의 첫 실행에서는 3개가 실패했다. 오류 차단은 실제로 동작했으나, 새 시험으로 복사하면서 기대 오류 문자열 `Phase 9-4`를 바꾸지 않은 테스트 작성 오류였다. 기대 이름만 `Phase 9-5B`로 고치고 프레임 0/EXEC 0/대체 엔진 금지/저장 보존 assertion을 유지하여 6/6 재통과했다. 최초 실패 결과는 `artifacts/phase9-5b/cache-tests-initial-label-failure.json`에 남겼다. 기존 테스트 조건은 변경하지 않았다.

변경 범위:

- 새 재현/빌드/공개 시험: `scripts/prepare-phase9-5b-native.py`, `check-phase9-5b-native.py`, `phase9-5b-probe.mjs`, `prepare-phase9-5b.mjs`, `build-phase9-5b.sh`, `package-phase9-5b.mjs`, 별도 `tests/phase9-5b*` 및 Playwright 설정.
- 엔진 선택 연결: `src/experimental-engine.ts`, `src/engine.ts`, `src/main.ts`의 기존 선택 목록에 항목 1개 추가. CSS/화면 배치 변경 없음. 저장 코드/스키마 변경 없음.
- 캐시 혼합 방지: 별도 `phase9-5b` Worker 생성/검증 스크립트와 `src/generated/phase9-5b-worker.ts`. 이전 공용 Worker와 이전 진입 Worker는 변경하지 않음.
- 라이선스/배포: `licenses/phase9-5b-engine.json`, `.gitignore`의 새 대응 소스 ZIP 예외, 준비/소스 패키징/build 검사 추가, GPL 고지문, 갱신 `docs/ed4/`.
- 보고/실기 안내: 본 문서와 `GALAXY_TEST_GUIDE.md`.

기존 Stable/Phase9-2/3/4 바이너리와 대응 소스, 디자인, 기존 테스트는 Git diff 및 SHA-256으로 대조한다. `scripts/check-phase9-5b.mjs`가 배포 파일과 대응 소스 ZIP, 100MiB 제한, 공개 CC0 DOS ZIP 외 상용 payload 부재, 원격 업로드 없음, staged 변경 없음을 기록한다. 검사 결과: `artifacts/phase9-5b/deployment-audit.json`.

실제 원격 업로드/Commit/Push는 수행하지 않았다. 게임·RAW·EFFECT·세이브는 배포 파일에 추가하지 않았다. Native 복사본과 메뉴 화면/실행 로그는 무시된 artifacts에만 보존하며 GitHub에 올리지 않는다. 기존 Galaxy의 IndexedDB/OPFS에는 이번 PC 작업으로 접근하지 않았다. 브라우저 저장 보존 테스트는 별도 자동화 프로필에서 수행했다.

성공 판정: **PC 동일 해시 ED4.EXE의 첫 RETF 및 메인 메뉴 확인, 메모리 mapping 차이의 공개 A/B, 일회성 실험 엔진 준비까지 완료. Galaxy에서의 1~6단계 성공은 아직 미검증.** 다음 단계는 설정을 추가 변경하지 않고 Galaxy에서 Phase9-4와 Phase9-5B만 비교하는 것이다.
