# Phase 6 Hotfix 2 — 붙은 DOS 스위치 분석 수정

2026-11-09 / 앱 0.5.0 / `diagnosticRevision=phase6-hotfix2`

## 원인과 수정

기존 BAT 분석기는 공백으로만 실행 파일과 인수를 나누어 `SOUNDRV.COM/U` 전체를 파일명으로 찾았다. 실제 `SOUNDRV.COM`이 있어도 4행에서 누락 오류를 만들고 임시 진단 버튼을 비활성화했다.

`src/boot-trace.ts`에서 직접 실행하는 명시적 `.COM` 또는 `.EXE` 파일명 뒤의 단순 ASCII 스위치를 분리한다. `SOUNDRV.COM/U`, `SOUNDRV.COM /U`, 두 형태의 `> NUL` 조합을 모두 지원한다. 진단 JSON에는 실행 파일 `SOUNDRV.COM`, 인수 배열 `["/U"]`, 리다이렉션 `> NUL`을 별도로 기록한다. 원래 대소문자·공백·탭·인수·리다이렉션은 임시 BAT 명령 행에서도 유지한다. 분석 결과를 다시 조합해 원문을 바꾸지 않는다.

허용 범위는 `/U`, `/UNLOAD`, `/U2`처럼 슬래시 다음 영문자로 시작하고 영문자·숫자만 이어지는 스위치다. 붙은 스위치는 하나만 허용한다. 다른 EXE/COM에도 같은 규칙을 적용한다. 복합 `/U/OTHER`, `/U:PATH`, `/U=BAD`, `//U`, BAT/CALL에 붙은 스위치는 추정하지 않고 거부한다. 파이프, 복합 명령, 변수 치환, 파일 출력·추가 리다이렉션 등 기존 차단 정책은 유지한다.

`TOOLS\SOUNDRV.COM/U`, `C:\TOOLS\SOUNDRV.COM/U`, 루트 역슬래시 경로 및 유효한 상대 경로를 구분한다. `C:SOUNDRV.COM/U` 같은 드라이브 상대 경로, 다른 드라이브, 루트 밖 경로는 계속 차단한다. `TOOLS/SOUNDRV.COM/U`처럼 DOS 명령에 슬래시로 쓴 경로는 자동 보정하지 않는다. 고정된 엔진 대응 소스 `emulators-0.73.8-source.zip`의 `native/dosbox/src/shell/shell_cmds.cpp`에서 `DOS_Shell::DoCommand`가 첫 `/`를 명령 토큰의 끝으로 처리하는 것을 확인했다. 저장소 내부의 정규화된 파일 경로와 DOS 명령 문자열은 서로 구분한다.

위험 문법이나 실제 파일 누락이 있으면 기존 파일명·행 번호·원문이 포함된 비활성 사유 표시를 유지한다. 엔진, UI 디자인, DB 스키마, 음악 저장 방식은 바꾸지 않았다.

## 제공된 5행과 실행 관측

```bat
@ECHO OFF
@SOUNDRV.COM > NUL
@DRIVER.EXE ED4.EXE
@SOUNDRV.COM/U > NUL
@ECHO ON
```

파일이 존재하는 공개 합성 설치본에서 5개 단계가 분석되고 진단 버튼이 활성화된다. 각 행 전후에 `E4TRACE BEFORE/AFTER <번호> END`를 임시 BAT에 삽입한다. 원본 BAT와 게임 저장소의 파일은 수정하지 않는다.

공개 테스트용 DRIVER가 자식 프로그램을 실행하는 동안 `bootTrace.lastEntered.program=DRIVER.EXE`, `returned=false`, 4번 단계 미진입이 관측됐다. 이때 기존 DOSBox 로그의 `engine.execution.latestRequest`에는 `ED4.EXE`, `mode=0` 요청이 기록됐다. 자식 프로그램이 반환하면 사운드 정리 행을 지나 5번까지 전후 마커 10개가 모두 수집됐다. 사운드 테스트 프로그램이 받은 실제 명령 꼬리에서도 `/U`를 확인했다. 붙인 형태와 공백을 둔 형태를 각각 실행했다.

**EXEC 요청은 로더 호출 요청이며 실제 게임 초기화 성공이 아니다.** BAT의 AFTER가 없다는 사실만으로 정지를 단정할 수도 없다. 기존 프레임·오디오 콜백, 경과 시간, stdout/엔진 로그 관측을 유지했으며 게임 내부 성공 신호로 바꾸어 해석하지 않는다.

PC 테스트의 `DRIVER.EXE`, `ED4.EXE`, `SOUNDRV.COM`은 이 프로젝트의 공개 CC0 테스트 코드다. DRIVER는 INT 21h/4B00으로 자식을 호출하고 ED4 이름의 파일은 ED4TEST.COM 공개 테스트 프로그램을 사용한다. 고정 DOSBox의 비-MZ COM 형식 로딩 지원을 이용했다. 실제 상용 DRIVER/ED4 바이너리의 동작을 재현했다고 주장하지 않는다. 상용 게임은 PC에서 실행하지 않았다.

## 저장 보호

- 진단용 BAT와 실행 설정은 기존 일회성 실행 환경에만 적용한다.
- 기존 일반 실행으로 만든 세이브를 진단 세션에서 삭제한 후 종료해도 IndexedDB의 원본·프로필·세이브가 진단 전과 동일했다. 일반 실행으로 다시 열어 기존 세이브 내용을 읽었다.
- 합성 RAW 읽기를 함께 검증했다. 음악 읽기 전용 마운트와 기존 폴더 등록·모드·tombstone·백업 로직을 유지한다.
- 진단 세션의 새 저장·삭제 변경분은 기존 정책대로 폐기한다. 실제 플레이의 저장은 일반 실행에서 수행한다.
- 사용자 브라우저의 게임/음악/모드/세이브에 접근하거나 삭제하지 않았다.

## 자동 검증

| 항목 | 결과 |
| --- | --- |
| 수정 전 단위 테스트 | 145/145 통과 |
| 수정 전 Chrome E2E | 32/32 통과 |
| 수정 후 단위 테스트 | 180/180 통과 (기존 145 + 신규 35) |
| TypeScript | 통과 |
| 신규 5행 BAT Chrome 실행 | 2/2 통과 |
| 수정 후 전체 Chrome E2E | 34/34 통과 (기존 32 + 신규 2), 2.7분 |
| GitHub Pages 하위 경로 통합 | 2/2 통과, 로컬 `/porting-pj/ed4/` |
| production 빌드 | TypeScript 및 Vite 빌드 통과 |
| 배포/공개 후보 파일 검사 | docs 28개, 상용 게임·RAW·세이브 없음, 100 MiB 초과 없음 |

신규 단위 테스트는 붙은/분리된 스위치, 대소문자·공백 보존, 다른 EXE/COM, 경로/드라이브 구분, 잘못된 인수와 기존 금지 문법, 누락 파일 검사, 5행 전체 분석 및 전후 마커를 검사한다. 기존 테스트를 삭제하거나 통과 조건을 완화하지 않았다. 기존 E2E 테스트의 자식 실행 fixture는 기본값 CHILD.COM을 유지하고 새 테스트만 다른 이름을 인수로 사용한다.

Pages 검증은 모든 배포 파일의 HTTP 응답/해시, WASM MIME, Worker, manifest/아이콘, 서비스 워커 범위·캐시 격리, 실제 공개 DOS 실행·입력·오디오 활성화, OPFS 읽기, 오프라인 재실행 및 저장 복원을 검사했다. 로컬 정적 서버 결과이며 새 GitHub 원격 배포 접속이나 Galaxy 테스트 결과가 아니다. 최종 런타임 번들은 `index-DqGbkm2n.js`, 오프라인 캐시 식별자는 `741fe6d44d832a24`다.

로컬 증거는 `artifacts/phase6-hotfix2/`의 수정 전후 E2E 결과, 공개 프로그램의 진입 대기/반환 진단 JSON, Pages 결과와 배포 감사 JSON에 보관한다. 이 폴더는 Git 제외 대상이다. 대응 소스 ZIP에는 최신 소스·테스트·보고서가 들어가며, WASM/엔진 파일과 upstream 소스 해시는 기존 고정 버전과 동일하다. Git HEAD는 작업 전후 `cc03850e31edb8ff0a1129bf47bf258eb02ca8b1`, 스테이징 파일은 0개다.

## Galaxy 확인 절차

1. 사용자가 GitHub Desktop으로 변경 사항을 Commit·Push하고 Pages 배포 완료를 확인한다. 이번 작업에서는 원격 작업을 수행하지 않는다.
2. 기존 게임을 정상 저장 후 모든 해당 탭/PWA를 닫고 온라인으로 다시 연다. 사이트 데이터는 삭제하지 않는다. 진단 JSON의 `diagnosticRevision`이 `phase6-hotfix2`인지 확인한다.
3. 이미 폴더로 등록된 프로필을 사용한다. **설정 · 백업 → BAT 실행 순서 · 임시 진단**에서 GAME.BAT를 선택한다. 재등록하거나 BAT를 수정하지 않는다.
4. 5행과 SOUNDRV.COM, DRIVER.EXE가 분석되고 **임시 진단 실행 (저장 안 함)**이 활성화되는지 확인한다. 다른 사유로 비활성화되면 표시된 파일·행·원문을 그대로 전달한다.
5. 현재 CPU/메모리/사운드 설정 그대로 실행한다. 검은 화면이 이어지면 기다린 시간, 화면 PNG, 진단 JSON을 저장한다.
6. `bootTrace.lastEntered`, `returned`, `events`와 `engine.execution.requests`를 함께 확인한다. 3번 DRIVER 진입 후 ED4 EXEC 요청이 보이면 그 요청까지 관측된 것이며 ED4 초기화 성공 판정은 보류한다.
7. **진단 종료 (저장 안 함)**으로 종료한다. 진단에서 진행한 내용은 세이브에 남지 않는다. 한글 출력 문제는 실행 중단과 별도로 기록한다.

## 배포 및 남은 확인

배포 경로 `/porting-pj/ed4/`, 폴더 `docs/ed4/`를 유지한다. 새 번들, 서비스 워커 캐시와 GPL 대응 소스를 갱신한다. 상용 게임·RAW 음악·세이브를 추가하지 않는다. Git 이력과 원격 연결은 보존하며 Commit/Push는 사용자가 수행한다.

변경 파일:

- `src/boot-trace.ts`: 명령/스위치 구분과 JSON 단계 정보.
- `src/main.ts`, `src/simple-import-ui.ts`: 진단 리비전 식별값.
- `tests/phase6-hotfix2.test.ts`, `tests/e2e/phase6.spec.ts`: 신규 단위/실제 DOS 회귀 테스트.
- `ED4_BOOT_TRACE.md`, `GALAXY_TEST_GUIDE.md`, 이 보고서: 사용 방법과 검증 범위.
- `docs/ed4/assets/index-*.js`, `docs/ed4/index.html`, `docs/ed4/sw.js`, `docs/ed4/sources/ed4-mobile-source.zip`: production 번들 교체와 최신 GPL 대응 소스. WASM/엔진 바이너리는 그대로다.

이 수정은 Galaxy에서 보고된 파싱 오류에 대한 진단 수단을 제공한다. **Hotfix 2의 Galaxy 실제 버튼 활성화·추적 결과와 실제 영웅전설4 정상 실행은 아직 미검증이다.** 사용자의 기존 DOSBox/BAT 일부 실행 확인은 유지하며, 실제 게임의 정지 원인과 정상 진행 여부는 Galaxy 진단 자료를 받은 뒤 판정한다.
