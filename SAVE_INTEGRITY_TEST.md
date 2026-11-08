# 저장 무결성 검증 — Phase 2

날짜: 2026-11-08. 환경: Windows, Node 24.16.0, Chrome 157 headless, production build + localhost. 게임 데이터는 직접 작성한 공개 DOS COM/BAT와 합성 데이터만 사용했다.

## 저장 구현

1. `public/dos-worker.js`는 수정하지 않은 emulators 0.73.8 Worker를 감싸고 Emscripten FS를 관찰한다.
2. `ws-persist`가 변경 ZIP을 보내는 **동일한 동기 JavaScript 메시지 작업**에서 `/home/web_user`의 전체 일반 파일 경로를 수집한다. `.jsdos`는 제외한다.
3. 변경 ZIP만으로 삭제를 추정하지 않는다. 목록 수집 실패·안전 제한 초과·저장 응답 시간 초과 시 새 저장을 쓰지 않는다.
4. 이번 실행의 원본/모드 경로, 이전 저장 경로와 tombstone을 실제 현재 경로 목록과 비교한다. 사라진 경로를 저장/리소스 삭제 공간에 분류한다.
5. 이전 변경분과 이번 변경분을 합치되 삭제된 파일을 제거한다. 재생성된 경로의 tombstone은 해제한다.
6. 파일 변경과 tombstone을 **같은 Save 레코드**로 IndexedDB에 원자적으로 기록한다.
7. 재실행은 읽기 전용 원본/모드에서 새로운 실행 뷰를 만들고 tombstone을 적용한다. 영구 원본 파일을 unlink하지 않는다.

v7의 변경 파일 수집은 기존 `persist()`를 사용한다. 추가 코드는 파일 목록을 제공하여 삭제 의미를 보완한다. DOS가 아직 디스크에 쓰지 않은 내부 메모리 상태나 열린 버퍼를 강제로 세이브로 변환하지 않는다. 게임 내부 저장 완료 후 런처 저장을 사용해야 한다.

## 데이터 형식과 호환성

DB 이름 `ed4-mobile-v1`은 유지하며 **IndexedDB 스키마 버전 2**에 메타데이터 전용 `catalog`를 추가했다. 기존 `archives`, `profiles`, `saves`를 지우지 않는다.

Save schema 2:

```text
profileId, profile, updatedAt
files                  새 파일 및 저장 경로 규칙에 맞는 변경 파일
resources              기존 원본/모드 경로의 비세이브 변경 파일
tombstones             저장/새 파일 삭제 경로
resourceTombstones     기존 리소스 삭제 경로
```

Phase 1 저장은 읽을 때 빈 tombstone/resource 필드를 보충하며 기존 `files` 바이트를 유지한다. 다음 성공한 체크포인트부터 현재 원본 경로와 저장 규칙으로 분류한다. 프로필 식별자도 읽을 때 보충하며 이후 쓰기·백업 시 유지한다. 마이그레이션 때문에 과거에 유실된 삭제 이력을 추정해 만들지는 않는다.

백업 형식 v2는 `ED4-BACKUP.JSON`, `FILES/`, `RESOURCES/`를 사용한다. 삭제 목록과 원본 식별자는 메타데이터에 포함된다. v1 백업은 계속 읽을 수 있다. Phase 1 프로그램이 Phase 2 백업을 읽는 역방향 호환은 제공하지 않는다.

## 실제 테스트 결과

수정 전: 기존 단위 **27/27**, 기존 E2E **5/5** 통과.

최종: 단위 **54/54** (기존 27 + 신규 27), E2E **11/11** (기존 5 + Phase 2 기능 5 + 메모리 계측 1) 통과.

| 검증 | 자동 테스트 | 결과 |
|---|---|---|
| 빈 변경 ZIP이 파일 삭제로 오인되지 않음 | unit | 통과 |
| 실제 DOS S 저장 → D 삭제 → 종료 → 새로고침 → L 읽기 | 실제 Worker E2E | `NO SAVE FILE`, 삭제 유지 |
| 삭제된 경로가 여러 세션 뒤에도 유지됨 | unit + E2E | 통과 |
| 파일 재생성 시 삭제 표시 해제 | unit | 통과 |
| 원본 리소스 R 수정 → X 삭제 | 실제 Worker E2E | `RESOURCES/` 분리, resource tombstone 유지 |
| 원본/수정 파일은 실행 뷰에서만 제거 | unit | 원본 바이트 불변 |
| 실제 DOS 실행 뒤 원본 RESOURCE.DAT 재조회 | E2E IndexedDB 검사 | `BASE_RESOURCE` 유지 |
| 파일 삭제 후 같은 이름의 디렉터리/자식 저장 생성 | unit | 순서대로 적용, 원본 불변 |
| 삭제 전 외부 백업 가져오기 | 실제 Worker E2E | 저장 문자열 다시 읽음 |
| v2 리소스·삭제 목록 백업 왕복 | unit | 통과 |
| 바닐라·모드 A·모드 B 저장 격리와 모드 전환 | 실제 Worker E2E | A/바닐라 저장 유지, 새 B에는 없음 |
| 실제 IndexedDB v1 구조 업그레이드 | E2E | `LEGACY_SAVE` 읽음 |
| 실제 v1 형식 ZIP 가져오기 | unit + E2E | `OLD_BACKUP_RESTORED` 읽음 |
| 해시 불일치 시 연결 중단 | unit 트랜잭션 + E2E | 기존 원본/프로필 유지 |
| 저장 공간 부족 | unit + E2E의 estimate 모의 응답 | 명확한 안내, 기존 저장/프로필 유지 |
| tombstone 경로 탈출, 설정 경로, 파일/삭제 모순 | unit | 거절 |
| 브라우저 프로세스 재시작, 오프라인 | 기존 E2E | 계속 통과 |

공개 COM은 S=저장, L=읽기, D=세이브 삭제, R=리소스 수정, X=리소스 삭제, Q=종료를 제공한다. 소스 `scripts/test-program.mjs`, 라이선스 CC0-1.0. 테스트 본문은 `tests/phase2.test.ts`, `tests/e2e/phase2.spec.ts`에 있다.

재현:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

## 제한과 미검증

- 실제 ED4 저장 슬롯과 모드 전용 세이브의 내용·버전 호환성은 원본 파일 필요.
- 실제 저장 장치 고갈·브라우저 eviction·OS 강제 종료는 재현하지 않았다. quota 검사는 API 응답을 모의한 실패 경로 검사다.
- snapshot은 위 마운트 루트의 일반 파일만 대상으로 한다. 임의의 추가 DOS 마운트, 파일명 인코딩 변환, 특수 파일은 지원 범위 밖이다.
- 업스트림 `persist()`의 변경 감지는 그대로 사용한다. 열린 파일 버퍼, 특수 rename/타임스탬프 동작에 대한 완전한 파일시스템 검증이나 crash consistency 보증은 하지 않는다.
- 저장 쓰기가 실패하면 기존 레코드를 유지하고 종료를 완료하지 않는다. 사용자에게 성공하지 않은 저장을 성공으로 표시하지 않는다.
- tombstone 수집은 고정된 emulators 0.73.8 인터페이스에 의존한다. 엔진을 교체할 때 이 E2E를 다시 통과해야 한다.
