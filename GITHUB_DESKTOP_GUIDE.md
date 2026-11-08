# GitHub Desktop 배포 안내

대상 프로젝트: `D:\porting\ed4-mobile`, 앱 0.3.0, 저장소 이름 `ed4-mobile`.
빌드 결과는 `docs/`, 웹 base는 `/ed4-mobile/`입니다. 기존 소스와 배포 자료를 보존했습니다. 로컬 Git만 초기화했으며 커밋, 원격 연결, 저장소 생성, 업로드는 수행하지 않았습니다.

## 1. 기존 폴더 추가

1. GitHub Desktop을 열고 필요한 경우 본인 계정으로 로그인합니다.
2. **File → Add local repository…**를 선택합니다.
3. Local path에 `D:\porting\ed4-mobile`을 지정하고 **Add repository**를 누릅니다. `docs`만 선택하거나 새 폴더를 만들지 않습니다.
4. 현재 브랜치가 `main`인지 확인합니다. 아직 커밋이 없는 저장소입니다.

[GitHub 공식 로컬 저장소 추가 안내](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)

## 2. 변경 목록 확인 후 직접 커밋·공개

1. **Changes**에서 앱 소스, 설정, 문서, `LICENSE`, `public/sources/emulators-0.73.8-source.zip`과 **docs 전체**가 포함되어 있는지 확인합니다.
2. 특히 `docs/index.html`, `docs/.nojekyll`, `docs/vendor/wdosbox.wasm`, `docs/dos-worker.js`, `docs/sw.js`, `docs/manifest.webmanifest`, `docs/licenses/`, `docs/sources/`를 확인합니다. 대응 소스 ZIP은 압축 상태로 유지합니다.
3. `node_modules`, `dist`, `artifacts`, `research`, 테스트 결과, 게임 원본, RAW, 세이브, 개인 파일은 목록에 없어야 합니다. `.gitignore`는 알려진 형식/폴더를 제외하지만 임의 이름의 개인 파일을 자동 판별하지는 못합니다. 게임은 이 프로젝트 폴더 밖에 보관하세요.
4. Summary에 `Prepare GitHub Pages deployment`를 입력하고 사용자가 **Commit to main**을 누릅니다.
5. **Publish repository**를 누르고 Name을 정확히 `ed4-mobile`로 지정합니다. 무료 계정에서 Pages를 사용할 경우 **Keep this code private**를 해제하여 Public 저장소로 만듭니다. 공개되는 것은 검토한 런처와 대응 소스입니다.
6. 내용을 확인한 뒤 사용자가 **Publish repository**를 누릅니다. 같은 이름의 원격 저장소가 이미 있다면 이 절차로 덮어쓰지 말고 중단하여 기존 저장소 연결 방법을 확인하세요.

[GitHub 공식 Publish 안내](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop?platform=windows)

## 3. GitHub Pages 설정

1. Desktop의 **Repository → View on GitHub**로 저장소를 엽니다.
2. **Settings → Pages → Build and deployment**로 이동합니다.
3. Source: **Deploy from a branch**.
4. Branch: **main**, Folder: **/docs**, **Save**.
5. GitHub의 Pages 배포 작업 완료를 기다리고 Pages 설정에 실제로 표시된 주소를 엽니다. 실패하면 해당 배포 로그를 확인합니다. 별도 npm 빌드용 Actions 파일은 필요 없습니다.

`docs/.nojekyll`이 Jekyll 처리를 비활성화합니다. `docs/`는 게시 원본 폴더이므로 웹 주소에는 `/docs/`가 붙지 않습니다. 예상 형식은 `https://<본인-아이디>.github.io/ed4-mobile/`이며 **이 문서의 예시는 생성되거나 검증된 주소가 아닙니다.**

[GitHub 공식 Pages 브랜치·폴더 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 4. 배포 후 Galaxy 확인

먼저 **실행 환경 확인하기**로 공개 DOS 테스트를 실행하고 방향키·저장·종료·재실행을 확인합니다. 오프라인 준비 완료 표시 후 새로고침과 오프라인 실행도 확인합니다. 이어 사용자 게임을 Galaxy 브라우저 안에서 등록합니다. 폴더 선택을 지원하면 폴더를 먼저 사용하고 RAW 없는 본체부터 시험하세요. 게임, 음악, 세이브는 GitHub에 올리지 않습니다.

실제 ED4 시작 화면·한글·전투·저장·BGM 및 Galaxy 멀티터치·회전·전체 화면은 미검증입니다. 실패하면 진단 JSON을 내려받아 전달하세요. 자세한 실기 순서는 `ANDROID_TEST_GUIDE.md`를 참고합니다.

localhost의 IndexedDB/OPFS는 새 HTTPS origin으로 자동 이전되지 않습니다. 필요한 세이브는 백업 ZIP으로 내보내고 새 주소에서 복원한 뒤 원본을 연결하세요. 같은 GitHub 계정의 여러 프로젝트는 origin을 공유할 수 있습니다.

## 5. 이후 소스 수정·재배포

PowerShell에서 다음을 실행합니다. `docs/`는 재생성되는 전용 출력 폴더이므로 직접 편집하거나 사용자 파일을 넣지 마세요.

```powershell
cd D:\porting\ed4-mobile
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:pages
npm.cmd run check:desktop
```

새 환경에서는 먼저 `npm.cmd ci`로 의존성을 설치합니다. 로컬 확인은 `node scripts/serve-pages.mjs` 실행 후 `http://localhost:4173/ed4-mobile/`에서 합니다. 서버 종료는 Ctrl+C입니다. `index.html`을 더블클릭하여 실행하지 않습니다.

사용자가 Desktop에서 소스와 갱신된 `docs/`를 함께 검토·커밋하고 **Push origin**하면 Pages가 갱신됩니다. 저장소 이름을 바꾸면 Vite base를 다시 맞추고 빌드해야 합니다. 기존 `dist/`와 `ed4-mobile-deploy.zip`은 이전 수동 웹 업로드용 보존 자료이며 이번 Desktop 배포에는 사용하지 않습니다.

일반 Git 저장소 제한은 파일당 **100 MiB**입니다. `check:desktop`은 Git 후보 파일과 배포 파일을 검사하고 초과 파일을 보고하며 삭제·분할하지 않습니다. 검증 결과는 `DEPLOY_CHECK_REPORT.md`, 세부 목록은 로컬 `artifacts/desktop-deploy/git-file-audit.json`에 있습니다. [GitHub 공식 용량 제한](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
