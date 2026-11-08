# GitHub Pages 수동 배포 가이드

> 2026-11-09 경로 이전: 현재 배포는 porting-pj 저장소의 docs/ed4/입니다. 최신 경로와 검증은 PATH_MIGRATION_REPORT.md를 따르세요. 아래 내용은 이전 배포 준비 기록입니다.

> 이전 웹 ZIP 업로드용 안내입니다. 현재 GitHub Desktop 배포는 GITHUB_DESKTOP_GUIDE.md의 main /docs 절차를 사용하세요. 새 빌드는 docs/에 생성됩니다.

대상: 저장소 이름 **ed4-mobile**, GitHub Pages 프로젝트 경로 **/ed4-mobile/**. 계정 연결·저장소 생성·업로드·실제 배포는 이 작업에서 수행하지 않았습니다.

## 1. 업로드할 자료

`D:\porting\ed4-mobile\ed4-mobile-deploy.zip`을 새 폴더에 압축 해제하세요. ZIP 안에 상위 `dist/` 폴더가 없으므로 압축을 풀면 다음 파일/폴더가 바로 보여야 합니다.

```text
.nojekyll
index.html
manifest.webmanifest
sw.js
dos-worker.js
icon.svg
icon-192.png
icon-512.png
test-program.zip
assets/
vendor/
licenses/
sources/
```

전체 25개 파일입니다. 상용 게임·RAW 음악·세이브·개인 파일은 없으며 합성 RAW 샘플 ZIP도 제외했습니다. `test-program.zip`은 프로젝트에서 작성한 CC0 공개 DOS 검증 프로그램입니다.

**바깥쪽 ed4-mobile-deploy.zip 자체를 업로드하지 마세요. 압축 해제한 내용물을 업로드합니다.** 반면 안쪽 `test-program.zip`과 `sources/*.zip`은 웹 실행/라이선스 제공용 파일이므로 **압축을 풀지 말고 그대로** 업로드하세요.

개발 폴더 전체, `node_modules/`, `research/`, `artifacts/`, 브라우저 프로필·진단 결과, 사용자 게임·RAW·백업 파일은 업로드하지 않습니다.

## 2. GitHub 웹에서 올리기

1. GitHub에 로그인하고 저장소 이름을 정확히 **ed4-mobile**로 만듭니다. 일반적인 무료 계정의 공개 Pages 사이트라면 Public 저장소를 사용합니다. 이미 만든 저장소가 있으면 해당 저장소를 엽니다.
2. 빈 저장소의 **uploading an existing file**, 또는 **Add file → Upload files**를 선택합니다.
3. 압축 해제 폴더 **안의 모든 파일과 assets/vendor/licenses/sources 폴더**를 업로드 영역에 끌어놓습니다. 바깥 폴더 자체를 끌어넣어 한 단계 더 중첩시키지 마세요. `.nojekyll`도 포함해야 합니다.
4. 업로드 목록에서 `index.html`, `.nojekyll`, `vendor/wdosbox.wasm`, `sources/emulators-0.73.8-source.zip`, `sources/ed4-mobile-source.zip`을 확인합니다. 경로가 `dist/index.html` 또는 `ed4-mobile/index.html`이면 잘못 중첩된 것이므로 커밋 전에 바로잡습니다.
5. **Commit changes**를 눌러 `main` 브랜치에 저장합니다. 커밋 뒤 저장소 첫 화면에 `index.html`과 `.nojekyll`이 있어야 합니다. `.nojekyll`이 빠졌다면 **Add file → Create new file**에서 이름을 정확히 `.nojekyll`로 만들어 저장합니다. `.nojekyll.txt`로 만들지 않습니다.

GitHub 공식 안내는 브라우저 업로드를 **파일당 25 MiB, 한 번에 100개 파일**로 제한합니다. 이번 25개 파일은 모두 제한 이하이며 가장 큰 파일은 약 2.55 MiB입니다. 분할이나 Git LFS가 필요하지 않습니다. [GitHub 파일 업로드 안내](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 3. Pages 켜기

1. 저장소 **Settings → Pages**로 이동합니다.
2. **Build and deployment → Source → Deploy from a branch**를 선택합니다.
3. Branch는 **main**, 폴더는 **/(root)**를 선택하고 **Save**를 누릅니다.
4. GitHub가 표시하는 배포 상태를 기다립니다. 실패하면 Pages 화면 또는 Actions의 Pages 배포 로그를 확인합니다. 이 패키지는 이미 빌드되어 있으므로 npm 빌드용 Actions 파일은 필요 없습니다.
5. Pages 화면에 표시되는 **실제 사이트 링크**를 Galaxy Chrome으로 엽니다. 끝 경로가 `/ed4-mobile/`인지 확인하세요.

주소 형식은 `https://<본인-GitHub-아이디>.github.io/ed4-mobile/`입니다. 이것은 형식 예시이며 이 작업에서 생성하거나 접속 검증한 실제 URL이 아닙니다. 저장소 이름·사용자 사이트·커스텀 도메인이 달라지면 base 경로에 맞춰 다시 빌드해야 합니다.

`.nojekyll`은 Jekyll 처리를 비활성화하는 파일입니다. 빌드 결과의 경로와 파일을 그대로 제공하도록 저장소 root에 유지하세요. [GitHub Pages 생성 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [배포 브랜치 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 4. Galaxy 첫 확인

먼저 실제 게임 대신 **먼저 실행 환경 확인하기**를 누릅니다.

1. 공개 DOS 테스트 → 실행 → 방향키 입력 확인.
2. 가상 키보드 S로 저장 → 저장 후 종료 → 새로고침 → 실행 → L로 `ED4_SAVE_OK!` 확인.
3. 오프라인 준비 완료 후 홈 화면에 추가합니다. 다시 열고 비행기 모드에서도 공개 프로그램이 실행되는지 확인합니다.
4. 다음으로 사용자 보유 게임을 **Galaxy 안에서** 등록합니다. 폴더 선택이 지원되면 폴더를 먼저 사용하고, 음악 없는 본체부터 시험합니다. 게임/음악 파일을 GitHub에 올리지 않습니다.
5. 실제 ED4·한글·전투·저장·RAW BGM은 아직 미검증입니다. 자세한 순서는 기존 `ANDROID_TEST_GUIDE.md`를 참고하세요. 이번 배포본에는 합성 RAW 다운로드 링크가 없지만 사용자 RAW 등록 기능은 유지됩니다.

localhost 데이터는 GitHub Pages로 자동 이동하지 않습니다. 필요한 저장은 외부 백업 ZIP으로 내보내고 새 주소에서 복원한 뒤 원본을 다시 연결합니다. GitHub Pages의 같은 계정 아래 프로젝트들은 origin을 공유할 수 있으므로 서로 다른 URL 경로가 별도 IndexedDB를 보장하지는 않습니다.

## 5. 오류 시 확인

- 404: Pages 브랜치/root, `index.html` 위치, 저장소 이름, 배포 상태를 확인합니다.
- 화면만 나오고 실행 실패: `vendor/`, `assets/`, `dos-worker.js`, `sw.js`의 누락·중첩을 확인합니다. 개별 WASM 링크가 GitHub 파일 보기 페이지가 아니라 Pages 파일 URL인지 확인합니다.
- 오프라인 준비 실패: 첫 온라인 로딩을 완료하고 HTTPS인지 확인합니다. `sources/`는 오프라인 캐시에서 제외하지만 서버에 반드시 제공해야 합니다.
- 업데이트: 실행 중인 게임을 저장 후 종료하고 관련 탭/PWA를 닫은 뒤 다시 엽니다. 임의로 사이트 데이터 전체를 지우지 마세요. 그 작업은 세이브·원본·음악도 지웁니다.
- 소스/라이선스: `licenses/`와 `sources/`를 용량 절약 목적으로 빼지 않습니다. 실행기 하단 라이선스 링크에서 접근할 수 있어야 합니다.

## 개발 환경에서 재생성

```powershell
cd D:\porting\ed4-mobile
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:pages
npm.cmd run package:manual
```

엄격한 하위 경로 테스트 서버는 `node scripts/serve-pages.mjs`, 주소는 `http://localhost:4173/ed4-mobile/`입니다. 서버의 root `/`와 잘못된 자산 경로는 의도적으로 404입니다. GitHub 공개 URL이나 Galaxy 실기 테스트의 대체로 간주하지 않습니다.

