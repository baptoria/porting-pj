# Phase 9-8Q-HF1 — 자동 감지 실패 기록 및 DOS 진단 호환성

작성: 2026-11-11. 기준 HEAD `72dda9a`. Git Add/Commit/Push/원격 배포 없음. 개발 빌드만 갱신하며 공개 `docs/ed4/`는 보존한다.

## 판정과 증거 수준

**코드에서 재현한 감지/초기화 해석 문제와 NE 추적 오판을 수정했다. Galaxy에서 당시 어느 검사에 실패했는지는 아직 확정하지 못했다.** 최신 빌드나 기존 프로필 재사용 문제로 돌리지 않는다. 새 진단은 등록 판단, 실제 확정 결과, 실행 직전 환경을 같은 JSON에서 구분한다.

다운로드 폴더에서 실제 `ed4-diagnostics (1).json`과 `(2).json`을 확인했다. 요청에 적힌 정확한 `(2)(1).json` 파일명은 찾지 못했다. 발견한 `(2).json`은 같은 프로필/등록 시각의 실행 자료이며 사용자 관측과 일치한다. 발견하지 않은 원문을 재구성하지 않았다.

두 자료의 프런트엔드/SW는 `9-8q-dev-20261111003941758-69b3934f`로 일치한다. K 엔진, GAME.BAT, generic preset, 빈 prelude/prefix, RAW54 mounted/0 reads, Music System Installation Failed가 확인된다. ISO 음악 추출 성공과 실행 환경 감지 실패는 별개다. 당시 선택 범위의 autoexec.conf/Settings.conf 원문·인코딩·탈락 사유는 JSON에 없어 사후 확정할 수 없다.

Galaxy 등록 본체는189파일/9,868,854B, 이전 Q 로컬 성공 등록은193파일/10,157,329B다. 본체 manifest도 다르다. 이는 두 등록의 자료가 완전히 같다는 주장을 할 수 없다는 근거이며, 손상이나 실패 원인을 뜻하지 않는다. 해시로 실행을 막지 않는다.

## 1. 확인한 코드 문제와 수정

1. 기존 detectDookyFolder는 모든 조건 탈락과 catch를 undefined로 합쳤다. ISO 음악 연결은 독립 경로에서 성공할 수 있어, generic으로 확정된 이유가 사라졌다. 새 inspectDookyFolder는 단계별 true/false/null(미검사), 이유 코드, 제한된 인코딩·개수 정보를 반환한다. 기존 detector API는 호환 wrapper로 유지한다.
2. Settings.conf에는 BOM 해석이 있었지만 autoexec.conf는 dookyPrelude에서 Latin1/CRLF·LF만 해석했다. BOM UTF-16 실행 설정, CR 개행 설정은 동일 명령이어도 감지와 초기화가 누락됐다. 공개 기본 파서는 그대로 두고, 개발 등록에서 BOM이 명시된 UTF-16LE/BE/UTF-8 및 기존 ASCII 명령을 제한적으로 읽는다. 두 단계가 같은 startupCommands 검사를 사용한다. 명령 추가·변경·분기 불일치는 계속 거부한다.
3. 내부 루트 확인 버튼의 경로는 감지 결과를 prepare에 전달하지 않았다. 이제 사용자 선택 범위를 유지한 채 선택된 root에 대해 재검사하고 report/plan을 전달한다. 두 완전한 배포본이 있으면 기존 폴더 선택으로 구분하며 서로 합치지 않는다.
4. 감지 성공 이후 음악 저장/LOADER 적용 여부는 별도 조건이다. 실제 EFFECT 하위 RAW 입력과 저장된 음악 참조가 있어야 prefix/CD preset을 적용하고, 적용 실패 사유도 기록한다. 기존 musicMounts의 충돌·OPFS 접근 검사 후 기존 원자적 프로필 확정을 그대로 수행한다.
5. 파일 이름만 비슷하거나 설정/ISO가 없으면 강제 CD 구성하지 않는다. 내부 게임 폴더만 선택하면 상위 접근을 추측하지 않고 누락된 선택 범위를 안내한다. 기존 일반 실행은 유지한다.

**원문 BAT는 변환하지 않는다.** 추가 공개 실행 시험에서 bare-CR BAT를 현재 DOSBox가 여러 명령으로 처리하지 않고 붙여 읽는 것을 관측했다. 따라서 설정 파일의 CR 개행은 지원하지만 BAT의 bare-CR, BOM 인코딩은 자동 구성 대상으로 인정하지 않는다. 이 제한은 실패한 신규 시험을 계기로 추가했으며 성공한 것으로 숨기지 않았다. CRLF/LF BAT만 원문 그대로 추적·실행한다.

## 2. 진단 정보

기존 automaticBoot에 `decision`을 추가했다.

- `registration.decision`: detected, reason, checks(root/gameFiles/dosboxConfig/settings/batch/isoMusic), encodings, 알려진 필수 파일의 missing 목록, 선택 파일/루트/이미지 개수.
- `registration.decision.application`: applied, reason, musicPath, prelude, entry. 감지와 최종 환경 적용을 구분한다.
- `current`: 현재 실제 profile preset, GAME.BAT 여부, CD prelude, musicPrefix.
- `beforeLaunch`: 실행 직전 실제 musicMounts 목록의 ED4/EFFECT/RAW 존재 및 설정 검사. 실행 시각과 프로필에 연결한다.
- 기존 mounted log / RAW reads / 음악 초기화 실패 / 엔진 해시 / runtime errors는 계속 함께 제공한다. 정적 검사만으로 메뉴 도달·청감 성공을 표시하지 않는다.

실패 이유 예: `missing-or-ambiguous-packaged-startup`, `missing-or-ambiguous-packaged-settings`, `unsupported-packaged-startup`, `cd-declaration-not-unambiguous-enabled`, `unsupported-batch-flow-or-encoding`, `unreadable-or-invalid-isoMusic`, `iso-outside-selection-or-missing`, `configured-game-root-not-selected-or-missing`.

개발 전용 localStorage 키 `ed4-dev:ed4-dooky-registration-v1`에 최근8프로필의 제한된 메타데이터만 보관한다. DB/세이브 스키마를 바꾸지 않는다. 재접속 후에도 같은 프로필 판단을 조회하며 다른 프로필과 섞지 않는다. 저장 용량 오류는 진단 보관에만 영향을 주고 게임 등록을 취소하지 않는다. 기존/제외된 기록은 null로 표시하며 새로 판단했다고 가장하지 않는다. 등록 도중 진단 버튼도 현재 attempt를 내보낸다. 선택한 실제 폴더 이름, PC 절대 경로, 설정 원문, 게임 바이트·샘플은 새 메타데이터에 넣지 않는다.

## 3. PE/NE 판정

참조 바깥 ED4/DRIVER.EXE는 MZ 헤더와 0xF60 위치의 NE, NE target byte5를 가진다. DOS header512B, DOS 이미지 끝3933B, DOS 진입부가 이미지 안에 있다. 기존 inspectGame은 NE 두 글자만 보고 windowsExecutables 후보로 분류했고 bootPlan은 이를 절대 차단했다. 일반 실행은 이 휴리스틱으로 차단하지 않으므로 런타임 DRIVER 요청과 정적 오류가 공존했다.

[RBIL의 EXEC/MZ/NE 형식 표](https://fd.lod.bz/rbil/interrup/dos_kernel/214b.html)는 NE target5를 BOSS로 구분한다. 새 dosNeStub는 이름/순정 해시가 아니라 MZ 헤더·이미지 길이·진입 주소·재배치 테이블 경계와 NE target5를 함께 검사한다. 이는 DOS 로더 진입 가능성의 근거이며 DPMI 프로그램 초기화 성공 보장은 아니다.

**개발 임시 추적에서만** 이 근거가 있는 DOS MZ/NE5를 허용한다. Windows NE(target2/4), OS2, 불명 target, PE, 잘린/범위 오류 헤더는 기존 차단을 유지한다. 공개/기존 기본 bootPlan의 판정은 바꾸지 않았다. 진단 마커는 원문 명령 앞뒤에만 삽입한다.

새 CD preset도 추적할 수 있도록 정확한 `mount d . -t cdrom` 한 종류만 개발 추적에 허용했다. C 재매핑·다른 경로·추가 스위치·리다이렉션·복합 명령은 허용하지 않는다. 엔진의 native MSCDEX 동작이며 가짜 응답이 아니다.

## 4. 수정 파일

- src/dooky-auto.ts: 검사별 결과, 선택 root 재검사, 근거 없는 적용 방지.
- src/packaged-text.ts(신규):16KiB 제한과 BOM/명령 해석.
- src/dooky-diagnostics.ts(신규):개발 한정 등록 기록과 실행 직전 관측.
- src/simple-import-ui.ts:원래 선택 범위 유지, root 확인 경로 재검사, 개발 누락 안내/등록 JSON.
- src/folder-music-import.ts:공개 기본 파서는 보존, 개발 parser 일치 및 적용 조건/결과 기록.
- src/simple-registration.ts:기존 트랜잭션 성공 후 진단 메타데이터 기록. GAME.BAT 선택에만 CD preset 이름 확정.
- src/dos-ne.ts(신규), src/boot-trace.ts:제한된 DOS stub 판정과 개발 CD 추적.
- src/main.ts:개발 JSON 및 실행 직전 검사 연결. 엔진 실행/오디오/배속/저장 알고리즘 변경 없음.
- 관련 단위/브라우저 테스트, scripts/build-id.mjs 및 docs/ed4-dev 산출물.

## 5. 검증

|시험|결과|
|---|---|
|단위 테스트|38파일, 475통과 / 기존1제외. 실제 DRIVER 읽기 전용 헤더·BAT 분석 시험도 실행|
|Q/HF1 브라우저|10/10 통과: 실제 최상위 등록·오프라인 재실행, 합성 등록/저장/배속, CD3종, BOM 설정, 설정 누락, 내부 폴더, 실제 원본 임시 추적, 복수 설치본 root 확인|
|개발 실패 보호|1/1 통과: 음악 용량 부족 후 본체만 등록, false CD preset 방지, 기존 저장/프로필/RAW 보존, 96MiB 합성 ISO 처리 중 취소·임시 OPFS 정리|
|공개/개발 격리|1/1 통과: DB·OPFS·선호도·업데이트·오프라인 상호 보존|

실제 로컬 원본의 일반 실행·오프라인 재실행·임시 추적 모두 CD preset, `mount d . -t cdrom / LOADER.COM`, 음악 prefix ED4를 확인했다. 각 관측에서 RAW54 mounted /522회 읽기/755,718B, PCM361,443샘플, RuntimeError0이었다. 한글 최초 메뉴 화면을 직접 확인했다. 임시 추적은 DRIVER.EXE 진입을 마지막으로 기록했으며, 종료 후 saves store는0건이고 프로필은 실행 전과 동일했다. 실제 게임 저장 성공이나 청감·Galaxy 성공으로 확대 해석하지 않는다.

로컬 로그: `artifacts/phase9-8q-hf1/unit-final.log`, `browser-final.log`, `failure-protection-pass.log`, `isolation.log`. 실제 화면/JSON은 `verified-browser/` 및 요약 `actual-summary.json`. 상용 화면·실행 자료는 artifacts에만 있고 배포 소스에 포함하지 않는다.

신규 시험의 초기 실패도 보존했다. CR-only BAT의 실제 DOS 해석 실패는 자동 판정에서 제외했고, 후속 시험은 원문 CRLF BAT로 실행했다. 용량 부족 fixture는17KiB 음악에32KiB quota를 주면 실제로 성공하므로8KiB로 실제 부족을 유발했다. 취소 대기 문구도 공개 화면의 '보관' 대신 개발 화면의 실제 `BIG.RAW` 처리 표시를 사용했다. 기존 테스트 조건이나 저장 비교 검증을 삭제하지 않았다.

참조 원본467파일 SHA-256 변경0. 공개 산출물158파일 SHA-256 변경0. 엔진/Worker/Worklet/에뮬레이터 대응 소스124파일 바이트 일치. save-state.ts/storage.ts/model.ts/engine.ts/music.ts/app-storage.ts 변경 없음. 테스트는 별도 브라우저 데이터에서 실행했으며 사용자 Galaxy 저장소를 검사·수정한 것으로 주장하지 않는다.

상세 소스 diff: `artifacts/phase9-8q-hf1/source-changes.diff` (신규 소스 포함). 생성된 JS/소스 ZIP 등 개발 산출물 변경은 별도 `git diff --stat`로 확인할 수 있다. staged 파일 없음.

최종 개발 빌드: `9-8q-hf1-dev-20261111015415596-df3e5813`, `docs/ed4-dev/`. `npm run build:developer`/TypeScript 성공, manifest143자산·SW·Worker 무결성 및 GPL 대응 소스 검사 통과. 100MiB 초과 파일0, 금지된 게임 RAW/ISO/세이브 배포 파일0. `git diff --check` 통과. 공개 빌드는 재생성하지 않았다. 원격 배포나 Galaxy HF1 실행 확인은 수행하지 않았다.

## 6. 최소 PC/Galaxy 확인

1. 로컬 preview의 `/porting-pj/ed4-dev/`에서 HF1 빌드 ID를 확인한다. 배포는 수행하지 않았다.
2. 기존 정상 프로필을 삭제하지 않고 두기 최상위 폴더로 새 개발 테스트 프로필을 등록한다. 설정/본체/ISO가 함께 확인되면 별도 실행 환경 선택 없이 완료된다.
3. 일반 실행으로 메뉴와 음악을 확인한다. 실패해도 사이트 데이터를 지우지 말고 진단 JSON 하나를 저장한다. automaticBoot.decision의 registration/current/beforeLaunch가 서로 일치하는지 볼 수 있다.
4. 필요하면 임시 추적을 열고 GAME.BAT·K를 선택한다. 저장하지 않는 진단인지 확인한다. 일반 게임 저장과 임시 추적은 별개다.

내부 ED4 폴더만 선택해 외부 DosBox 설정/ISO에 접근할 수 없을 때는 CD 적용을 강제하지 않는다. 기존 자료 삭제 없이 상위 폴더의 **새 개발 테스트 등록**으로 비교할 수 있다. 기존 실패 프로필을 자동 덮어쓰거나 원본 파일을 교체하지 않는다.

## 7. 남은 문제

Galaxy 선택 범위의 설정 파일이 미확보이므로 이번 코드상 결함과 당시 실기 원인의 동일성은 미확정이다. 로컬 기존 Q 성공 자료가 그대로 HF1에서도 성공한 사실만으로 Galaxy 문제가 해결됐다고 선언하지 않는다. HF1에서 재발하면 구체적 검사 단계가 기록되어 추가 원인을 좁힐 수 있다.

전체 CD 이미지/섹터/CDDA 기능이 아닌 Q의 native directory CD와 지연 RAW 읽기를 재사용한다. 임시 진단의 실제 게임 필드/전투/청감과 Galaxy 재검증은 남는다. 엔진·PCM·AudioWorklet·속도·세이브·tombstone·DB/OPFS·공개 디자인은 수정하지 않았다.
