# 대용량 데이터 처리

## 저장 방식 비교와 선택

| 항목 | 기존 IndexedDB | OPFS | 이번 선택 |
|---|---|---|---|
| 프로필/저장 원자적 갱신 | 기존 여러 store transaction 활용 | 다른 파일·IDB 사이 단일 transaction 없음 | 기존 IDB 유지 |
| 본체/모드 | 기존 Uint8Array archive와 Worker 합성 경로 | 전체 본체 엔진 마이그레이션 필요 | 기존 bounded IDB 유지 |
| 수백 MB 음악 | 거대 archive clone·ZIP 합성 회피 필요 | 파일별 순차 저장·구간 읽기 가능 | RAW만 OPFS |
| 런타임 | 본체는 메모리 FS | File snapshot을 DOS Worker에서 부분 읽기 | 두 경로 분리 |
| 데이터 수명 | origin에 종속, 삭제/축출 가능 | 동일한 origin 저장 정책·quota 적용 | 외부 원본/백업 보관 필요 |

OPFS는 HTTPS 등 보안 컨텍스트에서 사용할 수 있고 사용자의 일반 폴더와 별도의 origin 전용 저장소다. Worker의 sync handle로 순차 쓰기를 수행한다. 저장 공간 추정은 보장값이 아니다. [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [SyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle), [estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)

## 처리 경로

1. ZIP central directory를 작은 범위로 읽어 목록과 선언 크기·경로를 검사한다. RAW가 없는 128 MiB 이하 ZIP은 기존 Phase 2 경로를 유지한다.
2. 폴더/RAW 포함 ZIP/큰 ZIP은 Worker에서 파일별 처리한다. 폴더 입력은 256 KiB씩 읽는다. deflate 입력은 32 KiB씩 공급하며 출력 청크 크기는 압축률에 따라 더 클 수 있다.
3. RAW는 즉시 OPFS sync handle에 쓰고 flush/close한다. 본체만 Uint8Array로 보관해 기존 archive store에 넣는다.
4. ZIP 전체 SHA-256은 incremental 계산한다. 폴더에는 정렬한 경로·크기·파일별 SHA-256 manifest의 SHA-256을 저장하며 ZIP 해시와 구분한다. 버전 별칭을 바꿔도 manifest fingerprint 검증은 유지된다.
5. 음악 pack 완료 후 catalog를 공개한다. 실패 시 신규 pack만 정리하고 기존 프로필/세이브는 교체하지 않는다. 등록을 취소한 완성 pack은 음악 보관함에서 명시적으로 삭제 가능하다.
6. 실행 시 본체만 ZIP으로 합성한다. 음악은 File 객체 참조와 경로를 Worker로 전달하여 요청된 구간만 읽는다. 음악이 원본/수정/저장 파일 또는 삭제 상태와 충돌하면 연결/실행을 거절한다.

## 제한

- 입력 768 MiB, 전체 해제 768 MiB, 본체 해제 합계 256 MiB, 본체 파일당 64 MiB, RAW 파일당 128 MiB, 항목 12,000.
- 실행 시 원본·모드·세이브 합계 256 MiB 유지. **500 MiB 전체를 메모리 본체로 실행하는 방식은 지원하지 않는다.** 본체 약 68 MiB + 음악 약 432 MiB 구성이 검증 대상이다.
- ZIP64/암호화/분할 ZIP·비 ASCII 경로 미지원. 폴더로 선택해도 비 ASCII 내부 경로는 거절한다. 최상위 선택 폴더 이름만 제외한다.
- 큰 ZIP은 아직 전체 decode가 필요한 작은 ZIP 경로와 달리 streaming inflate·CRC 검사 경로를 쓴다. 입력은 변형하지 않는다.
- 한 파일의 해제 청크, 본체 합치기, IndexedDB 직렬화, emulator MEMFS에는 추가 메모리가 필요하다. 청크 크기만으로 전체 peak가 제한된다고 주장하지 않는다.
- OPFS 미지원 시 음악 없는 본체를 사용할 수 있다. RAW 포함 자료는 본체와 음악을 분리해 등록해야 한다.
- 강제 종료 시 catalog에 없는 임시 OPFS 디렉터리가 남을 수 있다. 자동 orphan GC는 미구현이며 새 실행에서 임의로 원본/세이브를 삭제하지 않는다.

## 측정

`tests/e2e/phase3.spec.ts`가 1 MiB 생성 버퍼로 500 MiB 파일 집합을 순차 작성하고 경로로 업로드한다. 54 RAW 전체 보관, 2개 파일 구간 읽기, 실행·저장·백업을 검사했다. `PHASE3_REPORT.md`와 `artifacts/phase3/large-observations.json`에 실제 값이 있다. 음악 452,985,264 B가 세이브 679 B에 복제되지 않았다.

500 MiB **폴더** end-to-end가 검증되었다. RAW 포함 deflate ZIP은 20 MiB 합성 자료로 검사했고 500 MiB ZIP 자체 성능·Galaxy 메모리·장기 재생은 미측정이다. quota 사전 실패와 CRC 오류 정리를 검사했으며 물리 디스크 고갈/OS 강제 종료는 미검증이다. 이전 대비 RAM 절감률이나 Android 성공률을 산출하지 않았다.

## 공유와 복구

모드 A는 baseId로 본체를 공유하고 프로필별 save를 유지한다. 음악은 packId를 여러 프로필에서 참조한다. 자동 버전 혼합은 하지 않으며 별도 등록 음악은 명시적으로 연결한다. 한 프로필은 한 음악 pack을 선택한다. 기존 음악 파일 일부만 다른 pack에서 자동 병합하는 기능은 없다.

세이브 백업에는 음악 참조만 들어가며 원본 PCM 전체는 들어가지 않는다. 새 브라우저 복구 시 원본 ZIP/폴더를 다시 연결하고 음악 pack을 별도로 등록·선택한다. 복구된 이전 packId가 없으면 조용히 다른 음악을 쓰지 않고 연결 안내를 표시한다. 사이트 데이터를 지우면 OPFS 음악도 함께 사라지므로 사용자 보유 원본을 유지한다.
