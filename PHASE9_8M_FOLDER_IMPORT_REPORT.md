# Phase 9-8M 추가 변경 — 게임 등록 방식 단일화

작성일: 2026-11-10. 기존 Phase 9-8M 작업 위에서 일반 등록만 폴더 방식으로 정리했다. 원격 접속·배포, Git Commit/Push, 상용 게임 실행은 하지 않았다.

## 구현

- 일반 빌드의 원본/전체 수정 게임 등록 및 모드 관리 등록 화면은 **게임 폴더 선택**만 제공한다. ZIP 입력 요소와 해당 등록 이벤트를 일반 빌드에서 생성하지 않는다. CSS로 숨긴 방식이 아니다.
- 첫 안내는 **“압축파일을 먼저 해제해주세요.”**다. 폴더 선택 → 파일 검사 → 등록 완료 흐름, 기존 M의 디자인과 공개/개발 기능 구분을 유지한다.
- 폴더를 선택하면 파일 내용이 아닌 상대 경로 메타데이터로 BAT/EXE/COM을 탐색한다. 하나의 GAME.BAT 폴더가 있으면 우선 제안한다. GAME.BAT가 없는 수정본도 실행 파일 후보를 찾는다. 특정 해시·용량·게임 버전으로 허용 여부를 결정하지 않는다.
- 두기 배포본처럼 여러 겹의 상위 포장 폴더를 선택한 경우, 등록할 하위 게임 폴더와 포함/제외 파일 수를 먼저 확인한다. 여러 설치본을 자동으로 섞지 않는다. 필요하면 선택한 폴더 전체를 유지할 수도 있다.
- 선택한 하위 폴더를 새 등록의 루트로 삼되, 그 안의 파일 이름·대소문자·상대 경로·Blob은 그대로 기존 순차 Worker 등록에 전달한다. 한글 포장 폴더는 선택 범위 밖으로 제외할 수 있으나, 게임 내부 한글/비ASCII 경로를 임의 변환하지 않는다. DOS 경로 및 실행 파일 검사는 기존 정책을 적용한다.
- 수정 파일만 있는 패치 폴더에는 실행 파일을 요구하지 않으며 SAVE/EFFECT 등의 하위 경로를 자동으로 잘라내지 않는다. 기존 원본 공유·모드별 저장 구조를 사용한다.
- `ED4.iso`는 읽기/압축 해제/마운트/음악 추출을 하지 않는다. 발견 시 제외 사실과 후속 9-8N 예정임을 확인 화면에 표시한다. 이는 새 등록에 포함하지 않는다는 뜻이며 사용자의 ISO를 삭제하거나 바꾸는 작업이 아니다. ISO만 있는 배포본은 이번 등록으로 실행할 수 없다.
- 선택한 게임 폴더 밖의 RAW를 임의로 합치지 않는다. 따로 있는 음악은 기존 음악 연결에서 추가할 수 있다고 안내한다. 선택 범위 안의 RAW는 기존 OPFS 등록·재생 경로로 처리한다.
- 탐색 중 취소는 DB/OPFS 쓰기 전 종료한다. 본 등록 이후 취소·공간 부족·확정 실패는 기존 정리/롤백 처리를 사용한다.

## ZIP 코드를 유지한 이유

일반 신규 등록에서만 ZIP 입력을 제거했다. 아래 기존 사용처 때문에 fflate, ZIP Worker, ZIP 등록/읽기 공용 코드는 삭제하지 않았다.

|사용처|유지 사유|
|---|---|
|`src/backup.ts`|세이브·복구 체크포인트 ZIP 백업과 가져오기|
|`src/engine.ts`, `src/archive.ts`|DOS 실행 번들 생성과 엔진 저장 ZIP 읽기|
|`src/source-import.ts`, `src/source-worker.ts`|기존 음악 ZIP, 수정 ZIP 및 등록 공용 처리|
|기존 프로필 재연결·수정 파일 추가|이미 제공하던 관리/복구 기능 보존|
|개발 빌드 등록|기존 ZIP 오류·CRC·대용량 회귀 시험 및 조사 경로 보존|

일반 공개 등록에 ZIP UI를 동적으로 덧붙여도 핸들러가 연결되지 않는다. 기존 백업/복구용 ZIP 선택 UI는 유지한다. 분할 7z/ISO 자동 등록을 지원한다고 안내하지 않는다.

## 보안·용량·데이터 보존

상위 폴더를 제거하기 **전** 절대/드라이브 경로, 역슬래시, `..`, `.`, 빈 구간, 제어 문자, 서로 다른 루트 선택을 거부한다. 실제 등록 범위에는 기존 경로 중복·충돌, DOS 이름, 파일 수/크기, 공간 부족, 명령 주입 검사를 그대로 적용한다. 경로 변경으로 보안 검사를 우회하지 않는다.

선택 파일 12,000개, 메타데이터 경로 4,096자/64단계 및 실행 파일 폴더 후보 100개 상한을 둔다. 초과하면 더 좁은 게임 폴더를 선택하도록 안내한다. 전체 파일을 한 번에 읽거나 복사하지 않는다. 500MB 실기 등록 성공을 새로 주장하지 않는다.

기존 프로필·게임/모드 바이트·세이브·tombstone·복구·IndexedDB 스키마·OPFS·사용자 조작 설정·오디오·엔진은 변경하지 않았다. 보존 검사는 이번 추가 작업 시작 시 SHA 스냅샷과 비교한다. 실제 사용자 브라우저 데이터에 접근하지 않고 격리된 Chrome의 합성 자료로 회귀를 검증한다.

## Android Chrome 폴더 선택

[MDN browser-compat-data의 HTMLInputElement.webkitdirectory 자료](https://github.com/mdn/browser-compat-data/blob/main/api/HTMLInputElement.json)에 따르면 Android Chrome은 132부터 지원한다. 이전 버전의 속성 존재만으로 실제 폴더 선택을 보장할 수 없다는 기록이 있다. [webkitdirectory/상대 경로 문서](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory)도 확인했다.

- `webkitdirectory` 기능 감지와 알려진 구형 Android Chrome(<132) 검사를 함께 한다. 다른 브랜드 브라우저를 Chrome 버전만으로 차단하지 않는다.
- 기능 미지원이면 폴더 입력을 비활성화하고 최신 Chrome 사용을 안내한다. 이미 등록한 게임 실행은 막지 않는다.
- 파일 선택 결과에 유효한 `webkitRelativePath`가 없으면 등록하지 않고 명확한 폴더 선택 미지원 안내를 표시한다. 개별 파일을 폴더처럼 재포장하지 않는다.
- 취소/파일 선택창에서 폴더가 보이지 않는 상황을 데이터 손상으로 판정하지 않는다. OS 파일 제공자와 권한에 따라 선택 가능 위치가 다를 수 있다.
- **이번 환경은 Windows Chrome이다. ADB 도구/연결 Android 기기를 사용할 수 없어 Android 시스템 파일 선택창 자체를 새로 실기 검증하지 못했다.** 모바일 화면·터치 에뮬레이션과 실제 폴더 FileList 자동 시험을 Galaxy 시험으로 표시하지 않는다. 사용자 과거 폴더 등록 성공 보고와도 구분한다.

## 자동 검증

최종 공개 빌드: `9-8m-public-20261110101213825-7eaf1606`, revision `phase9-8m-folder-2`, audience `public`. 로컬 `docs/ed4/`에 준비했다. `/porting-pj/ed4/` 경로를 유지한다. 원격 배포 성공을 의미하지 않는다.

|검증|결과|
|---|---|
|단위 테스트|**407/407 통과** — 기존 389개 유지, 폴더 탐색·보안·미지원 환경 18개 추가|
|기존 Chrome E2E, 개발 빌드|**38/38 통과** — ZIP/폴더 등록, 500MiB 합성 ZIP, 모드, 저장/복구, 진단 포함|
|Phase 9-8J 기존 저장·복구|**5/5 통과**|
|Phase 9-7 일반/진단 경로|**2/2 통과**|
|M 일반 빌드 + 폴더 전용/하위 폴더/미지원 환경/5개 화면|**13/13 통과**|
|M 일반 빌드 업데이트/데이터·RAW·저장 보존|**1/1 통과**|
|Pages 하위 경로·전체 파일·DOS·오프라인|**2/2 통과**|
|TypeScript, 공개/개발 production build|통과|
|최종 배포 manifest/Worker/WASM 검사|143개 파일 검증 통과; 금지 파일·100MiB 초과 0|

이번 추가 작업에서 브라우저 시나리오 **61개**가 통과했다. 공개 시험 프로그램/합성 RAW를 사용했다. 일반 빌드의 파일 선택 픽스처만 ZIP에서 실제 디렉터리로 전환했고, 기존 DOS 실행·키보드·세이브/복구·OPFS·업데이트·오프라인 판정은 유지했다. 개발 빌드에서는 원래 ZIP 등록 회귀 시험을 그대로 실행했다.

하위 폴더 등록에서는 확인 전 프로필이 생성되지 않음, 취소 시 기존 자료 불변, 다른 설치본 자동 병합 방지, ISO 제외, RAW 연결, 실제 공개 DOS 실행 및 재접속을 확인했다. 5개 화면 크기에서 확인 버튼의 화면 내 위치와 클릭 가능성을 검사했다. 좁은 가로 화면의 긴 확인 내용은 대화상자 내부에서 스크롤된다.

추가 작업 시작의 기존 파일 514개 중 허용한 UI/빌드/시험/런처 소스 ZIP 9개만 변경, 505개 동일, 누락·예상 외 변경 0. `artifacts/phase9-8m-folder/preservation.json`에 기록했다. 모든 기존 Native WASM/Worker/Worklet, 엔진 GPL 소스 ZIP, 저장·복구·RAW 코드와 SW 데이터 보존 정책은 동일하다. 따라서 K 장시간 성능 시험을 이번 폴더 UI 변경 때문에 다시 돌리지는 않았다. 앞선 M의 K 회귀 결과와 이번 바이너리 불변 검사를 구분한다.

로그: `artifacts/phase9-8m-folder/`의 `developer-base.log`, `developer-save.log`, `developer-engine.log`, `public.log`, `update.log`, `pages.log`, `build-public.log`, `build-developer.log`. 런처 대응 소스 ZIP도 갱신했고 기존 GPL 고지를 유지한다.

## 화면 캡처

추가 변경 직전 M 화면을 `artifacts/phase9-8m-folder/before/`에 보존했다. After는 832×384, 844×390, 1280×720, 1440×1000, 390×844에서 등록 전/후·모드·설정·플레이·메뉴·조작 화면과 하위 폴더 확인 화면을 저장한다.

- [Before 844 등록](artifacts/phase9-8m-folder/before/844-import.png)
- [After 844 등록](artifacts/phase9-8m-folder/after/844-import.png)
- [After 832 등록](artifacts/phase9-8m-folder/after/832-import.png)
- [After 세로 등록](artifacts/phase9-8m-folder/after/390-import.png)
- [After 844 하위 폴더 선택](artifacts/phase9-8m-folder/after/844-folder-choice.png)
- [After PC 하위 폴더 선택](artifacts/phase9-8m-folder/after/nested-folder.png)

## 이번 추가 변경 파일

- `src/folder-registration.ts`: 메타데이터 탐색, 폴더 선택 가능성/입력 검사, 등록 범위 구성.
- `src/simple-import-ui.ts`: 일반 폴더 전용 등록, 하위 폴더 확인, 기존 prepare/commit 함수 연결.
- `src/import-messages.ts`: 자체 작성한 폴더 오류만 안전한 사용자 문구로 전달.
- `src/public-launcher.css`: 한 개 폴더 버튼과 범위 확인 영역.
- `scripts/build-id.mjs`, `src/build-info.json`: `phase9-8m-folder-2` 식별.
- `tests/folder-registration.test.ts`, `tests/folder-fixture.ts`: 탐색/보안/실제 디렉터리 시험 도우미.
- `tests/phase9-8m/public.spec.ts`, `tests/phase9-8m-update/update.spec.ts`, `tests/pages/deployment.spec.ts`: 일반 ZIP 등록 픽스처를 폴더로 대체하고 검증 추가. 저장/업데이트/오프라인 검증 조건은 유지.
- 두 M 보고서, `public/sources/ed4-mobile-source.zip`, 생성된 `docs/ed4/`.

기존 M의 `main.ts`, 엔진 시작 권한 검사 등은 앞선 M 작업의 변경이다. 이번 추가 작업에서 엔진/저장 코드를 더 수정하지 않았다.

## Galaxy 최소 확인

1. 새 일반 빌드를 사용하되 기존 등록 게임은 재등록하지 말고 바로 시작하여 확인한다.
2. 새로 등록할 때만 최신 Android Chrome에서 **원본 게임 등록 → 게임 폴더 선택**을 누른다. 압축파일은 먼저 외부에서 해제한다.
3. 게임 폴더 또는 두기 배포본 상위 폴더를 선택한다. 하위 폴더 확인이 나타나면 실제 게임 파일 범위를 확인한다. ISO 내부 음악은 이번 단계에서 연결되지 않는다.
4. 등록 후 모험 시작, 종료 후 다시 접속하여 프로필과 음악 연결이 유지되는지 확인한다. 기존 데이터 삭제/초기화는 필요하지 않다.

미확인: Galaxy 시스템 폴더 선택창/권한별 실제 동작, 실제 두기 배포본의 모든 디렉터리 구성, ISO 내부 음악, 이번 변경에서의 대용량 실기 재시험. 실행 초기화에 상위/형제 폴더 파일이 필요한 설치본은 자동 결합하지 않으며 실행 파일 선택/기존 진단으로 별도 확인해야 한다.
