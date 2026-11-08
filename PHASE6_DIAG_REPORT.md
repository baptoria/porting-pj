# Phase 6 실행 중단·ZIP 등록 진단 보고서

2026-11-09. 기존 `ed4-mobile` 프로젝트, js-dos v7/emulators 0.73.8, `/porting-pj/ed4/` 경로를 유지했다. 앱 기반 버전은 0.5.0이며 진단 JSON에 `diagnosticRevision=phase6-1`, 화면에 PHASE 06을 표시한다.

## 사용자 실기 관측과 결론

Galaxy DOSBox 엔진, GAME.BAT와 DIGPAK/사운드 드라이버 초기화 메시지까지는 사용자 확인 완료다. 이후 검은 화면에서 진행되지 않았고 DOS 한글 일부가 깨졌다. 약 500MB 실제 게임 ZIP은 응답 시간 초과, 같은 게임 폴더는 등록 성공했다.

**실제 ED4의 정상 게임 진행이나 ZIP 오류 해결은 확인하지 못했다.** 이번 결과는 마지막 진입 명령과 ZIP 처리 중 무응답 단계를 식별할 수 있는 진단 수단이다. 실제 실패 원인을 정하려면 새 Galaxy 진단 JSON과 화면이 필요하다. 실제 ED4를 PC에서 실행하지 않았다.

## 구현

- 원본 BAT를 보존하는 임시 BAT 실행 추적: 파일/행별 순서, BEFORE/AFTER 마커, 중첩 CALL, 사운드/게임/초기화 후보, 한글 및 CD 관련 증거 표시.
- 실제 설치본에 존재하는 NOSOUND.BAT 등 선택과 이번 세션에만 적용하는 CPU/메모리/SB 비교. 원본 프로필 설정은 유지한다.
- 진단 실행의 자동/종료 저장 차단. 기존 세이브를 읽어 같은 환경을 구성하되 새 변경분은 폐기한다. 원본/모드/세이브/음악을 교체하지 않는다.
- 화면 PNG 및 실행 진단 JSON 다운로드. 일반 실행도 기존 저장 종료 절차와 함께 유지한다.
- ZIP 읽기/해제/CRC/파일·ZIP SHA-256/OPFS/IDB 단계 계측, 단계 진입 메시지, 진행률·화면 숨김 이력, 새로고침 후 최근 등록 진단 복원.
- 긴 ZIP 동기 소비 구간을 분할했다. 무응답 60초 감시는 유지했으며 가짜 heartbeat로 멈춤을 숨기지 않는다.

상세 설계·해석은 ED4_BOOT_TRACE.md 및 ZIP_IMPORT_DIAG_REPORT.md, 실기 절차는 GALAXY_TEST_GUIDE.md를 따른다.

## 회귀 테스트

수정 전 단위 101/101, Chrome E2E 26/26 통과. 사용자가 제시한 76/17에 Phase 5 추가분이 포함된 현재 기준이다.

최종 단위 **120/120**, Chrome E2E **30/30** 통과. 기존 기준 101/26을 모두 포함하며 신규 단위 19개와 E2E 4개를 추가했다. TypeScript와 production build도 통과했다. 중간 검증에서 발견한 모바일 키보드 겹침은 진단 상태 표시를 화면 상단으로 옮겨 수정했고, 기존 테스트 및 진단 모드의 844×390 키보드 열기/닫기를 재검증했다. 테스트를 비활성화하거나 기존 검증 조건을 약화하지 않았다.

전체 E2E 통과 후 마지막 진단의 프로필 식별 정보와 새 실행 시 이전 추적 초기화를 보완했다. 이 최종 변경은 단위 120개와 관련 E2E 4개를 다시 실행해 확인했다. 대용량 수치는 전체 30개 실행 시 수집한 동일 ZIP 처리 코드의 단일 관측값이다.

| 검증 | 결과 |
| --- | --- |
| 공개 DOS 중첩 CALL/사전·사후 마커/PNG·JSON | 통과 |
| 진단 중 세이브 삭제 후 기존 원본·프로필·저장 비교 | 동일, 정상 실행에서 기존 저장 불러오기 통과 |
| 실제 존재하는 합성 NOSOUND.BAT와 임시 SB none 비교 | 통과, 원래 설정 유지 |
| 500MiB 합성 폴더 등록 | 통과, 해당 E2E 전체 17.2초 |
| 500MiB store ZIP 등록·재실행·저장·RAW 읽기 | 통과, 해당 E2E 전체 28.9초 |
| 고압축 32MiB 합성 RAW ZIP의 단계 측정·SHA 일치·재로드 진단 복구 | 통과 |
| Worker 무응답 주입 / 60초 감시 / 마지막 zipSha 표시 | 통과, 가상 시계로 대기 시간을 진행한 오류 주입 테스트 |
| RAW CRC 실패 단계 보존 / 기존 등록 자료 불변 | 통과 |
| 기존 tombstone, 모드 격리, v1/v2 백업, 실제 브라우저 프로세스 재시작 | 통과 |

Pages 통합 테스트 **2/2** 통과: 하위 경로의 모든 배포 파일 응답/해시/MIME, manifest scope, WASM·Worker, 공개 DOS 실행·저장·오프라인 복원, 루트 SW 이전 시 다른 캐시/브라우저 데이터 보존을 확인했다. 실제 HTTPS 사이트에는 업로드하지 않았으며 로컬에서 동일한 하위 경로를 제공한 테스트다.

`check:desktop` 통과: docs 28개 파일, Git 포함 후보 127개, 상용 게임/RAW/세이브/비밀정보 검사 문제 0, 100MiB 초과 0. 최대 파일은 기존 에뮬레이터 대응 소스 ZIP 2,674,342바이트다. GPL 고지·런처/에뮬레이터 대응 소스를 유지했다. Git HEAD `69336eccf6a05cee59a731434b6fcc794075443d`와 main/origin 연결을 유지했고 staged 변경은 0이다. 원격 접근·Commit·Push는 수행하지 않았다.

### 실측 수치 (PC Chrome, 단일 실행)

500MiB store ZIP 원본은 524,296,013바이트, 해제 데이터는 524,288,943바이트였다. Worker 처리 22.244초, 측정된 음악/프로필 확정을 합친 값 22.384초. read 3.085초, fileSha 8.270초, CRC 0.986초, OPFS 1.389초, ZIP SHA 8.162초, 음악 DB 3.7ms, 프로필 DB 136.3ms. store ZIP이라 inflate 단계는 없다. 추가 원본 해시 읽기 때문에 read 바이트는 약 1,048,656,553바이트다. 전체를 한 번에 메모리에 올린 크기가 아니다.

500MiB 사례의 최대 작업 메시지 간격 10.8ms, 최대 진행률 메시지 간격 204.6ms, 최대 소비 조각 262,144바이트였다. 고압축 ZIP은 약 34KiB에서 RAW 32MiB를 해제했고, inflate 누적 112.1ms, 최대 실제 해제 출력 4,201,530바이트, 최대 소비 조각 262,144바이트, 최대 작업 메시지 간격 28.1ms를 관측했다. 이 수치는 Galaxy 성능 추정치나 전체 메모리 최대값이 아니다.

증거는 Git 제외된 `artifacts/phase6/large-zip-measurement.json`, `compressed-import-trace.json`, `boot-trace.json`, `trace-screen.png`, `before-e2e.json`, `after-e2e.json`에 보존했다. 스크린샷은 실제 ED4가 아닌 공개 DOS 테스트 화면이다.

## 파일과 배포

주요 변경: `src/boot-trace.ts`, `src/import-trace.ts`, `src/source-worker.ts`, `src/source-import.ts`, `src/zip-index.ts`, `src/simple-registration.ts`, `src/simple-import-ui.ts`, `src/archive.ts`, `src/runtime-builder.ts`, `src/runtime-worker.ts`, `src/main.ts`. 신규 단위/E2E 테스트와 기존 500MiB ZIP 테스트의 계측 결과 수집을 추가했다. 엔진 코드·DOS Worker·DB 스키마·세이브/백업 형식은 유지한다.

`docs/ed4/`는 production 빌드로 갱신한다. 기존 docs 루트 안내, `.nojekyll`, manifest, SW 캐시 범위, WASM/Worker, GPL 고지와 대응 소스 ZIP을 유지한다. 기존 Git 이력과 원격 연결을 보존하며 Commit/Push/원격 접속은 하지 않는다. 공개 배포 여부는 이번 로컬 작업의 검증 범위가 아니다.

## 제한

IF/GOTO/변수 치환 등 안전하게 변환하지 못하는 BAT는 원문 분석 결과와 경고만 표시하고 임시 추적 실행을 차단한다. 지원 문법을 검토하지 않고 제거/재작성하지 않는다. 사후 마커 부재만으로 고장을 확정할 수 없으며 프로그램 내부 정지 위치는 추가 조사가 필요하다. 한글 깨짐, 실제 CD 요구, 실제 BGM과 게임 진행은 Galaxy에서 별도로 확인한다.

상용 게임·RAW·세이브를 공개 결과물에 추가하지 않는다. 로컬 자동 테스트의 대용량 합성 자료·진단 파일·스크린샷은 Git 제외된 테스트/아티팩트 폴더에 둔다. 실제 기기 결과를 받은 뒤에만 후속 작업을 결정한다.
