import type { DosEngine } from "./engine";
export const KEY: Record<string, number> = {
  Escape: 256,
  Enter: 257,
  Tab: 258,
  Backspace: 259,
  Insert: 260,
  Delete: 261,
  ArrowRight: 262,
  ArrowLeft: 263,
  ArrowDown: 264,
  ArrowUp: 265,
  PageUp: 266,
  PageDown: 267,
  Home: 268,
  End: 269,
  CapsLock: 280,
  ShiftLeft: 340,
  ControlLeft: 341,
  AltLeft: 342,
  ShiftRight: 344,
  ControlRight: 345,
  AltRight: 346,
  Space: 32,
  Minus: 45,
  Equal: 61,
  BracketLeft: 91,
  BracketRight: 93,
  Backslash: 92,
  Semicolon: 59,
  Quote: 39,
  Backquote: 96,
  Comma: 44,
  Period: 46,
  Slash: 47,
};
for (let i = 1; i <= 12; i++) KEY[`F${i}`] = 289 + i;
for (let i = 65; i <= 90; i++) KEY[`Key${String.fromCharCode(i)}`] = i;
for (let i = 0; i <= 9; i++) KEY[`Digit${i}`] = 48 + i;
export function bindControls(
  container: HTMLElement,
  getEngine: () => DosEngine | undefined,
) {
  const held = new Map<string, number>();
  const press = (source: string, code: number) => {
    if (!held.has(source)) {
      held.set(source, code);
      getEngine()?.key(code, true);
    }
  };
  const release = (source: string) => {
    const code = held.get(source);
    held.delete(source);
    if (code !== undefined && ![...held.values()].includes(code))
      getEngine()?.key(code, false);
  };
  const clear = () => {
    held.clear();
    getEngine()?.releaseKeys();
  };
  container.addEventListener("pointerdown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-key]",
    );
    if (!button) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(`pointer-${event.pointerId}`, Number(button.dataset.key));
    button.classList.add("pressed");
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    container.addEventListener(name, (event) => {
      const e = event as PointerEvent;
      release(`pointer-${e.pointerId}`);
      (e.target as HTMLElement).classList.remove("pressed");
    });
  window.addEventListener("keydown", (e) => {
    if (
      !getEngine() ||
      (e.target as HTMLElement).matches("input,select,textarea") ||
      e.metaKey ||
      (e.ctrlKey && !["ControlLeft", "ControlRight"].includes(e.code))
    )
      return;
    if (KEY[e.code] !== undefined) {
      e.preventDefault();
      press(e.code, KEY[e.code]);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (held.has(e.code)) {
      e.preventDefault();
      release(e.code);
    }
  });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);
  return clear;
}
