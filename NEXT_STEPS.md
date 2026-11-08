# 다음 확인 사항

2026-11-09 / Phase 6 이후 자동 개발은 진행하지 않는다.

1. 사용자가 GitHub Desktop에서 소스·보고서·docs/ed4 변경을 Commit·Push한다. 기존 porting-pj 원격과 main /docs 설정을 유지한다.
2. Galaxy에서 PHASE 06 · 진단과 오프라인 준비 완료를 확인한다. 기존 폴더 등록과 세이브를 유지한다.
3. GAME.BAT 임시 진단을 실행해 검은 화면에서 실행 진단 JSON과 화면 PNG를 수집한다. 마지막 진입 명령과 사후 마커 유무를 확인한다. 한글 깨짐은 별도 문제로 기록한다.
4. ZIP 재현 시 등록 진단 JSON으로 read/inflate/CRC/SHA/OPFS/IDB 중 무응답 단계를 확인한다. 약 500MB ZIP의 실기 해결을 PC 결과로 단정하지 않는다. 기존 폴더 등록을 계속 사용할 수 있다.
5. 실제 설치본의 NOSOUND.BAT가 있을 때 내용을 먼저 분석하고 일회용 비교 진단을 수행한다. 로더·드라이버·CD를 임의로 추가/교체하지 않는다.
6. 원인이 확인된 뒤 게임 진행·한글·전투·내부 저장·재실행·BGM 및 모드 실기 검증 여부를 결정한다. 게임 원본·RAW·세이브를 공개 저장소에 올리지 않는다.

자세한 절차는 GALAXY_TEST_GUIDE.md와 ED4_BOOT_TRACE.md, ZIP 조사 내용은 ZIP_IMPORT_DIAG_REPORT.md, 로컬 검증 범위는 PHASE6_DIAG_REPORT.md를 따른다. 실제 기기 진단 결과를 받은 뒤 후속 작업을 결정한다.
