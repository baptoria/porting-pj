# Phase 8 — 최소 수정·검증 계획 (아직 미적용)

2026-11-09. 목표는 먼저 확인된 엔진의 재부팅 처리 중 null 트랩을 바로잡고, 별도로 ED4 실행 흐름이 재부팅 경로에 들어간 이유를 추적하는 것이다. 엔진 교체나 콜백 무시로 실행 성공을 만들지 않는다.

## 1. 첫 번째 최소 후보

변경 대상은 고정 대응 소스의 **`native/dosbox-jsdos/asyncify.txt` 한 파일**이다. JSON 배열에 다음 함수 이름 한 항목을 추가한다.

```json
"Reboot_Handler()"
```

이 이름은 현재 동봉 심볼의 2613과 정확히 일치한다. `src/dos/dosbox/dosbox.cmake:31`이 해당 파일을 `-s ASYNCIFY_WHITELIST=@...`로 사용한다. C++의 재부팅 처리 순서/의도된 abort, callback 테이블, CPU 설정을 바꾸지 않는다. 최소 후보가 선택된 근거는 SYMBOL_MAP 및 ROOT_CAUSE 보고서의 비계측 부모 + unwind 재진입 증거다.

**WASM 재컴파일이 필요하다.** JS에서 임의로 loop를 다시 넣거나 table[0]에 대체 함수를 넣는 패치는 안 된다. `ret`를 무시하거나 Reboot_Handler를 건너뛰는 것도 안 된다. 지금은 목록을 변경하거나 새로운 WASM을 만들지 않았다.

기대 결과는 공개 BIOS reboot probe에서 null function 대신 원래의 재부팅 안내 후 명시적 종료/abort 경로를 밟는 것이다. 이 역시 정상 게임 실행은 아니다. 현재 Reboot_Handler의 의도는 완전 재부팅 에뮬레이션이 아니라 종료이므로, ED4가 여기에 진입한다면 목록 패치만으로 플레이가 되지는 않을 수 있다.

부작용: 추가 함수의 Asyncify 저장·복원 코드, 코드 크기/타이밍/stack 사용량, 최적화·함수 번호 변화. 정상 실행에 영향을 주지 않는다는 검증이 필요하다. 전체 자동 계측으로 바꾸는 것은 더 넓은 변경이므로 첫 후보로 삼지 않는다.

## 2. 재빌드 방법 — 수행 전 제시하는 계획

기존 프로젝트와 배포 폴더를 보존하고 별도 분석 빌드 디렉터리에 고정 GPL 소스를 풀어 사용한다. source commit 및 ZIP 해시는 SYMBOL_MAP 보고서와 맞춘다. 원본 source ZIP을 덮어쓰지 않는다. source ZIP의 상용 benchmark/test 데이터 제외 정책을 유지한다.

동봉 `Dockerfile`은 **Emscripten 3.1.21**, Ubuntu focal을 지정한다. 현재 최신 SDK로 대체하면 비교 변수가 늘어나므로 같은 버전으로 기준 빌드와 패치 빌드를 각각 만든다. 동봉 Dockerfile의 전체 gulp/test 작업은 제외된 fixture를 요구할 수 있으므로 이번 목표는 CMake의 `wdosbox` 타깃으로 한정한다.

Emscripten 3.1.21이 준비된 격리 Linux 환경에서, 추출한 `emulators` 디렉터리를 작업 폴더로 사용한다:

```sh
source /emsdk/emsdk_env.sh
emcc --version
# 원본 목록 그대로 기준 빌드를 먼저 만든다.
emcmake cmake -S . -B build/phase8-baseline
cmake --build build/phase8-baseline --target wdosbox --parallel 4

# 별도 소스 사본에서 asyncify.txt에 Reboot_Handler() 한 항목만 추가한다.
emcmake cmake -S . -B build/phase8-fixed
cmake --build build/phase8-fixed --target wdosbox --parallel 4
```

산출물은 각 build 디렉터리의 `wdosbox.js`, `wdosbox.wasm`, `wdosbox.js.symbols`다. loader JS와 WASM을 서로 다른 빌드에서 섞지 않는다. 두 빌드의 도구체인·플래그·소스/바이너리 해시를 기록한다. 기존 npm 바이너리와 재현 빌드가 바이트 단위로 같을 것을 가정하지 않고, 먼저 기준 빌드가 같은 공개 결함을 보이는지 확인한다.

이 명령은 동봉 CMake/빌드 스크립트를 바탕으로 한 절차이며 이번 환경에서 컴파일 성공을 검증한 것은 아니다. SDK/OS 이미지/포트 의존성 다운로드와 시스템 설치는 수행하지 않았다. 필요한 대규모 다운로드·시스템 변경은 실제 작업 전에 규모와 방법을 보고한다. 라이브 배포로 바로 교체하지 않는다.

## 3. 자동 검증 기준

1. 기존 바이너리/재현 기준 빌드/패치 빌드에서 공개 INT18·INT19·reset-vector probe를 같은 조건으로 실행한다. 현재 `tests/analysis/phase8.spec.ts`는 고정 원본 결함 재현용이므로, 패치 테스트에서는 별도로 **null 트랩 없음 + 의도된 재부팅 안내/종료**를 검사한다. 단순 오류가 안 보인다는 조건으로 끝내지 않는다.
2. 패치 WASM에서 Reboot_Handler의 Asyncify 상태 검사/저장·복원이 실제 생성됐는지 역어셈블한다. 상태 1에서 비계측 코드가 후속 BIOS 호출을 이어가는 경로가 제거됐는지 확인한다. 함수 번호는 새 심볼로 다시 매핑한다.
3. 기준 빌드만 실패하고 목록 추가 빌드만 정상적인 종료로 바뀌어야 최소 후보의 효과를 입증할 수 있다. 둘 다 실패하면 다른 재진입 부모/목록 누락도 다시 조사한다.
4. 기존 단위 200개, Chrome E2E 38개, Pages 2개를 보존하고 공개 DOS 실행·오디오·RAW 지연 읽기·저장/복원·모드 격리·tombstone·오프라인을 검증한다. 일반 DOS 프로그램의 동작 변화가 있으면 배포하지 않는다.
5. 배포 후보를 만들 때만 런타임 해시, 대응 source manifest/ZIP, 라이선스, diagnosticRevision, 캐시 버전을 함께 갱신한다. `scripts/prepare.mjs`는 npm의 원본 바이너리를 복사하므로 이 경로를 무시하고 docs만 수동 교체해서는 안 된다. 사용자에게 비교 결과를 보고한 다음 배포 준비 여부를 결정한다.

## 4. 게임 쪽 재부팅 원인 추적

목록 패치 후 Reboot_Handler로 계속 진입한다면 다음이 우선이다. 추가 UI가 아니라 엔진의 제한된 구조화 로그로 검사한다.

- `native/dosbox/src/ints/bios.cpp:1006` Reboot_Handler 진입에 고유 메시지를 남긴다. 진입 시 CS:IP, CR0/보호 모드, PSP, callback 번호 등 숫자만 기록한다. 이것만으로 원래 게스트 호출 지점이 보존된다고 가정하지 않는다.
- `native/dosbox/src/cpu/cpu.cpp:550`의 `CPU_Interrupt(num,type,oldeip)`에서 INT 18h/19h에 한정해 **진입 전** CS:IP/oldeip·mode·PSP를 기록한다. reset-vector far jump나 잘못된 실행 흐름은 이 로그를 우회할 수 있으므로 BIOS callback 진입과 대조한다. 필요하면 reset 주소 접근에도 한정된 관측을 추가한다.
- `native/dosbox/src/dos/dos.cpp:810` / `dos_execute.cpp`의 EXEC 요청·결과에 부모 PSP와 mode를 연결한다. 실패 코드/결과가 필요한 곳만 추가하며 게스트 파일 내용이나 메모리 덤프는 내보내지 않는다.
- 비정상 셸 명령은 `shell_cmds.cpp:122`에 PSP와 제한된 command token을 연결해 DRIVER/LOADER/RTM/다른 셸 중 어느 호출 흐름인지 좁힌다. 실제 원본 BAT와 loader 문자열은 읽기 전용으로 비교한다. 예상 명령으로 자동 치환하지 않는다.

이 추가 C++ 계측 역시 재빌드가 필요하며 현재 미적용이다. guest 재부팅 진입 원인에 대한 증거를 얻은 뒤 DPMI 버전/보호 모드/로더 초기화 중 필요한 최소 범위만 수정 계획으로 제시한다. 추측으로 상용 파일을 교체하지 않는다.

## 5. Galaxy 비교와 완료 판정

현재 원본 GAME.BAT + SB16, NOSOUND.BAT, RAW 생략 조건을 각각 유지한다. 기존 폴더 등록/프로필/세이브를 사용하고 모든 비교는 저장하지 않는 임시 진단으로 한다. 서로 다른 엔진 빌드는 해시를 명확히 기록한다.

수집할 것은 오류/종료 방식, Reboot_Handler 진입, INT18/19/reset 경로, 마지막 EXEC 결과, 첫 게임 화면/키 반응이다. BIOS 종료가 보이면 “null function 해결 후보 검증”과 “게임 실행 실패 지속”을 함께 기록한다. 시작 화면·메뉴·이동·전투·내부 저장/복원까지 확인하기 전에는 게임 구동 성공으로 판정하지 않는다.

## 6. 다른 엔진 판단

현재 엔진에서 실패 opcode와 재현 가능한 누락 경로를 찾았으므로 해결 불가능하다는 근거가 없다. 지금 엔진 교체는 필요하지 않다. 최소 목록 수정 및 게스트 재부팅 원인 추적이 실패하거나 호환성 수정 범위가 크게 늘어날 때만 대안을 검토한다. 대안은 보호 모드/BIOS 호환성 개선 가능성과 함께 Worker API, RAW 어댑터, 저장/마이그레이션, 모바일 메모리 및 GPL 대응 소스 재검증 비용을 비교해야 한다. 현재 타 엔진을 테스트하지 않았으므로 특정 대안이 ED4를 실행한다고 추천하지 않는다.
