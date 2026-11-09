import type { DosEngine } from "./engine";
import {KeyOwners} from "./play-input";
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
  const held=new KeyOwners((code,down)=>getEngine()?.key(code,down));
  const buttons=new Map<number,HTMLButtonElement>();let directionPointer:number|undefined;
  const pad=container.querySelector<HTMLElement>('#direction-pad');
  const highlight=()=>container.querySelectorAll('[data-key]').forEach(b=>b.classList.toggle('pressed',[...buttons.values()].includes(b as HTMLButtonElement)));
  const clear=()=>{held.clear();buttons.clear();directionPointer=undefined;highlight();getEngine()?.releaseKeys();};
  const move=(e:PointerEvent)=>{
    if(!pad||e.pointerId!==directionPointer)return;
    const b=[...pad.querySelectorAll<HTMLButtonElement>('[data-key]')].find(b=>{const r=b.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom;});
    held.set('direction',b?[Number(b.dataset.key)]:[]);
    if(b)buttons.set(e.pointerId,b);else buttons.delete(e.pointerId);highlight();
  };
  container.addEventListener('pointerdown',e=>{
    if((e.target as HTMLElement).closest('#direction-pad [data-key]')){
      e.preventDefault();if(directionPointer!==undefined)return;directionPointer=e.pointerId;
      try{pad?.setPointerCapture(e.pointerId);}catch{/* Synthetic events have no active pointer. */}
      move(e);return;
    }
    const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-key]');if(!b)return;
    e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch{}
    buttons.set(e.pointerId,b);held.set(`pointer-${e.pointerId}`,[Number(b.dataset.key)]);b.classList.add('pressed');
  });
  container.addEventListener('pointermove',move);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(name,event=>{
    const e=event as PointerEvent;if(e.pointerId===directionPointer){held.set('direction',[]);directionPointer=undefined;}
    held.set(`pointer-${e.pointerId}`,[]);const b=buttons.get(e.pointerId);buttons.delete(e.pointerId);
    if(b&&![...buttons.values()].includes(b))b.classList.remove('pressed');
  });
  window.addEventListener('keydown',e=>{
    if(!getEngine()||(e.target as HTMLElement).closest('input,select,textarea,dialog,button')||e.metaKey||(e.ctrlKey&&!['ControlLeft','ControlRight'].includes(e.code)))return;
    if(KEY[e.code]!==undefined){e.preventDefault();held.set(e.code,[KEY[e.code]]);}
  });
  window.addEventListener('keyup',e=>{if(KEY[e.code]!==undefined)held.set(e.code,[]);});
  window.addEventListener('blur',clear);window.addEventListener('resize',clear);window.addEventListener('orientationchange',clear);
  document.addEventListener('visibilitychange',clear);document.addEventListener('fullscreenchange',clear);
  window.addEventListener('ed4-release-input',clear);screen.orientation?.addEventListener('change',clear);
  return clear;
}
