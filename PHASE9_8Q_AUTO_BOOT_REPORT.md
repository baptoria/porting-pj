# Phase 9-8Q — 두기 자동 등록과 CD 음악 실행 환경

작성: 2026-11-11. 기준은 현재 Phase 9-8P/O 소스다. Git Add/Commit/Push/원격 배포 없음. 지정 두기 폴더는 읽기 전용으로 사용했으며 실제 게임 실행은 별도 Playwright 브라우저의 복사된 데이터에서만 수행했다. 사용자 Chrome/Galaxy 저장소에는 접근하지 않았다.

## 판정

**개발 빌드 신규 등록에 자동 실행 환경을 구현했다.** 선택한 상위 폴더 안의 실행 설정·CD 선언·BAT/프로그램·ISO 구조가 함께 확인되면, 바깥 ED4 설치본과 음악을 자동 등록한다. 사용자가 배포본 종류, CD 문자, 실행 파일, 엔진을 고르지 않는다. 기존 일반 K 실행·저장·1×/2×를 그대로 사용한다.

지정 실제 설치본의 로컬 A/B에서 오류를 재현했다. **네이티브 CD와 올바른 CD 음악 경로를 함께 제공했을 때 한글 시작 메뉴, RAW 읽기, PCM 생성에 도달했다.** 이것은 합성 시험만으로 주장한 게임 성공이 아니다. 다만 실제 Galaxy의 해당 신규 등록, 청감, 필드/전투, 게임 내부 저장 수명주기는 여전히 확인 대상이다. 공개 산출물은 기존 P 버전을 유지하고 개발 산출물만 갱신한다.

## 1. 실제 자료와 실행 구조

지정 폴더와 `DosBox/CD/ED4.iso`는 존재한다. 로컬 `ed4-diagnostics(1).json` 원문은 발견하지 못했으며 사용자 제공 관측값을 근거로 삼았다. 이번에 만든 시험 JSON은 그 원문을 재구성한 것이 아니다.

|항목|바깥 ED4|안쪽 ED4/ED4|
|---|---:|---:|
|GAME.BAT|79B|84B|
|ED4.EXE|516B|516B|
|DRIVER.EXE|347,728B|16,556B|
|LOGO.EXE|42,491B|409,850B|
|SOUNDRV.COM|4,798B|4,704B|
|LOADER.COM|421B|421B|

동봉 autoexec.conf의 두 분기는 모두 `CD ED4 → LOADER.COM → GAME.BAT`다. 첫 분기는 ECE/DBECE.conf 선택 메타데이터를 포함한다. DBECE.conf는 PC 런처의 인덱스 설정이며 전체 DOSBox CONF로 간주하지 않았다. `CD.conf`는 숫자 0/1, **Settings.conf는 UTF-16LE BOM을 가진 파일이며 CD=1**을 선언한다. PC 런처가 최종 생성한 전체 mount 명령행은 이 폴더에서 확보하지 못했다. 따라서 원래 PC 드라이브 문자/세부 마운트 순서까지 직접 관측했다고 주장하지 않는다.

바깥 BAT 원문 흐름:

```
@ECHO OFF
LOGO.EXE
SOUNDRV.COM
DRIVER.EXE ED4.EXE
SOUNDRV.COM/U
@ECHO ON
```

안쪽은 별도 SOUNDRV/DRIVER 계열이며 NUL 리다이렉션이 있는 BAT다. 동봉 설정의 바깥 설치본과 자동으로 섞지 않는다. 이번 규칙은 실제 설정이 지목하는 바깥 설치본을 선택한다.

ISO는 기존 N 파서가 확인한 443,230,208B의 ISO9660 이미지다. 음악은 실제54개/433,081,400B이며 개수를 하드코딩하지 않는다. ISO의 ED4.EXE/DRIVER.EXE는 바깥 파일과 같고, GAME.BAT/LOGO.EXE는 다르다. SOUNDRV/LOADER는 해당 ISO 목록에 없다. 이는 동봉 설치본과 CD의 차이이며 **ISO로 게임을 복원하거나 서로 교체하지 않았다.** 지정 폴더 외에 새로 압축 해제한 원본 ZIP이나 Galaxy 파일 해시는 확보하지 못했으므로 모든 배포본의 동일성을 보증하지 않는다.

## 2. 실패 원인 — 실제 A/B

동일 바깥 본체, 동일 K WASM, 동일 LOADER/BAT/CPU/오디오 설정으로 순서대로 비교했다. 원본 게임 바이트는 변경하지 않았다.

|조건|관측|
|---|---|
|기존 N/P: CD 없음, EFFECT에 RAW|INT2F 1500 미처리 → Music System Installation Failed → SOUNDRV.COM/U Invalid command line, RAW읽기0|
|네이티브 D CD만 추가, 음악은 EFFECT 그대로|MSCDEX 1500 처리됨. 여전히 Music System Installation Failed, RAW읽기0|
|같은 D CD + 음악을 ED4/EFFECT로 노출|Now Loading → ED4.EXE 요청 → 한글 시작 메뉴. RAW154회/236,398B, PCM233,377 samples 관측(초기 비교 실행)|

정적 DRIVER 문자열에도 `%c:\ED4\EFFECT\%s`가 존재한다. 이 문자열만으로 실행 성공을 추정하지 않았으며 위 런타임 대조와 결합했다. 따라서 **이 로컬 설치본의 초기 실패에는 CD 인식과 CD 루트 기준 음악 경로라는 두 조건이 관여한다.** CD 연결 하나만으로 충분하다고 판단하지 않는다. 사용자 Galaxy 오류와 일치하는 실패 경로지만 JSON 원문/해시 부재 때문에 모든 실기 세부 상태가 동일했다고 단정하지 않는다.

SOUNDRV.COM/U의 오류는 실패 후 DRIVER가 반환한 다음의 정리 명령에서 발생했다. 선행 음악 설치 실패와 분리한다. 원문 붙은 인수와 BAT를 수정하거나 로그를 숨기지 않았다. 성공 경로에서 게임 종료 후 정리 명령의 결과는 별도 확인이 필요하다. LOADER는 기존 동봉 초기화 프로그램을 그대로 실행한다. 새 바이너리 패치나 고정 주소 훅을 추가하지 않았다.

## 3. CD 지원과 선택한 최소 구현

동일 K 엔진은 공개 COM 시험에서 `mount d . -t cdrom` 및 작은 합성 ISO의 `imgmount d C:\DISC.BIN -t iso`를 실제 실행한다. INT2F1500의 CD 수/첫 드라이브, 150B의 유효 드라이브 응답, D:\ED4\EFFECT 파일 읽기 및 쓰기 전용 열기 거부를 검사한다. MSCDEX 응답을 가짜로 반환하지 않는다.

고정 소스 근거: `native/dosbox/src/dos/dos_programs.cpp`의 MOUNT cdromDrive/IMGMOUNT isoDrive, `dos_mscdex.cpp`의 1500/150B, `drive_local.cpp`의 cdromDrive::FileOpen. 150B는 DOSBox에서 nonzero 0x5ad8이며 0xffff 보장이 아니다. CD read-write 열기는 read-only로 낮출 수 있으므로 시험은 write-only 거부를 검사한다. 초기 시험의 잘못된 반환값/열기 가정은 이 계약에 맞게 수정했다.

이번 자동 환경은 **디렉터리 CD**다. 443MB ISO 전체를 MEMFS에 넣거나 ISO 자체를 영속 저장하지 않는다. N의 부분 읽기/RAW 추출/OPFS 저장을 그대로 재사용하고, 그 음악 파일을 `ED4/EFFECT/...`에 지연 읽기 파일로 노출한다. 기존 C 본체 루트와 같은 가상 루트를 D에 읽기 전용 CD로 연결한다. C의 게임 본체는 기존 등록처럼 루트에 있고 원본 BAT도 그대로다.

```
mount c .
c:
mount d . -t cdrom
LOADER.COM
GAME.BAT
```

원본 CD 음악의 논리 경로 D:\ED4\EFFECT가 제공된다. C 루트의 게임 파일도 D에서 읽기 전용으로 보이지만 원본 ISO의 전체 파일/섹터와 동일한 이미지라고 주장하지 않는다. 실제 저장은 기존 C:와 기존 저장 계층을 사용한다. 음악은 OPFS에 한 벌만 저장되고 RAW 바이트/이름/재생 알고리즘은 그대로다.

디렉터리 CD의 하드웨어 기능 제한은 [공식 DOSBox 매뉴얼](https://www.dosbox.com/DOSBoxManual.html)에도 명시되어 있다. CDDA·섹터 직접 읽기·다른 ISO 데이터 의존 게임을 이 방식으로 지원했다고 할 수 없다. 네이티브 IMGMOUNT 지원은 확인했지만 **대용량 ISO 영속/지연 이미지 연결은 이번에 구현하지 않았다.** 현재 재현한 설치본은 이 제한된 파일 기반 환경에서 시작 메뉴까지 진행한다.

## 4. 자동 감지와 오판 방지

개발 빌드의 신규 vanilla/standalone 폴더 등록에만 적용한다. 패치 등록과 기존 저장된 프로필은 자동 수정하지 않는다.

함께 필요한 근거:

1. 선택 범위 안의 `DosBox/CD/ED4.iso` 및 그 설정 파일.
2. 모든 autoexec 분기가 동일한 `CD ED4 / LOADER.COM / GAME.BAT` 초기화.
3. 명시적 CD=1 선언. 실제 Settings.conf의 UTF-16 BOM을 처리한다. 비ASCII 파일 경로를 추측하여 변환하지 않는다.
4. 그 설정이 가리키는 GAME.BAT와 필요한 프로그램의 존재, 관측한 배치 실행 순서.
5. 기존 ISO 파서로 검증한 `ED4/EFFECT/*.RAW` 디렉터리 구조.

같은 조건을 만족하는 설치본이 둘이면 임의로 선택하지 않는다. 모르는 BAT/설정, 손상 ISO, 선택 범위 밖의 ISO는 기존 등록 방식으로 돌아간다. 감지 실패는 게임 실행 금지 판정이 아니다. 일반 설치본에는 불필요한 CD를 추가하지 않는다. 게임 바이너리 내용·크기·순정 해시·RAW54개 조건을 요구하지 않으며 수정 파일도 기존 정책대로 실행한다.

확인된 두기 상위 폴더에서는 기존 하위 폴더 확인 및 실행 파일 선택 단계를 생략한다. 모호한 자료에서는 기존 파일 범위 선택/수동 실행 후보 확인이 남을 수 있다. 새로운 환경 종류 선택 화면은 만들지 않았다. 기존 실패 프로필을 일괄 고치지 않으며 새 개발 프로필로 등록해 비교한다.

## 5. 코드 변경

- `src/dooky-auto.ts`: 제한된 증거 조합 감지 및 메타데이터만 담는 automaticBoot 진단.
- `src/simple-import-ui.ts`: 개발 신규 등록에서 자동 root 선택. 공개 빌드에서는 감지 경로를 호출하지 않는다. 취소 신호 유지.
- `src/folder-music-import.ts`: 실제 음악 저장이 성공한 신규 draft에만 CD prelude/음악 prefix 지정. 음악이 없으면 적용 실패 이유를 남기고 본체 등록은 유지.
- `src/simple-registration.ts`: 기존 profile.settings.prelude/music.prefix/launch.presetId/initialization 필드로 확정. 새 DB 스키마/세이브 형식 없음. 기존 음악 충돌 검사와 원자적 profile 확정/실패 rollback 재사용.
- `src/main.ts`: 개발 JSON에 automaticBoot 추가. 선택된 진단 세션의 엔진·실행 단계·기존 RAW 통계를 재사용. 메뉴 도달/청감은 미관측 표시, 오류가 안 보인다는 이유만으로 성공 판정하지 않음.
- 테스트/CC0 CD probe/개발 빌드 식별자와 개발 산출물. WASM, 공용 Worker, AudioWorklet, 저장 구현은 변경하지 않음.

## 6. 검증 결과

|시험|결과|
|---|---|
|전체 단위 테스트|36개 파일, 462 통과 / 기존 1 제외|
|Q 브라우저 시험|5/5 통과: 실제 폴더 자동 실행, 합성 자동 등록/저장/배속/오프라인, 네이티브 CD 없음/디렉터리/ISO|
|기존 O 일반 저장·오디오 회귀|8/8 통과: 9-7/K 오디오, 2× 저장/삭제/백업/복구, 체크포인트, 실패 시 이전 저장 유지|
|기존 N ISO 등록 회귀|5 통과 / 실제 자료 전용 기존 1 제외. 이번 실제 자료 시험은 Q에서 별도로 수행|
|P 공개/개발 격리|1/1 통과: 같은 origin의 DB·RAW·세이브·선호도·업데이트·오프라인 상호 보존|
|기존 개발 메뉴/LOAD 진단|1/1 통과: 실제 K 이벤트 내보내기 및 이후 입력 유지|
|최종 개발 산출물 재검증|Q 합성 자동 등록/저장/배속/오프라인 및 CD 3종 4/4 재통과|

기존 O의 2× 체크포인트 시험은 27.785초 동안 약1999.82 guest tick/s를 기록했다. 공개 합성 프로그램의 회귀 수치이며 실제 ED4 플레이 속도 측정으로 해석하지 않는다. ISO 오류·잘못된 헤더·용량 부족·등록 취소 시 이전 프로필/RAW/저장이 유지되는 기존 N 시험도 통과했다. 새 코드에서 기존 save-state/storage/model/engine/음악 저장/앱 네임스페이스 구현은 수정하지 않았다.

**실제 원본 자동 등록 결과**: 상위 폴더를 한 번 선택한 후 설치본/실행 파일/환경 선택 없이 일반 K 실행했다. 첫 실행은 RAW526회/761,362B, PCM361,443샘플, 화면315회, RuntimeError0. 초기 PCM peak는 약0.338로 영점 출력만 생성된 것은 아니다. 네트워크를 끊고 페이지를 다시 연 뒤에도 RAW518회/750,074B, PCM360,914샘플, 화면314회, RuntimeError0이었다. 두 화면 캡처에서 한글 최초 메뉴를 직접 확인했다. 청감, 실제 게임 내부 SAVE 및 필드/전투는 이 시험에서 검증하지 않았다.

증거는 로컬 `artifacts/phase9-8q/`에 있다. `browser-verified.log`, `unit-final.log`, `save-speed-regression.log`, `iso-regression.log`, `split-regression.log`, `verified-summary.json` 및 `browser/actual-actual-folder-autom-db342-me-with-native-directory-CD/first.png`, `offline-restart.png`를 보존했다. 원본 비교 A/B는 `research-ab/`에 별도 보존했다. 상용 게임 화면과 실행 JSON은 배포용 소스 ZIP에 포함하지 않는다.

참조 원본 전체467파일의 전후 SHA-256 비교에서 변경0. 공개 `docs/ed4/` 전체158파일의 SHA-256 변화0. 공개와 새 개발 산출물의 엔진·Worker·Worklet·에뮬레이터 GPL 소스 등124파일도 바이트 일치했다. 사용자 Galaxy/기존 브라우저 저장소를 직접 검사했다는 뜻은 아니며, 자동 시험은 격리된 새 브라우저 저장 공간에서 수행했다.

`npm run build:developer` 성공(TypeScript 포함). 최종 개발 빌드 ID는 `9-8q-dev-20261111003941758-69b3934f`, 경로는 `docs/ed4-dev/`다. HTML/자산143개와 SW/manifest/Worker 해시, GPL 대응 소스를 검사했다. 100MiB 초과 파일0, 금지된 게임 RAW/ISO/세이브 배포 파일0, Git 바이트 정규화 불일치0. `git diff --check` 통과, staged 파일0. 공개 빌드는 실행하지 않았고 공개 출력도 변경하지 않았다. 기존 바이너리 및 실행 알고리즘은 동일하며 개발 런처 등록 환경만 달라진다. 원격 Pages 접속/배포 검증 결과로 해석하지 않는다.

## 7. 최소 확인 절차

PC: `npm run preview`로 로컬 `/porting-pj/ed4-dev/`에 접속한다. 게임 폴더 선택에서 지정 두기 최상위 폴더를 선택하고 등록 완료 후 모험 시작을 누른다. 환경 선택 없이 메뉴와 음악이 진행되는지 확인한다.

Galaxy: 사용자가 개발 산출물을 직접 배포한 후 `/porting-pj/ed4-dev/`에서 새 개발 프로필로 압축 해제한 두기 상위 폴더를 한 번 선택한다. 기존 정상 공개 게임/세이브를 삭제하거나 재등록할 필요가 없다. 메뉴 음악 → LOAD/새 게임 → 필드/전투 → 게임 내부 저장과 정상 종료 → 재접속을 확인한다. 2×는 기존 버튼을 사용하며 시작은1×다. 실패 시 기존 장면 진단/JSON을 한 번 내려받으면 automaticBoot, MSCDEX 로그, RAW읽기, 실제 엔진 해시가 함께 나온다.

## 8. 남은 한계

Galaxy 실제 두기 실행·청감·장시간 필드/전투·실제 게임 저장/불러오기는 이번 PC 합성 저장 시험과 같다고 주장하지 않는다. 완전한 CD 이미지 마운트나 알려지지 않은 ISO 데이터 의존성은 미지원이다. 디렉터리 CD로도 실패하면 실제 실패 지점 자료가 필요하며 자동 파일 교체/다른 설치본 혼합은 하지 않는다. 기존 엄격한 임시 BAT 마커 분석은 mount/NE 경로에서 제한될 수 있으며, 이번 검증은 **일반 K 실행의 기존 JSON/장면 진단**으로 수행한다. 이를 위해 위험한 BAT 문법 차단을 완화하지 않았다.
