import {storageKey} from './app-storage';
export type PlayEngine = 'stable'|'phase9-7'|'phase9-8k';
export const PLAY_PREFERENCE_KEY=storageKey('ed4-play-engine-v2');
// v1 predates ordinary speed support. Retain it, but do not treat that old
// limited choice as an opt-out. Only a new explicit choice overrides default K.
export function preferredPlayEngine(storage:Pick<Storage,'getItem'>):PlayEngine{
 try{const value=storage.getItem(PLAY_PREFERENCE_KEY);if(value==='stable'||value==='phase9-7'||value==='phase9-8k')return value;}catch{}
 return 'phase9-8k';
}
export function rememberPlayEngine(storage:Pick<Storage,'setItem'>,value:string){
 if(value!=='stable'&&value!=='phase9-7'&&value!=='phase9-8k')return;
 try{storage.setItem(PLAY_PREFERENCE_KEY,value);}catch{}
}
