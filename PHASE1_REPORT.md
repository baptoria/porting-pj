# ED4 Mobile — Phase 1 결과 보고서

작성일: 2026-11-08 (Asia/Seoul)

## 결과 요약

`D:\porting\ed4-mobile`에 독립적인 TypeScript 웹 프로젝트와 정적 실행 결과물 `dist/`를 생성했다. 기존 프로젝트를 수정하지 않았다. 실제 DOS WebAssembly 엔진으로 공개 테스트 프로그램을 실행하여 입력, 파일 저장, 외부 백업, 재실행, 브라우저 프로세스 재시작, 데이터 삭제 후 백업 복구, 오프라인 실행을 확인했다.

**구영웅전설4 원본 파일이 없으므로 실제 ED4 실행 성공, 한글 정상 출력, 배경 음악·효과음 정상, ED4 저장 슬롯 호환성을 주장하지 않는다.** 현재 기본 DOSBox 값과 Enter/Esc/Space 매핑은 검증 전의 임시값이다.

공개 원격 호스팅, GitHub 저장소 생성·업로드, Android 실기기 설치는 수행하지 않았다. 현재 결과물은 로컬에서 실행하고 HTTPS 정적 호스팅에 올릴 수 있는 웹 프로젝트다.

## 1. 기술 선택과 라이선스

| 비교 항목 | v7 계열 | v8 계열 | Phase 1 판단 |
|---|---|---|---|
| 조사 대상 | js-dos 7.5.0 / 그 계열 backend emulators 0.73.8 | 조사 시 npm latest js-dos 8.5.3 / emulators 8.5.2 | backend 0.73.8 고정 |
| 모바일 | 공식 v7 문서에 모바일 조작 레이어와 생산용 모바일 지원이 명시됨 | 최신 API에 가상 키보드, soft fullscreen, OffscreenCanvas 등이 있음. 과거 비교 페이지의 제한과 최신 API 내용을 구분해야 함 | v8이 모바일에서 작동하지 않는다고 단정하지 않음 |
| 저장 | `persist()`로 파일 변경 ZIP 제공 | OPFS/local 저장과 `fsChanges` hook, DOSBox-X 옵션 제공 | 애플리케이션 IndexedDB로 직접 격리 |
| UI 통합 | 맞춤 플레이어에는 emulators 패키지 사용 권장 | player 옵션/API 범위가 넓음 | v7 backend + 자체 한국어 Canvas/오디오/입력 UI |
| 라이선스 | npm 선언 GPL-2.0 | npm 선언 GPL-2.0 | 런처 GPL-2.0-only, 전문과 대응 소스 제공 |
| 검증 범위 | 본 프로젝트의 실제 Chrome DOS 테스트 수행 | 문서·메타데이터 조사 | 동일 Android 장치 v7/v8 A/B 성능 비교는 미수행 |

v7 선택은 모바일 우선의 초기 구현 선택이다. 실기기 장시간 검증 결과 없이 v7이 v8보다 빠르거나 안정적이라고 수치로 주장하지 않는다. v7 player UI를 그대로 임베드한 것이 아니라, 공식 권장에 따라 js-dos v7의 `emulators` backend를 이용해 독립 실행기를 만들었다. 별도 계정, 클라우드 세이브, js-dos 유료 서비스에 의존하지 않는다.

조사 근거:

- [js-dos v7 안내](https://js-dos.com/v7.html) — 2024년 비교 글의 시점을 구분하여 참고.
- [v7 플레이어/맞춤 UI 안내](https://js-dos.com/v7/build/docs/jsdos-overview/), [모바일 조작 문서](https://js-dos.com/v7/build/docs/mobile-support/).
- [v8 최신 Player API](https://js-dos.com/player-api.html) — 현재 모바일/저장 옵션 확인.
- [v7 CommandInterface](https://js-dos.com/v7/build/docs/command-interface/), [v7 Save/Load](https://js-dos.com/v7/build/docs/save-load/).
- npm 공식 레지스트리 `npm view js-dos@latest`, `npm view emulators@latest`, 고정 v7 버전 metadata 직접 조회.

정확한 runtime 소스 커밋은 `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5`다. WASM/JS 바이너리는 수정하지 않았다. 고정 커밋의 backend 소스와 native 하위 모듈, 빌드 스크립트를 `public/sources/emulators-0.73.8-source.zip`에 제공한다. 상용 테스트 게임 ZIP 및 선택적 네이티브 벤치마크 바이너리는 제외했다. 런처 소스 ZIP도 빌드 시 생성한다. 실제 upstream 소스 재컴파일은 이번 Windows 작업에서 수행하지 않았다. 상세 배포 구성은 `THIRD_PARTY_NOTICES.md`에 기록했다.

## 2. 실제 구현된 기능

| 영역 | 구현 내용 | 주요 파일 |
|---|---|---|
| 웹 실행기 | 한국어 UI, 프로필 목록, 실행/일시정지/종료, 실행 기록, 전체 화면 | `src/main.ts`, `src/style.css` |
| DOS 실행 | Worker 기반 WASM, Canvas 프레임, Web Audio stereo 출력, 키 이벤트 | `src/engine.ts` |
| ZIP 등록 | Worker 검사, 실행 파일 후보 선택, 크기·항목 제한, 경로 오류/중복/파일-폴더 충돌 거부 | `src/archive.ts`, `src/importer.ts` |
| 자동 설정 | 선택한 DOS 실행 파일의 작업 폴더 설정, mount, CPU/memory/sound 설정 생성, 사용자 초기화 명령 | `src/archive.ts` |
| 모드 A | 원본을 공유하는 독립 프로필, 수정 ZIP 레이어와 덮어쓰기 확인 | `src/model.ts`, `src/main.ts` |
| 모드 B | 전체 수정 게임 ZIP을 독립 원본과 프로필로 등록 | `src/main.ts` |
| 모드 관리 | 추가·전환·프로필 삭제, 레이어 추가/제거/순서 조정, 설정 분리 | `src/main.ts` |
| 저장 분리 | UUID 프로필 키의 IndexedDB 저장, 원본 데이터와 저장 변경분 분리 | `src/storage.ts` |
| 백업/복구 | 프로필 메타데이터+파일 변경분 ZIP, 동일 ID 복원, 새 브라우저에서 프로필 복구와 원본 다시 연결 | `src/backup.ts` |
| 삭제 구분 | 게임 데이터만 삭제, 세이브만 삭제, 프로필 삭제, 남은 저장의 별도 백업/삭제 | `src/storage.ts` |
| 모바일 입력 | 방향키·확인/취소/메뉴, 영문 가상 키보드, 크기·간격·입력키 조정, pointer capture/cancel 및 blur 시 해제 | `src/controls.ts` |
| PWA | manifest, 192/512 PNG 아이콘, 설치 안내, 캐시 완료 표시, WASM을 포함한 오프라인 캐시 | `public/manifest.webmanifest`, `scripts/sw.mjs` |
| 저장 보호 | 30초 주기·visibilitychange 저장 시도, 저장 후 종료, 다중 탭 쓰기 잠금, quota 오류 안내, 영구 저장 요청 | `src/main.ts` |
| 확장 구조 | 게임 ID, 엔진 ID, 엔진 인터페이스와 프로필 데이터 분리 | `src/model.ts`, `src/engine.ts` |

저장 구현은 **파일 변경분 누적**이며 에뮬레이터 전체 상태의 순간 저장이 아니다. 적용 순서는 원본 → 수정 레이어 → 프로필 저장 변경분이다. 원본은 수정하지 않고 실행용 ZIP을 별도로 만든다. 동일한 원본을 쓰는 바닐라와 모드도 저장 ID는 다르다.

## 3. 실제 검증 결과

환경: Windows, Node.js 24.16.0, 시스템 Chrome 157.0.8103.38 headless, Vite production build + localhost HTTP. 새 브라우저 다운로드나 시스템 설정 변경 없이 설치된 Chrome을 사용했다.

| 검사 | 결과 | 확인 범위 |
|---|---|---|
| TypeScript / production build | 통과 | 타입 검사, 번들 생성, 런타임·소스·라이선스 복사, 캐시 생성 |
| Vitest | **27/27 통과** | 경로 탈출, DOS 예약명, 비 ASCII, 대소문자 중복, 파일/폴더 충돌, 압축 해제 크기 제한, 레이어 우선순위/원본 보존, 저장 격리, 독립 삭제, 백업 왕복/격리/프로필 복구, 빈 엔진 변경분 처리 |
| Chrome E2E | **5/5 통과** | 아래 시나리오 전체 |
| npm audit | **0건** | runtime + 개발 의존성 전체, 조회 시점 기준 |

E2E 시나리오:

1. 실제 DOS Worker 실행 → ArrowUp 입력 → `KEY RECEIVED` → S → `SAVE WRITTEN` → 비영(非零) 오디오 샘플과 실행 중 AudioContext 확인 → 백업 ZIP의 `TEST.SAV` 바이트 검증 → 재실행 L → 저장 문자열 복원 → 동일 프로그램의 새 프로필에서 `NO SAVE FILE` → 네트워크 차단·새로고침 후 DOS 재실행/저장.
2. 실제 Chrome 프로세스 종료 → 동일 임시 브라우저 프로필로 새 프로세스 실행 → 저장 읽기 → UI에서 프로필/게임 데이터/저장을 각각 삭제 → 외부 백업으로 프로필 복구 → 공개 원본 ZIP 다시 연결 → 재실행/읽기.
3. 390×844 세로 화면의 가로 넘침 검사, 잘못된 `../BAD.COM` 경로의 ZIP 등록 거절.
4. 사용자 ZIP 업로드 → 바닐라 등록 → 모드 A의 덮어쓰기 경로 확인 → 844×390 가로 화면 터치 방향키·가상 키보드 S → 저장 → 모드 B 등록.
5. 동일 origin의 두 번째 탭에서 쓰기 작업 차단.

PC speaker 비프에 해당하는 비영 오디오 데이터와 Web Audio 실행 상태를 확인했지만, 이는 사람의 실제 스피커 청취 검사나 ED4의 OPL 음악·Sound Blaster 효과음 검증이 아니다. 모바일 크기 테스트는 데스크톱 Chrome의 viewport/포인터 기반 검사이며 Android 장치 검사가 아니다.

재현 명령:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit
```

테스트 코드는 `tests/core.test.ts`, `tests/e2e/launcher.spec.ts`, 브라우저 결과는 `playwright-report/index.html`과 `test-results/.last-run.json`에 있다. 화면 증거는 `artifacts/desktop-dos.png`, `artifacts/mobile-landscape.png`, `artifacts/mobile-portrait.png`에 보관한다.

실제 검증 중 발견하여 수정한 문제:

- BIOS 입력 대기 상태에서 v7 종료 acknowledgement가 지연됨: 직접 소유한 Worker transport와 저장 완료 후 제한 시간 정리로 처리.
- 변경이 없는 재실행 세션의 ZIP에는 빈 변경분/디렉터리만 포함될 수 있음: 일반 게임 ZIP의 빈 파일 검사는 유지하고 엔진 변경분은 허용.
- 숨긴 파일 input이 CSS에 의해 노출됨: 모든 `[hidden]`에 대한 표시 규칙 정리.
- 공개 COM fixture의 저장 길이 오차: 실제 문자열 바이트 길이를 계산하도록 수정.
- fflate 0.8.2의 malformed ZIP64 무한 루프 권고: 0.8.3으로 고정. 개발 도구도 감사 결과에 따라 Vite 7.3.7, Vitest 5.1.0으로 업데이트 후 재검증.

## 4. 미검증 / 현재 제한

| 항목 | 상태 |
|---|---|
| 구영웅전설4 실행, 한글, 음악, 효과음, 실제 입력키 | **게임 원본 필요** |
| 구영웅전설4 저장 슬롯 형식과 게임 진행 복원 | **게임 원본 필요** |
| 실제 ED4 수정 모드의 호환성 | **원본 및 합법적인 수정 파일 필요** |
| 실제 Android Chrome / Samsung Internet 장시간 성능, 발열, 배터리 | 미검증 |
| Android 홈 화면 설치와 비행기 모드 재실행 | 미검증; HTTPS 실기기 테스트 필요 |
| 전체 화면 API / 화면 회전의 기기별 동작 | 코드 구현, 실기기 미검증 |
| 사람이 실제 음악·효과음을 듣는 검사 | 미수행 |
| 저장 공간 실제 고갈, 자동 eviction, 앱 강제 종료 | 오류 안내/백업 경로 구현, OS 수준 상황 미검증 |
| v7/v8 동일 기기 비교 | 문서 조사만 수행 |
| Windows 에뮬레이션 / ED3 / ED5 / 신ED4 그래픽 연동 | 범위 제외, 미구현 |

알려진 제한:

- 파일 삭제 tombstone을 저장하지 않는다. 이전 저장 파일의 삭제는 재실행 때 반영되지 않을 수 있다.
- ASCII 경로만 지원하고 실행 경로는 DOS 8.3 이름을 요구한다. CP949/한글 경로와 긴 실행 경로는 명시적으로 거절한다.
- 초기 DOS 설정과 한글 로더는 게임별 확정 프리셋이 아니다. 사용자가 확인한 실행 파일/배치를 선택해야 한다.
- 저장 변경분은 알려진 세이브 파일만 필터링한 것이 아니다. 게임이 수정한 리소스도 포함되고 다음 실행에서 수정 레이어보다 우선한다.
- 다시 연결한 원본 ZIP의 내용 fingerprint를 아직 대조하지 않는다. 사용자가 동일 버전을 연결해야 한다.
- ZIP 해제/재압축/가상 FS는 메모리에 여러 복사본을 만들 수 있다. 128/256 MiB 제한을 만족해도 저메모리 모바일에서는 실패할 수 있다.
- 한 origin의 최초 탭만 쓰기 가능하다. Web Locks를 지원하지 않거나 보안 컨텍스트가 아닌 브라우저에서는 쓰기/실행을 제한한다.
- UI 버튼 위치는 가장자리 간격 조정이며 개별 버튼 자유 드래그 배치는 아니다.
- 개발 서버와 배포 origin이 다르면 저장 데이터는 공유되지 않는다. 백업 ZIP으로 이동한다.

## 5. 모바일 브라우저 제약 조사

1. **오프라인과 HTTPS**: 서비스 워커는 보안 컨텍스트가 필요하다. PC localhost 예외를 LAN IP HTTP에 그대로 적용할 수 없다. 처음 캐시를 받기 전에 오프라인이면 실행할 수 없다. [MDN Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
2. **오디오 시작**: 자동 재생 제한 때문에 사용자 실행 클릭에서 AudioContext를 활성화한다. 장치 전환/절전 복귀 때 다시 켜기가 필요할 수 있다. [MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
3. **저장 수명**: 브라우저별 quota/eviction 정책이 다르고 영구 저장 요청은 거절될 수 있다. 사용자 데이터 삭제와 private mode도 별도 위험이다. 파일 백업을 제공하고 `QuotaExceededError`를 안내한다. [MDN 저장 정책](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
4. **방향/전체 화면**: manifest의 landscape는 지원 범위 안에서만 적용된다. CSS는 세로/가로 모두 처리하고 전체 화면 버튼을 제공한다. 강제 방향 잠금은 보장하지 않는다. [MDN Screen Orientation](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Orientation_API)
5. **백그라운드 종료**: visibilitychange 저장은 최선 노력이다. 탭/앱 강제 종료 직전 비동기 저장 완료를 전제로 하지 않으며, 사용자에게 게임 내부 저장과 명시적 저장 후 종료를 안내한다.

## 6. 인계

빠른 실행은 `README.md`, 후속 게임/Android 검증 체크리스트는 `NEXT_STEPS.md`를 따른다. `dist/` 전체를 HTTPS 정적 호스팅에 배포할 수 있다. 소스 및 라이선스 ZIP/문서 경로를 제외하지 않는다. 상용 게임 데이터와 사용자 저장 파일은 GitHub나 배포 폴더에 추가하지 않는다.
