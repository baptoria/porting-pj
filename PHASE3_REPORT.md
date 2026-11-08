# ED4 Mobile — Phase 3 결과

2026-11-08 / 기존 `D:\porting\ed4-mobile` / 앱 0.3.0. Phase 3 범위에서 종료하며 다음 단계·공개 배포를 자동 진행하지 않는다.

## 결론과 검증 경계

Galaxy에서 사용자 원본을 등록하고 실행을 시도할 수 있는 웹 빌드를 준비했다. 기존 v7 엔진과 저장 방식은 유지하고 폴더 등록, RAW 별도 저장·DOS 지연 읽기, 가로 화면, 정적 파일 분석과 진단을 추가했다. **실제 ED4와 Galaxy 실행 성공은 검증하지 않았다.** PC에서 상용 게임 원본을 실행하지 않았으며 Windows VM, DOSBox-X, 별도 PC DOSBox도 설치하지 않았다.

## 구현

| 영역 | 실제 구현 | 확인 범위 |
|---|---|---|
| 모바일 | landscape manifest, coarse-pointer 실행 클릭에서 전체 화면 요청, 방향 잠금 시도/실패 안내, 세로 회전 권장, safe-area, 가로 화면 양쪽 터치 버튼, 크기·간격·불투명도·세로 위치 저장 | Chrome 390×844 / 844×390, 잠금 거절 주입, 멀티 포인터 입력 |
| 화면 비율 | Canvas 원래 framebuffer 비율 + object-fit contain. 640×400이면 8:5로 표시하며 4:3 강제 보정 없음 | 공개 DOS 문자 화면 확인. 실제 ED4 640×400 장면은 Galaxy 대상 |
| 등록 | 기존 ZIP, 폴더, RAW 분리 파일/폴더/ZIP, RAW 포함 본체 ZIP/폴더, 음악 없는 실행, 모드 A/B | 공개 COM/BAT와 합성 파일 |
| 대용량 | 본체는 기존 IDB, 음악은 OPFS 파일. Worker 순차 읽기/쓰기·파일별 SHA-256, ZIP central directory 사전 검사·CRC·크기 검증, 전체 ZIP incremental SHA-256 | 실제 500 MiB 합성 폴더 + 20 MiB RAW 포함 deflate ZIP |
| DOS 음악 접근 | OPFS File 참조를 Worker에 전달, Emscripten 읽기 전용 파일 노드에 구간 읽기 연결. 원본 JS/WASM 바이너리는 변경하지 않음 | DOS INT 21h 열기·읽기·seek, 두 파일, 오프라인 재실행 |
| RAW 진단 | 8-byte 헤더 표시, PCM16 LE stereo 22050Hz 가정 디코더, 선택한 곡만 제한된 청크로 시험 재생/중지 | 합성 2곡, 채널 샘플 단위 검사와 Web Audio 호출. 사람 청취 평가는 하지 않음 |
| 모드·세이브 | 공통 본체/음악 참조 공유, 프로필 저장 분리, tombstone·v1/v2 백업 보존, 음악 충돌 거절, 음악 원본 백업 제외 | 기존 테스트 + 독립 모드/패치의 RAW 공유·세이브 분리 |
| 분석 | BAT 내용 로컬 표시, 드라이버 이름 후보, BAT 누락 참조 후보, PE/NE 실행 파일 구분, 파일별 경로·버전, 로그·화면·오디오·FPS·저장소 진단 JSON | 정적 분석은 휴리스틱. 실제 드라이버 의미나 모든 BAT 명령을 해석하지 않음 |

기존 `ed4-mobile-v1` IndexedDB 스키마 2와 백업 v2는 유지한다. 음악 메타데이터만 별도 `ed4-music-v1` DB를 추가했다. 프로필의 선택적 `music` 참조와 폴더 `manifestSha256`를 v2 백업에서 보존한다. 이전 v1/v2 백업 읽기는 그대로 가능하다. Phase 2 앱은 새 음악 기능을 이해하지 않으므로 새 프로필을 구버전 앱으로 실행하는 다운그레이드는 권장하지 않는다.

## 자동 검증

- 변경 전: 기존 단위 **54/54**, Chrome E2E **11/11** 통과.
- 변경 후: 단위 **76/76**, Chrome E2E **17/17** 통과. 기존 5개 테스트 파일(Phase 1 단위/E2E, Phase 2 단위/E2E 및 메모리 테스트)을 삭제·완화하지 않았다.
- TypeScript / production build 통과.
- E2E 환경: Windows, 설치된 Chrome 157 headless, localhost production build. Android 에뮬레이션은 화면 크기와 입력 이벤트 검사이며 실제 Galaxy가 아니다.
- ZIP CRC 손상, 기존 용량 오류 안내, quota 사전 실패, 원본 해시/모드 충돌, v1 데이터 이전, 브라우저 재시작, 오프라인과 저장 복원 검증 포함.

처음 신규 검증 중 발견한 완료 대기 타이밍과 기존 크기 오류 문구 호환성을 수정했다. 높은 압축률의 음악 ZIP도 작은 ZIP 전체 해제 경로를 거치지 않도록 목록에서 RAW 여부를 먼저 확인한다.

## 500 MiB 관측

파일 기반으로 54 × (8 MiB + 8-byte header) RAW, 2 × 34 MiB 본체 데이터, 공개 COM/BAT를 생성했다. 생성기에는 재사용하는 1 MiB 버퍼를 사용하며 Playwright에 파일 경로를 전달했다. 500 MiB 배열이나 base64를 한 번에 전송하지 않았다.

최종 기록: `artifacts/phase3/large-observations.json`.

| 값 | PC Chrome 한 번의 관측 |
|---|---:|
| 총 입력 | 524,289,351 B |
| OPFS 음악 | 452,985,264 B |
| 등록 Worker | 약 12.53 s |
| 실행 ZIP 합성 | 약 606.7 ms |
| 생성부터 실행·저장·진단까지 | 약 17.94 s |
| DOS 음악 마운트 | 54 파일 |
| 두 곡 열기/읽기/seek의 실제 읽기 | 8회, 2,070 B, 최대 1,024 B/회 |
| 저장 백업 | 679 B |
| WASM 선형 메모리 | 67,108,864 B |

입력·출력 버퍼 계산과 시간은 실측이지만 **전체 peak/RSS, 실제 게임 음악 재생 부하, Galaxy RAM 사용량이 아니다**. `stream import.logicalBytes`는 보관 본체 바이트 + 가장 큰 출력 청크이며 해제 라이브러리 임시 메모리나 IDB 복제까지 포함하지 않는다. 본체 합성은 여전히 전체 본체가 메모리에 필요하다. 500 MiB가 모두 본체인 게임은 지원하지 않는다. 500 MiB ZIP 자체의 end-to-end 성능은 미측정이며 500 MiB 폴더와 작은 deflate RAW ZIP의 서로 다른 경로를 검사했다.

## 미구현 / 미검증

- 실제 RAW 헤더 의미, byte order·채널 순서, `DRIVER.EXE` / `LOGO.EXE`의 초기화·반복·곡 전환·효과음 혼합은 사용자 제공 단서만 있다. 원본 바이너리를 이번 환경에서 분석/실행하지 않았다.
- 브라우저 음악을 게임 명령에 연결하는 hook, 자동 선곡, OGG/Opus 변환은 없다. 시험 재생은 진단용이고 게임 시작 시 중지된다. 정상 실행은 원본 DOS 드라이버가 읽는 방식을 우선한다.
- 음악은 프로필당 명시적으로 선택한 한 보관함이다. 여러 음악 패치를 자동 병합하지 않는다. RAW 포함 추가 수정 ZIP은 음악 보관함에 분리하고 본체 수정 ZIP을 따로 등록하도록 안내한다.
- OPFS와 IDB 사이에는 단일 트랜잭션이 없다. 완료한 파일 집합만 catalog에 공개하고 오류 시 신규 임시 보관함만 삭제한다. OS/브라우저 강제 종료 시 미등록 OPFS 디렉터리 잔여물 자동 회수는 미구현이다.
- ZIP64/암호화/분할 ZIP과 CP949·비 ASCII 내부 경로 미지원. 폴더 선택기의 빈 폴더는 파일 목록에 없으므로 필요한 빈 DOS 저장 폴더는 초기화 명령으로 만들 수 있다.
- Galaxy 실제 설치·방향 잠금 성공·발열·장시간 실행·메모리 압박·실제 저장공간 고갈은 미검증.

## 전달물과 배포 경계

`dist/`와 `artifacts/ed4-mobile-web.zip`에 앱·런타임·라이선스·대응 소스·공개 테스트 프로그램·합성 RAW 2곡을 포함한다. 상용 게임 데이터는 없다. 기존 Phase 2 배포본은 `artifacts/ed4-mobile-phase2-web.zip`, Phase 1도 별도 보관한다. GitHub 업로드와 공개 배포는 수행하지 않았다. HTTPS 절차와 사용자 A~E 테스트는 `ANDROID_TEST_GUIDE.md`에 있다.

참고: `RAW_AUDIO_ANALYSIS.md`, `DOS_AUDIO_COMPATIBILITY.md`, `LARGE_GAME_SUPPORT.md`, `NEXT_STEPS.md`.
