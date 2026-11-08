# ED4 Mobile — Phase 2 결과 보고서

작성일: 2026-11-08 (Asia/Seoul). 프로젝트: 기존 `D:\porting\ed4-mobile`, 버전 0.2.0.

## 결과

새 프로젝트를 만들지 않고 기존 구현을 확장했다. 저장 삭제 유지, 저장/리소스 분리, 원본 ZIP 해시와 모드 버전 요구사항, 레이어 영향/충돌 진단, Worker 기반 실행 ZIP 합성, 메모리 관측, 파일 구조 분석과 진단 내보내기를 구현했다.

**실제 구영웅전설4 원본은 없으므로 ED4 실행·한글·음악·실제 저장 슬롯 검증은 하지 않았다.** 공개 DOS 테스트 프로그램으로 실제 WASM 실행과 파일 조작을 검사했다. Android 실기기 검증·공개 배포는 수행하지 않았다.

## 1. 구현 상태

| 작업 | 실제 구현 | 핵심 파일 |
|---|---|---|
| 저장 삭제 | 전체 DOS 파일 목록 + 변경 ZIP을 함께 관찰, tombstone 기록, 재실행 시 적용, 재생성 시 해제 | `public/dos-worker.js`, `src/save-state.ts`, `src/engine.ts` |
| 저장/리소스 분리 | `files`와 `resources`, 각 삭제 목록 분리. 원본/수정 파일은 읽기 전용 데이터로 유지 | `src/save-state.ts`, `src/archive.ts` |
| 기존 호환 | DB 이름 유지, 스키마 2의 메타데이터 catalog 추가, v1 저장/백업 읽기 및 프로필 식별자 보충 | `src/storage.ts`, `src/backup.ts` |
| 원본 검증 | 업로드 ZIP 바이트의 SHA-256, 버전 ID/별칭, 원본/수정별 기대 해시, 불일치 재연결 거절 | `src/integrity.ts`, `src/zip-worker.ts` |
| 모드 요구 버전 | 프로필 단위 요구 원본 버전 ID, 실행 전 검증 | `src/model.ts`, `src/main.ts` |
| 모드 충돌 | 경로별 레이어/최종 우선 파일, 순서 변경·제거 시 내용 변화 파일, 저장/tombstone의 새 모드 가림 표시 | `src/compatibility.ts` |
| 메모리 최적화 | 목록은 원본 본문 없는 catalog 조회, 선택 프로필만 로드, import/합성 Worker, ArrayBuffer transfer, 합성 단계 전체 파일 데이터 복제 회피 | `src/storage.ts`, `src/importer.ts`, `src/runtime-builder.ts` |
| 실패 처리 | ZIP 및 합계 크기 제한, 해제/합성 시간 제한, Worker 오류, 저장 응답 시간 제한, quota 사전 추정·실제 쓰기 오류 안내 | 관련 모듈 |
| 실기 준비 | ZIP 루트/파일 수/크기/EXE·COM·BAT 후보/긴 경로 분석, 범용 DOS 설정 프리셋, 로그·충돌·설정·메모리 진단 JSON | `src/archive.ts`, `src/presets.ts`, `src/main.ts` |

상세 저장 의미론은 `SAVE_INTEGRITY_TEST.md`, 모드 운영 방법과 버전 검증은 `MOD_COMPATIBILITY.md`에 있다.

## 2. 설계에서 명시한 경계

- Phase 1은 원본 ZIP 바이트를 남기지 않아 과거 ZIP의 raw SHA-256을 복원할 수 없다. 기존 항목은 **미확인**으로 유지하고 사용자가 같은 원본을 다시 선택할 때 비교 기준을 등록한다. 가짜 해시를 만들지 않는다.
- 같은 파일들을 재압축해도 ZIP 바이트가 달라지면 해시 불일치다. 내용 정규화 해시나 실제 상용판 버전 식별 DB는 없다.
- 원본 불변성은 실행 중 원본/수정 저장소에 쓰지 않는 구조와 테스트로 확인했다. IndexedDB에 저장된 모든 파일의 내용을 매번 재해시하는 저장매체 오류 탐지 기능은 아니다.
- 세이브 분류의 기본 `*.SAV`, `SAVE/`, `SAVES/`는 ED4 확정 규칙이 아니다. 그 밖의 기존 리소스 변경도 별도 공간에 보존하여 기존 저장을 유실시키지 않는다.
- 모드 패키지 의존성 그래프나 세이브 자동 변환은 구현하지 않았다. 프로필별 요구 원본 버전과 경로 충돌을 검사한다.
- DOS 설정 프리셋은 실험용 범용 값이며 ED4 최적 설정으로 표시하지 않는다.

## 3. 테스트 결과

작업 시작 전 기존 단위 **27/27**, E2E **5/5**가 통과했다. 기존 테스트 본문을 제거하거나 기대값을 완화하지 않았다.

최종 결과:

- TypeScript 및 production build: 통과.
- 단위 테스트: **54/54** 통과 (기존 27 + 신규 27).
- Chrome E2E: **11/11** 통과 (기존 5 + 신규 기능 5 + 합성 ZIP 메모리 관측 1).
- E2E 실행 환경: Windows, Chrome 157 headless, production build, localhost.

확인한 흐름: 실제 DOS 삭제와 재실행 유지, 리소스 분리, 삭제 전 백업 복원, v1 DB 업그레이드·v1 백업, 바닐라/두 모드 저장 격리, 레이어 추가·순서 변경·제거, 새 모드가 저장에 가려짐, 원본 해시 불일치, 원본 버전 요구 거절, BAT 실행, 잘못된 대용량 ZIP 헤더 거절, quota 오류 시 기존 데이터 유지, 모바일 크기 레이아웃, 기존 브라우저 재시작·오프라인 실행.

테스트 중 발견한 모드 원본 선택 문제를 수정했다. 수정 ZIP만 있는 항목을 새 모드의 기본 원본으로 선택하지 않도록 원본 후보를 제한하고 현재 프로필의 원본을 우선 선택한다. 삭제 파일을 디렉터리로 바꾸는 경우도 tombstone을 먼저 적용한 뒤 자식 파일을 넣도록 보완했다.

검사 재현:

```powershell
cd D:\porting\ed4-mobile
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

## 4. 메모리·성능 관측

실제 공개 COM에 난수 기반 8 MiB / 32 MiB `PAYLOAD.BIN`을 더한 합성 ZIP을 파일 경로로 업로드했다. Playwright가 큰 byte 배열을 프로토콜로 직렬화하는 부하를 피하기 위해 임시 ZIP 파일을 사용했다. 두 경우 모두 등록·실행·저장·진단 내보내기까지 성공했다. 데이터는 로컬에서 생성했고 상용 게임 데이터나 대규모 다운로드를 사용하지 않았다.

아래는 **PC Chrome 한 번의 실행 관측값**이다. Android 성능, 정확한 브라우저 전체 메모리, 최대 사용량, 개선 전후 성능 비교가 아니다.

| 관측 항목 | 8 MiB payload | 32 MiB payload |
|---|---:|---:|
| ZIP 실제 바이트 | 8,391,350 | 33,562,274 |
| ZIP 읽기 | 6.8 ms | 18.7 ms |
| SHA-256 | 5.9 ms | 24.3 ms |
| 압축 해제 | 2.5 ms | 8.3 ms |
| 실행 ZIP 합성 | 223.1 ms | 828.1 ms |
| 해제 시 알려진 입력+출력 버퍼 합 | 16,780,727 B | 67,117,475 B |
| 합성 시 알려진 입력+출력 버퍼 합 | 16,781,081 B | 67,117,829 B |
| 읽기 시 main JS heap 관측값 | 11,413,386 B | 36,556,777 B |
| DOS 저장 시 WASM 선형 메모리 크기 | 67,108,864 B | 67,108,864 B |

해석:

- `logicalBytes`는 존재하는 알려진 입력/출력 버퍼 또는 파일 크기의 합이다. 라이브러리 작업 메모리, IDB 직렬화, GPU, 오디오, 모든 Worker와 프로세스를 합친 RSS는 포함하지 않는다.
- `performance.memory`는 Chromium의 비표준·제약 있는 관측값이다. Worker에서는 이번 실행에서 제공되지 않아 **미측정**으로 남겼다. main heap 샘플도 GC/ArrayBuffer/프로세스 구성 때문에 peak로 사용하지 않는다. [MDN memory 문서](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)
- WASM 값은 `HEAPU8.buffer.byteLength`의 실제 크기이며 FS의 별도 JS 저장소까지 포함한 전체 엔진 메모리가 아니다.
- 시간은 해당 코드 구간의 `performance.now()` 차이다. DOS snapshot 시간은 파일 목록 순회 시간이며 전체 게임 저장 완료 시간을 의미하지 않는다.
- storage 여유 공간 검사는 `usage + 예상 기록량 × 1.2`와 브라우저 quota를 비교하는 **사전 추정**이다. 실제 쓰기 결과가 최종 판단이다. [MDN estimate 문서](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)

제한: ZIP 128 MiB, 해제 총량 256 MiB, 개별 파일 64 MiB, 항목 12,000개. 실행 원본/모드/저장 버퍼 합계도 256 MiB 제한을 둔다. 이를 만족해도 저메모리 기기의 성공을 보장하지 않는다. 32 MiB 초과의 실제 실행 성능과 Android 저메모리 종료는 미검증이다. 1 GiB로 조작한 ZIP 헤더는 해제 전에 거절하는 실패 경로만 검사했다.

메모리 원자료: `artifacts/phase2/memory-observations.json`. 진단 예제: `artifacts/phase2/diagnostics.json`.

## 5. 보존과 배포

- 기존 프로젝트와 Phase 1 보고서는 유지했다. 의존성 버전 및 에뮬레이터 바이너리는 교체하지 않았다.
- 앱 버전은 0.2.0, 백업 형식은 v2, IndexedDB는 기존 DB 이름의 스키마 v2다. Phase 1 앱으로 되돌아가면 새 DB/백업을 읽을 수 없으므로 원격 업데이트 전 백업이 필요하다.
- 기존 PWA 캐시에 `dos-worker.js`와 runtime ZIP Worker 번들을 포함하여 오프라인 회귀 테스트를 통과했다.
- GPL 전문과 upstream 대응 소스는 계속 제공하며 새 Worker adapter 소스도 런처 소스 ZIP에 포함한다. upstream WASM/JS 파일은 수정하지 않았다.
- 정적 배포 ZIP을 다시 만들되 Phase 1 ZIP은 별도 이름으로 보관한다. 공개 원격 배포는 하지 않았다.

## 6. 원본과 실기기가 필요한 작업

1. 실제 ED4 배포판·버전·실행 BAT/EXE 및 한글 초기화 식별.
2. 실제 저장 파일 규칙 확정과 슬롯 저장/삭제/복원, 모드별 저장 내용 호환성.
3. 한글 화면, 음악/효과음, 실제 입력키, CPU/메모리/사운드 설정 검증.
4. 합법적으로 보유한 실제 수정 모드와 원본 요구 버전 확인.
5. Android Chrome/Samsung Internet에서 홈 화면 설치, 회전, 멀티터치, 오디오 복귀, 장시간 성능·발열·강제 종료 검증.

현재 자료만으로 ED4 전용 프리셋이나 실제 게임의 모드 호환 성공을 확정하지 않는다. 후속 순서는 `NEXT_STEPS.md`를 따른다.
