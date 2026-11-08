# GitHub Desktop 배포 안내

대상 프로젝트: `D:\porting\ed4-mobile`, 앱 0.5.0, 저장소 이름 `porting-pj`.
빌드 결과는 `docs/`, ED4 빌드는 `docs/ed4/`, 웹 base는 `/porting-pj/ed4/`입니다. 기존 소스와 배포 자료를 보존했습니다. 기존 Git 이력과 원격 설정은 보존했습니다. 이번 작업은 커밋·원격 연결·저장소 생성·업로드를 수행하지 않았습니다.

## 1. 기존 폴더 추가

1. GitHub Desktop을 열고 필요한 경우 본인 계정으로 로그인합니다.
2. **File → Add local repository…**를 선택합니다.
3. Local path에 `D:\porting\ed4-mobile`을 지정하고 **Add repository**를 누릅니다. `docs`만 선택하거나 새 폴더를 만들지 않습니다.
4. 현재 브랜치가 `main`인지 확인합니다. 기존 커밋을 유지한 저장소입니다.

[GitHub 공식 로컬 저장소 추가 안내](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)

## 2. 변경 목록 확인 후 직접 커밋·Push

이미 연결한 `porting-pj` 저장소에서 변경을 커밋한 뒤 **Push origin**을 사용하세요. 기존 저장소와 원격 연결을 유지합니다.

기존 docs 루트의 앱 파일 삭제와 docs/ed4/의 새 파일을 함께 커밋해야 합니다. 루트에는 안내 페이지와 .nojekyll 및 이전 서비스 워커 정리용 sw.js가 남습니다.

1. **Changes**에서 앱 소스, 설정, 문서, `LICENSE`, `public/sources/emulators-0.73.8-source.zip`과 **docs 전체**가 포함되어 있는지 확인합니다.
2. 특히 `docs/index.html`, `docs/.nojekyll`, `docs/sw.js`, `docs/ed4/index.html`, `docs/ed4/vendor/wdosbox.wasm`, `docs/ed4/dos-worker.js`, `docs/ed4/sw.js`, `docs/ed4/manifest.webmanifest`, `docs/ed4/licenses/`, `docs/ed4/sources/`를 확인합니다. 대응 소스 ZIP은 압축 상태로 유지합니다.
3. `node_modules`, `dist`, `artifacts`, `research`, 테스트 결과, 게임 원본, RAW, 세이브, 개인 파일은 목록에 없어야 합니다. `.gitignore`는 알려진 형식/폴더를 제외하지만 임의 이름의 개인 파일을 자동 판별하지는 못합니다. 게임은 이 프로젝트 폴더 밖에 보관하세요.
4. Summary에 `Move ED4 Pages to /porting-pj/ed4/`를 입력하고 사용자가 **Commit to main**을 누릅니다.
5. 사용자가 **Push origin**을 눌러 기존 원격 저장소에 반영합니다. 새로운 저장소를 생성하거나 원격 URL을 바꾸지 않습니다.

## 3. GitHub Pages 설정

1. Desktop의 **Repository → View on GitHub**로 저장소를 엽니다.
2. **Settings → Pages → Build and deployment**로 이동합니다.
3. Source: **Deploy from a branch**.
4. Branch: **main**, Folder: **/docs**, **Save**.
5. GitHub의 Pages 배포 작업 완료를 기다리고 Pages 설정에 실제로 표시된 주소를 엽니다. 실패하면 해당 배포 로그를 확인합니다. 별도 npm 빌드용 Actions 파일은 필요 없습니다.

`docs/.nojekyll`이 Jekyll 처리를 비활성화합니다. `docs/`는 게시 원본 폴더이므로 웹 주소에는 `/docs/`가 붙지 않습니다. 예상 형식은 `https://<본인-아이디>.github.io/porting-pj/ed4/`이며 **이 문서의 예시는 생성되거나 검증된 주소가 아닙니다.**

[GitHub 공식 Pages 브랜치·폴더 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 4. 배포 후 Galaxy 확인

먼저 **실행 환경 확인하기**로 공개 DOS 테스트를 실행하고 방향키·저장·종료·재실행을 확인합니다. 오프라인 준비 완료 표시 후 새로고침과 오프라인 실행도 확인합니다. 이어 사용자 게임을 Galaxy 브라우저 안에서 등록합니다. 폴더 선택을 지원하면 폴더를 먼저 사용하고 RAW 없는 본체부터 시험하세요. 게임, 음악, 세이브는 GitHub에 올리지 않습니다.

실제 ED4 시작 화면·한글·전투·저장·BGM 및 Galaxy 멀티터치·회전·전체 화면은 미검증입니다. 실패하면 진단 JSON을 내려받아 전달하세요. 자세한 실기 순서는 `GALAXY_TEST_GUIDE.md`를 참고합니다.

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

새 환경에서는 먼저 `npm.cmd ci`로 의존성을 설치합니다. 로컬 확인은 `node scripts/serve-pages.mjs` 실행 후 `http://localhost:4173/porting-pj/ed4/`에서 합니다. 서버 종료는 Ctrl+C입니다. `index.html`을 더블클릭하여 실행하지 않습니다.

사용자가 Desktop에서 소스와 갱신된 `docs/`를 함께 검토·커밋하고 **Push origin**하면 Pages가 갱신됩니다. 저장소 이름을 바꾸면 Vite base를 다시 맞추고 빌드해야 합니다. 기존 `dist/`와 `ed4-mobile-deploy.zip`은 이전 수동 웹 업로드용 보존 자료이며 이번 Desktop 배포에는 사용하지 않습니다.

일반 Git 저장소 제한은 파일당 **100 MiB**입니다. `check:desktop`은 Git 후보 파일과 배포 파일을 검사하고 초과 파일을 보고하며 삭제·분할하지 않습니다. 현재 검증 결과는 `PATH_MIGRATION_REPORT.md`, 세부 목록은 로컬 `artifacts/desktop-deploy/git-file-audit.json`에 있습니다. [GitHub 공식 용량 제한](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
