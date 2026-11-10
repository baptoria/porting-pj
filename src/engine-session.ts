import {requireDeveloperTools} from './build-policy';
import type {ExperimentalEngineId} from './experimental-engine';

export type NormalEngineId='phase9-7'|'phase9-8k';
export type EngineSession =
 | {id:NormalEngineId;discardWrites:false;purpose:'normal-play'}
 | {id:NormalEngineId;discardWrites:true;purpose:'recovery-preview'}
 | {id:ExperimentalEngineId;discardWrites:true;cyclesPolicy?:number};

/** Explicit admission to the existing save pipeline, never inferred from a rate. */
export function validateEngineSession(session?:EngineSession){
 if(!session)return;
 if('purpose' in session){
  if(!['phase9-7','phase9-8k'].includes(session.id)||'cyclesPolicy' in session||
    !(session.purpose==='normal-play'&&session.discardWrites===false||session.purpose==='recovery-preview'&&session.discardWrites===true))
   throw Error('일반 실행 또는 복구 미리보기 설정이 올바르지 않습니다. 기존 저장은 유지됩니다.');
  return;
 }
 requireDeveloperTools();
 if(session.discardWrites!==true||!['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6','phase9-7','phase9-8c','phase9-8d','phase9-8f','phase9-8h','phase9-8i','phase9-8k'].includes(session.id))
  throw Error('실험 엔진은 저장하지 않는 일회성 진단에서만 사용할 수 있습니다.');
}
