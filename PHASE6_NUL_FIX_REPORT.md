# Phase 6: NUL 리다이렉션 및 실행 요청 로그 보완

2026-11-09 / appVersion 0.5.0 / diagnosticRevision **phase6-2**.

## 원인과 수정

`boot-trace.ts`는 실행 명령에 `<` 또는 `>`가 있으면 분기/확장 문법으로 묶어 차단했다. 따라서 원래 GAME.BAT의 `@SOUNDRV.COM > NUL` 때문에 전체 임시 진단 버튼이 비활성화됐다.

현재는 직접 실행하는 EXE/COM 명령 끝의 **단일 `> NUL`**만 허용한다. NUL 대소문자와 공백/탭 유무를 인식하되, 분석할 때만 접미부를 분리한다. 임시 BAT 실행 줄은 원래 `@`, 대소문자, 공백, 인수, `> NUL`을 그대로 유지한다. BEFORE/AFTER는 별도 줄에 출력한다. 원본 GAME.BAT는 수정하지 않는다.

다음은 계속 차단한다: `>> NUL`, `2> NUL`, 파일 출력, 입력 리다이렉션, 파이프/복합 명령, 변수 치환, IF/GOTO/FOR, PATH/LH, 따옴표로 감싼 NUL, `NUL:`/`NUL.TXT`/경로가 있는 NUL. BAT 또는 CALL 전체의 `> NUL`도 진단 마커와 호출 의미를 보수적으로 보호하기 위해 허용하지 않는다. 안전한 명령 하나를 허용했다고 나머지 줄의 검사를 건너뛰지 않는다.

기존 화면에 **임시 진단 실행 불가** 사유를 추가했다. BAT 상대 경로, 실제 행 번호, 거부한 리다이렉션/문법과 원문이 표시된다. 버튼의 설명 및 title에도 같은 사유를 연결했다. 레이아웃·CSS·색상 등 디자인은 수정하지 않았다.

## DRIVER 내부 실행의 관측 범위

동봉된 고정 버전 에뮬레이터 대응 소스에서 확인했다.

- `native/dosbox/src/dos/dos.cpp:810–818`: INT 21h / AH=4Bh 처리 시 `LOG_EXEC`의 `Execute <파일> <AL>`을 **DOS_Execute 호출 전에** 출력한다.
- `native/dosbox-jsdos/jsdos/jsdos-log.cpp`: 이 EXEC 로그는 `ws-err` 수준으로 전달될 수 있다. 채널명이 error여도 실행 실패라는 뜻이 아니다.
- `src/dos/dosbox/cpp/worker-protocol.cpp`: 기존 ws-log/warn/err/stdout 프로토콜로 전달한다.
- `native/dosbox/src/dos/dos_files.cpp:470` 부근: STDOUT 진단 전달은 실제 장치 Write보다 앞서므로 NUL에 버린 화면 출력도 ws-stdout에는 남을 수 있다.

에뮬레이터 교체·재컴파일 없이 기존 프로토콜을 읽는 `src/dos-observation.ts`를 추가했다. Worker 메시지를 수신하는 시점부터 로그를 수집하므로 UI 콜백 등록 전의 실행 요청도 보존한다. 기존 engine.ts에서 생략했던 일반 log도 실행 기록에 연결했다. BAT 마커는 **stdout만** 사용하므로 `Parsing command line: echo E4TRACE ...` 같은 엔진 로그를 실제 사후 마커로 오인하지 않는다.

진단 JSON의 `engine.execution`:

| 항목 | 의미 |
| --- | --- |
| `requests`, `latestRequest` | DOS 실행 요청 파일, mode, 수신 순번/경과 시간 |
| `sinceLatestRequest` | 마지막 요청 이후 경과 시간·프레임/오디오 패킷 증가·후속 로그/stdout |
| `recentLogs`, `recentStdout` | 크기를 제한한 원래 로그와 콘솔 출력 |
| `messageSilenceMs`, 마지막 frame/audio/stdout 시간 | 브라우저에서 관측한 마지막 응답 시점 |
| `state`, `workerError` | 엔진 준비/종료/Worker 오류 관측; 게임 상태 판정이 아님 |
| `droppedLogs`, `droppedRequests` | 보관 한도를 넘겨 제외한 개수 |

최근 로그와 실행 요청은 각각 128건, stdout은 32건, 문자열은 1,024자로 제한한다. 게임 파일/RAW/세이브를 읽어서 로그를 만들지 않는다. JSON에는 DOS 경로와 실행 출력이 포함되므로 공유 전 내용을 확인한다.

화면의 기존 진단 상태란에 BAT 마지막 명령과 DOS 마지막 실행 요청을 나란히 표시한다. 1초마다 이미 수신한 관측값으로 경과 시간을 갱신하며 엔진에 진단 명령이나 저장 요청을 추가하지 않는다. 마지막 요청 이후 프레임/오디오 패킷이 늘어도 게임 진행이나 실제 소리를 보장하지 않는다.

**요청은 로딩 성공이 아니다.** mode 0은 load/execute 요청, 1은 load only, 3은 overlay다. 실제 ED4.EXE 요청이 보이면 그 요청까지는 확인할 수 있지만 내부 명령 실행 성공, 정상 초기화, 부모/자식 관계 또는 멈춘 내부 함수는 확정할 수 없다. 로그가 없다고 실행되지 않았다고 단정하지 않는다. 실제 게임의 DRIVER.EXE → ED4.EXE 여부는 Galaxy에서 수집한 새 결과로 판단한다.

## 보존 범위

기존 프로젝트, js-dos/WASM 및 DOS Worker, 바닐라·모드 프로필, IndexedDB/OPFS 형식, 세이브/백업 형식을 유지했다. 진단 실행은 여전히 새 변경분을 저장하지 않는다. 상용 게임 원본, 모드, 세이브, RAW를 교체하거나 공개 배포에 추가하지 않았다. Git Commit/Push/원격 연결 변경은 하지 않는다.

## 자동 검증

수정 전 단위 120/120, Chrome E2E 30/30 통과. 신규 단위 25개는 NUL 허용/차단 경계, 원문 보존, 정확한 오류 위치, 엔진 로그 해석·보관 한도·오류 상태를 검사한다. 신규 E2E 2개는 실제 DOS 실행과 버튼 사유를 검사한다.

실제 DOS 검증은 기존 CC0 프로그램과 직접 작성한 16비트 COM만 사용한다. 합성 SOUNDRV.COM은 출력 후 반환하며, 합성 DRIVER.COM은 INT 21h/4B00으로 CHILD.COM을 요청한다. BAT 마커는 DRIVER.COM에서 대기하지만 엔진 로그는 CHILD.COM 요청을 식별해야 한다. 자식에서 Q를 누르면 DRIVER의 사후 마커를 확인한다. 원본·프로필·저장 DB가 전후 동일한지 비교한다. 테스트용 파일명이 실제 게임의 바이너리라는 뜻은 아니다.

최종 단위 **145/145**, Chrome E2E **32/32** 통과. 기존 120/30을 전부 유지했고 TypeScript 및 production build도 통과했다. 공개 테스트에서 NUL 전후 마커와 DRIVER.COM → CHILD.COM 실행 요청을 확인했다. 자식 실행 중 BAT의 DRIVER 사후 마커는 없고, Q로 자식을 종료한 후 사후 마커가 나타났다. 진단 종료 후 원본·프로필·저장 DB는 동일했다. 원문 보존 단위 테스트와 DOS 화면 캡처로 리다이렉션이 제거되지 않았음을 확인했다.

첫 신규 E2E에서 “NUL 출력은 ws-stdout에도 없어야 한다”는 검증 가정이 실패했다. 대응 소스의 STDOUT 전달 위치와 실제 DOS 화면을 확인하여, 화면 숨김과 진단 스트림 전달을 구분하도록 테스트를 바로잡았다. 리다이렉션을 제거하거나 엔진 동작을 바꿔 통과시킨 것이 아니다.

증거: Git 제외된 `artifacts/phase6-null/`의 before/after E2E 결과, `nested-exec.json`, `nul-dos-screen.png`. 실제 ED4는 PC에서 실행하지 않았다. 이 결과는 실제 게임 성공을 의미하지 않는다.

주요 변경 파일: `src/boot-trace.ts`, `src/dos-observation.ts`(신규), `src/engine.ts`, `src/main.ts`, 진단 버전 표기용 `src/simple-import-ui.ts`, `tests/phase6-null.test.ts`(신규), `tests/e2e/phase6.spec.ts`, 안내 문서와 `docs/ed4/` 생성물. `src/style.css`, 게임/저장/음악 저장 로직, WASM과 `public/dos-worker.js`는 변경하지 않았다.

`/porting-pj/ed4/` 로컬 Pages 통합 **2/2** 통과: WASM/Worker, manifest, 서비스 워커 범위, 오프라인 실행·저장 복원을 확인했다. 배포 감사도 통과했다(docs 28개, Git 포함 후보 130개, 제한 초과·제외 대상 문제 0). GPL 고지와 갱신된 대응 소스 ZIP을 포함한다. 실제 HTTPS 업로드/배포는 수행하지 않았다. Git HEAD `a1ff6ad559cbd97bb7803911abc91ca35a0856c1` 및 기존 원격 연결은 유지하며 사용자가 직접 Commit/Push한다.

## Galaxy 확인 절차

1. 사용자가 GitHub Desktop에서 소스·보고서·`docs/ed4/`를 Commit/Push한다. 기존 `/porting-pj/ed4/`, Pages main /docs를 유지한다.
2. 모든 해당 탭/PWA를 닫고 온라인에서 새 버전을 연다. 진단 JSON의 `diagnosticRevision`이 `phase6-2`인지 확인한다. 사이트 데이터를 삭제하지 않는다.
3. 기존 폴더로 등록한 프로필의 GAME.BAT를 선택한다. `@SOUNDRV.COM > NUL` 한 줄만으로 버튼이 차단되지 않아야 한다. 다른 사유가 남으면 표시된 파일/행/원문을 확인한다.
4. 설정을 바꾸지 않고 임시 진단을 실행한다. 검은 화면에서 진단 JSON과 화면 PNG를 내보내고 기다린 시간을 기록한다.
5. `bootTrace.lastEntered`가 DRIVER.EXE인지, `engine.execution.requests`에 DRIVER.EXE 다음 ED4.EXE 요청이 있는지 확인한다. mode 및 후속 로그를 함께 본다. 요청만으로 게임 성공이라고 기록하지 않는다.
6. 진단 종료 (저장 안 함)로 종료한다. 한글 깨짐은 별도 문제로 유지한다. 사운드·로더·게임 파일을 임의로 교체하지 않는다.
