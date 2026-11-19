# PC 세이브 가져오기·내보내기 UI 개선 보고서

## 범위와 결론

기존 PC 세이브 처리 계층을 유지하고 가져오기·내보내기 대화상자를 일반 사용자용으로 재구성했다. 외부 백업 다운로드와 확인란을 거쳐야만 적용할 수 있던 제한을 제거했다. 가져오기 직전 자동 복구 지점과 새 저장 데이터는 기존 `commitProtectedSave()`의 동일 IndexedDB 트랜잭션에 기록된다. 복구 지점을 만들지 못하면 새 저장도 적용하지 않는다.

상용 게임을 실행하거나 실제 사용자 브라우저 데이터에 접근하지 않았다. 게임 내 불러오기와 Galaxy 화면·다운로드는 사용자 확인이 남아 있다.

## 화면 변경

- 가져오기: **1. 파일 선택 → 2. 내용 확인 → 3. 가져오기**의 현재 단계를 표시한다.
- 선택 종류 하나와 ‘저장 파일 선택’ 버튼 하나로 DAT/CFG/SAV 여러 파일, SAVE 폴더, ZIP을 모두 지원한다. 폴더 미지원 브라우저에서는 해당 선택만 사용할 수 없게 하고 다른 방법을 안내한다.
- 기본 화면에는 추가할 파일 수, 바뀌는 기존 파일 수, 유지되는 파일을 표시한다. 파일을 선택 해제하면 즉시 요약을 다시 계산한다.
- 전체 교체는 ‘다른 가져오기 방식 · 외부 백업’ 안에 둔다. 새 파일 선택과 새 대화상자는 항상 추천 병합 방식으로 시작한다. 전체 교체의 삭제 대상도 파일별 선택을 해제할 수 있다.
- 기존 파일 변경·삭제·삭제된 파일 다시 가져오기 문구는 적용 버튼 위에 표시한다. 실제 게임 슬롯 번호를 추정하지 않는다.
- 기존 4열 표를 제거했다. ‘자세히 보기 · 파일 선택’에 파일별 체크박스, 원래 선택 경로, 게임 안의 저장 위치, 바이트 크기와 동작을 표시한다. 긴 경로는 줄바꿈하며 생략하지 않는다.
- ‘다시 선택’에서 파일 선택을 취소하거나 확인 화면으로 돌아가면 이전 선택을 유지한다. 새로운 파일을 실제 선택했을 때만 새 계획을 만든다.
- 선택 사항인 외부 백업은 기존 실행기 백업 ZIP 형식을 사용한다. 다운로드 완료를 보장하지 않으며, 다운로드 여부는 적용 가능 여부에 영향을 주지 않는다.
- 내부 자동 복구 지점도 브라우저 데이터를 지우면 사라질 수 있음을 안내한다.
- 내보내기 제목은 ‘저장 파일 내보내기’, 설명은 ‘다른 PC나 휴대폰에서 이어할 수 있도록 저장 파일을 다운로드합니다.’, 실행 버튼은 ‘저장 파일 다운로드’로 바꿨다.
- 내보내기는 확인된 저장·설정 파일을 기본 선택한다. 용도 미확인 파일은 계속 선택하지 않으며, 제외 규칙을 유지한다. 상세 목록과 PC/휴대폰 적용 방법은 접힌 영역에 있다.
- `ED4_PC_SAVE.zip`, `SAVE/` 디렉터리, 원래 파일명/바이너리를 유지한다. PC에 남아 있는 오래된 파일은 ZIP이 자동 삭제하지 않는다는 안내도 유지한다.

## 자동 복구와 보존

`src/pc-save-import.ts`, `src/pc-save-export.ts`, `src/pc-save-paths.ts`, `src/save-state.ts`, `src/storage.ts`, `src/backup.ts`, `src/temp-save.ts`를 수정하지 않았다. 스키마, 경로 정규화, 파일 형식/크기 제한, 충돌 검사, tombstone, 프로필 격리, 기존 복원 기능은 그대로다.

화면에서만 강제 다운로드 게이트를 없앴다. 실제 적용은 여전히 프로필/저장 상태 재검사와 기존 원자적 저장 API를 거친다. 다른 탭에서 저장 상태가 바뀌면 적용을 거절하며, 저장 실패 후 현재 미리보기로 재시도할 수 있다. 작업 중 중복 클릭, 선택 변경 및 닫기/ESC를 막는다.

공개/개발 Worker·WASM·AudioWorklet 및 vendor 파일 각 127개를 변경 전 manifest의 길이/SHA-256과 대조하여 동일함을 확인했다. 엔진·오디오·배속·자동 업데이트 코드와 `src/main.ts` 이벤트 연결도 변경하지 않았다.

## 검증

최종 결과는 아래에 기록한다. 실제 게임 플레이 성공과 자동 합성 시험을 구분한다.

- 변경 전: 단위 536 통과 / 로컬 자료 지정이 필요한 4개 건너뜀; 기존 가져오기·내보내기 브라우저 기준 2개 통과.
- 전체 단위: **541/541 통과**. 읽기 전용 로컬 PC 저장 파일·ISO를 지정한 기존 검사 포함. 이번에 복구 지점 `add()` 실패 시 기존 저장 및 이전 복구 지점 보존 검사를 추가했다.
- 가져오기·내보내기: **12개 통과**. 외부 백업 다운로드 0회 상태의 가져오기, 자동 복구 지점, 선택적 외부 백업, 병합/교체/선택 해제, DAT/CFG/SAV/폴더/ZIP, 위험 ZIP 거절, 취소/재선택, IDB 저장 실패 및 복구 지점 생성 실패 후 재시도를 확인했다.
- 내보내기 ZIP의 정확한 경로·바이트·SHA-256 및 다시 가져오기, stale 저장의 다운로드 차단, 실행 중 가져오기/내보내기 금지, 원본/프로필/OPFS 불변 확인.
- 공개 DOS 합성 프로그램으로 가져온 파일 읽기·소비·삭제 후 오프라인 재실행에서 자동 부활하지 않는 것을 확인했다. 실제 ED4의 플레이 시험이 아니다.
- 자동 업데이트 **13/13 통과**: 실행/저장 중 보류, 실패 보류, 다중 탭, 오프라인, 무결성 실패, 새로고침 중복 방지, 공개/개발 격리 등 기존 회귀.

- 일반 저장·복구 / K 1×↔2× / 9-7·K 초기 오디오 회귀 **8/8 통과**. 기존 합성 DOS 프로그램 기준이다.
- 공개·개발 데이터/캐시/업데이트/오프라인 격리 **1/1 통과**.
- 최종 브라우저 회귀 합계 **34/34 통과**. TypeScript와 공개·개발 production 빌드도 통과했다.

재현 명령: `npm test -- --reporter=dot`, `npx playwright test --config playwright.pc-save.config.ts`, `--config playwright.auto-update.config.ts`, `--config playwright.phase9-8o-followup.config.ts`, `--config playwright.dev-split.config.ts`. 로컬 자료 단위 검사는 기존 `ED4_PC_SAVE_ROOT`, `ED4_Q_LOCAL_FOLDER`, `ED4_LOCAL_ISO` 환경 변수를 지정했다.

## 화면 검토

832×384 모바일 가로와 1440×1000 PC를 자동 검사하고 캡처했다. 버튼 최소 높이 44px, 화면 안의 적용 버튼, 상세 영역 가로 넘침 없음, 기본 상세 접힘을 확인했다. 헤더와 하단 선택 수/실행 버튼은 고정하고 가운데 내용만 스크롤한다.

첫 시각 검토에서 페이지 전역 footer의 8px 글꼴·낮은 대비가 대화상자에 상속되는 문제를 발견해 전용 스타일로 보정했다. 최초 신규 긴 경로 시험 2개는 기존 180자 보안 제한을 초과한 시험 데이터 때문에 실패했다. 기존 제한은 유지하고, 허용 범위의 긴 경로로 줄바꿈 시험을 다시 수행했다.

변경 전 캡처는 기존 빌드의 844×390이며, 변경 후는 요청한 832×384 및 PC다. 동일 해상도 전후 비교라고 주장하지 않는다.

캡처/로그 경로: `artifacts/pc-save-ui/` (로컬 검증 자료, 공개 배포에 포함하지 않음).

## 수정 파일

| 파일 | 변경 |
|---|---|
| `src/pc-save-ui.ts` | 단계형 가져오기, 요약, 상세 선택, 선택적 백업, 다운로드 게이트 제거 |
| `src/pc-save-export-ui.ts` | 간결한 내보내기, 접힌 목록/도움말, 선택 수, 다운로드 상태 |
| `src/save-transfer.css` | 두 대화상자 전용 모바일/PC 레이아웃 |
| `src/style.css` | 이전 PC 세이브 표 스타일 제거 |
| `tests/pc-save-import.test.ts` | 복구 지점 생성 실패 원자성 검사 |
| `tests/pc-save/import.spec.ts` | 새 요구사항에 따른 UI 회귀 및 오류/화면 시험 |
| `tests/pc-save/export.spec.ts` | 접힌 목록·다운로드/왕복·화면 시험 |
| `scripts/build-id.mjs`, `src/build-info.json` | UI 개정 식별자 `pc-save-ui-1` 및 빌드 메타데이터 |
| `docs/ed4/`, `docs/ed4-dev/` | 로컬 공개/개발 산출물 및 대응 소스 |

기존 테스트의 바이너리/해시/저장/복구 검증은 유지했다. 제거한 것은 사용자 요구에 따라 없어진 ‘외부 백업 필수’ UI 검증이며, ‘다운로드 없이 성공 + 복구 지점 생성’으로 대체했다.

## 사용자 최소 확인

1. Galaxy 가로 화면에서 관리·백업의 PC 세이브 가져오기를 연다. 파일/폴더/ZIP 중 하나를 선택한다.
2. 추가/변경 개수를 확인하고 필요하면 자세히 보기에서 선택을 조절한다. 외부 백업 없이 가져오기가 가능한지 확인한다.
3. 게임에서 실제 불러오기를 확인한다. 필요 시 기존 ‘이어하기 복구’에서 가져오기 직전 복구 지점을 확인한다.
4. 정상 종료 후 저장 파일 내보내기를 열어 다운로드한다. 기기의 다운로드 목록에서 `ED4_PC_SAVE.zip`을 확인한다.
5. PC 게임을 종료하고 기존 SAVE를 별도 보관한 뒤 같은 설치본에 적용해 불러오기를 확인한다.

실제 Galaxy의 파일 선택기·다운로드 동작과 게임 세이브 간 호환성은 아직 실기 미검증이다. 이 작업은 세이브 형식을 변환하거나 게임 내 슬롯 의미를 판별하지 않는다.

Git Add/Commit/Push 및 원격 배포는 하지 않았다. 작업은 미커밋 상태다.

## 로컬 빌드와 검토 자료

- 공개 `/porting-pj/ed4/`: `ed4-pc-save-public-20261119034913356-e8b9854a`
- 개발 `/porting-pj/ed4-dev/`: `ed4-pc-save-dev-20261119034849365-243f4a27`
- 공개·개발 빌드 모두 TypeScript와 자산 SHA-256/서비스 워커/대응 소스 검사를 통과했다. 원격 배포는 수행하지 않았다.

- [변경 전 가져오기 (844×390)](D:/porting/ed4-mobile/artifacts/pc-save-ui/before/import-loose-PC-saves-requ-7cf23-oads-consumes-imported-file/preview-landscape.png)
- [변경 전 내보내기 (844×390)](D:/porting/ed4-mobile/artifacts/pc-save-ui/before/export-plain-PC-ZIP-defaul-1ff77-rip-through-existing-import/export-landscape.png)
- [파일 선택 (832×384)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/import-readable-import-steps-details-reselect-and-cancel-832/import-select.png)
- [가져오기 요약 (832×384)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/import-readable-import-steps-details-reselect-and-cancel-832/import-review.png)
- [긴 경로 상세 (832×384)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/import-readable-import-steps-details-reselect-and-cancel-832/import-details.png)
- [전체 교체 (832×384)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/import-readable-import-steps-details-reselect-and-cancel-832/import-replace.png)
- [내보내기 (832×384)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/export-export-summary-and-optional-details-layout-832/export-summary.png)
- [가져오기 PC (1440×1000)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/import-readable-import-ste-153bb-ls-reselect-and-cancel-1440/import-review.png)
- [내보내기 PC (1440×1000)](D:/porting/ed4-mobile/artifacts/pc-save-ui/browser-final/export-export-summary-and-optional-details-layout-1440/export-summary.png)

상세 소스 diff: [source.diff](D:/porting/ed4-mobile/artifacts/pc-save-ui/source.diff). 보존 점검: [preservation.json](D:/porting/ed4-mobile/artifacts/pc-save-ui/preservation.json).
