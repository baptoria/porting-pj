export async function enterLandscape(
  element: HTMLElement,
  notice: (message: string) => void,
) {
  try {
    if (!document.fullscreenElement) await element.requestFullscreen();
  } catch {
    notice("전체 화면을 사용할 수 없습니다. 기기를 가로로 회전하세요.");
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (!orientation?.lock) throw Error();
    await orientation.lock("landscape");
  } catch {
    notice(
      "방향 잠금을 지원하지 않거나 허용하지 않았습니다. 기기를 가로로 회전하세요.",
    );
  }
}
