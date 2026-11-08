# DOS 오디오 호환성

## 유지한 실행 방식

js-dos v7 계열 `emulators 0.73.8` / 기존 DOSBox WASM, CPU·메모리·Sound Blaster 설정, DOS 엔진 오디오 출력은 그대로 유지한다. 별도 PC DOSBox나 Windows 에뮬레이션은 설치하지 않았다. 프리셋은 범용 출발점이며 ED4 전용 확정값이 아니다.

## RAW 파일 제공

`public/dos-worker.js`가 unmodified upstream Worker를 감싼다. `preRun`에서 `/home/web_user` 아래에 읽기 전용 Emscripten 파일 노드를 만든다. 파일 내용은 OPFS의 File 참조로 유지하며 read(offset,length) 시 FileReaderSync로 해당 Blob.slice만 읽는다. 한 번의 실제 slice 읽기는 최대 1 MiB로 나눈다. 헤더를 제거하거나 PCM을 변환하지 않으므로 DOS 드라이버에는 원래 바이트가 전달된다.

파일 길이와 seek는 실제 RAW 길이를 사용한다. 쓰기/크기 변경/삭제/rename을 차단하며 원본 저장소는 변경하지 않는다. 저장 snapshot에서는 마운트 음악을 제외하고 node timestamp를 고정하여 upstream 변경 ZIP에 원본 음악이 들어가지 않게 한다. 이 어댑터는 고정된 0.73.8의 FS 구현에 의존한다. 엔진 버전 변경 시 같은 테스트가 필요하다. [Emscripten filesystem API](https://emscripten.org/docs/api_reference/Filesystem-API.html)

## 실제 검증

공개 CC0 DOS COM이 INT 21h로 `ED4-01.RAW`, `ED4-02.RAW`를 열고 헤더를 읽어 stdout에 출력한 뒤 파일 끝 -4 위치로 seek, 4바이트 읽기 성공을 검사했다. 54곡 마운트·500 MiB 입력에서도 같은 경로를 통과했다. 오프라인 재실행 후 동일 접근 및 세이브 복원, 음악 미포함 백업을 확인했다.

이 테스트는 **파일 접근 검증**이다. DOS 내부 PCM 재생, Sound Blaster DMA, 실제 반복/전환/효과음 동시 재생을 검사하지 않았다. CODEX 환경에서는 실제 ED4를 실행하지 않는다.

## Windows 모드 및 정적 분석

선택한 EXE가 MZ 헤더 뒤 PE/NE signature를 갖는 경우 실행을 막고 Windows/OS2 비지원 안내를 표시한다. LE/LX는 DOS extender일 수도 있어 이 검사만으로 차단하지 않는다. BAT가 외부 Windows 프로그램을 호출하는 경우는 정적 후보 목록만 제공하며 전체 BAT 의미론을 판정하지 않는다. Windows Expansion이 요구하는 외부 프로그램을 DOS 파일 교체형 모드로 간주하지 않는다.

## v8와 대안 검토

현재 js-dos 공식 문서는 OPFS 로컬 persistence, Sockdrive 대용량 디스크 스트리밍, fsChanges를 설명한다. [공식 개요](https://js-dos.com/overview.html), [Player API](https://js-dos.com/player-api.html), [upstream releases](https://github.com/caiiiycuk/js-dos/releases/)

이 기능이 사용자 RAW 드라이버와 Galaxy에서 더 안정적이라는 비교 실측은 없다. v7 어댑터로 대용량 음악 파일 접근이 확인되어 이번 단계에서는 엔진을 교체하지 않았다. v8 검토가 필요해지면 라이선스/대응 소스, 기존 저장 변환, 로컬 전용·오프라인 경로, 같은 장치의 시간·오디오·메모리를 함께 비교한다. 서버 스트리밍을 위해 사용자 게임 데이터를 업로드하는 기능은 구현하지 않았다.

브라우저 RAW preview는 진단용에 한정한다. 게임 곡 명령에 대한 검증된 hook 없이 자동 재생하지 않으며, OGG/Opus 변환이나 외부 음악 재생 동기화는 미구현이다.
