import type { DosSettings, Files } from './model';
export type ComparisonMode='manual'|'baseline'|'nosound'|'no-raw';
export function runtimeComparison(mode:Exclude<ComparisonMode,'manual'>,files:Files,currentEntry:string,settings:DosSettings){
  const folder=currentEntry.includes('/')?currentEntry.slice(0,currentEntry.lastIndexOf('/')+1):'';
  const games=Object.keys(files).filter(p=>/(^|\/)GAME\.BAT$/.test(p));
  const game=files[folder+'GAME.BAT']?folder+'GAME.BAT':games.length===1?games[0]:undefined;
  if(!game)throw Error('GAME.BAT가 없거나 여러 경로에 있습니다. 원본 구조를 확인하세요.');
  const entry=mode==='nosound'?game.replace(/GAME\.BAT$/,'NOSOUND.BAT'):game;
  if(!files[entry])throw Error('같은 설치 폴더의 NOSOUND.BAT가 없습니다. 파일을 생성하거나 다른 설치본과 섞지 않습니다.');
  return {entry,settings:{...settings,sound:'sb16' as const},rawMounted:mode!=='no-raw',mode,
    baselineEntry:game,changedFactor:mode==='nosound'?'entry':mode==='no-raw'?'raw-mount':'none'};
}
