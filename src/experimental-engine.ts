import {INTEGRATED_SPEED_ENGINE} from './generated/phase9-8h-engine';
import { BGM_BOUNDARY_ENGINE } from './generated/phase9-8d-engine';
import { BGM_LINK_ENGINE } from './generated/phase9-8f-engine';
import { BGM_ENGINE } from './generated/phase9-8c-engine';
export const REBOOT_ENGINE={id:'phase9-2',wasmSha256:'d9278a71b7b63ea3f461847ca9a3974df054f65c4c280aea7f5811981e0a46fc',
 directory:'vendor/experimental/phase9-2/'} as const;
export async function verifiedModule(bytes:ArrayBuffer,expected:string){
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(sha256!==expected)throw Error(`실험 엔진 SHA-256 불일치 (${sha256}). 실행을 중단했습니다. 온라인에서 앱 업데이트 후 다시 시도하세요. 기존 게임·저장은 유지됩니다.`);
 return {module:await WebAssembly.compile(bytes),sha256};
}
export const CPU_TRACE_ENGINE={id:'phase9-3',wasmSha256:'a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b',directory:'vendor/experimental/phase9-3/'} as const;
export const FIRST_TRACE_ENGINE={id:'phase9-4',wasmSha256:'13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738',directory:'vendor/experimental/phase9-4/'} as const;
export const MEMORY_COMPAT_ENGINE={id:'phase9-5b',wasmSha256:'81ee12956f39cc0b8ffc1ef5b1a5b6bd282231af253fde598aa70eb826f89e9a',directory:'vendor/experimental/phase9-5b/'} as const;
export const PERFORMANCE_ENGINE={id:'phase9-6',wasmSha256:'f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3',directory:'vendor/experimental/phase9-6/'} as const;
// Host audio adapter experiment: exactly the reviewed Phase 9-6 WASM/Worker.
export const AUDIO_ENGINE={...PERFORMANCE_ENGINE,id:'phase9-7'} as const;
export type ExperimentalEngineId='phase9-2'|'phase9-3'|'phase9-4'|'phase9-5b'|'phase9-6'|'phase9-7'|'phase9-8c'|'phase9-8d'|'phase9-8f'|'phase9-8h';
export const experimentalEngine=(id:ExperimentalEngineId)=>id==='phase9-8h'?INTEGRATED_SPEED_ENGINE:id==='phase9-8f'?BGM_LINK_ENGINE:id==='phase9-8d'?BGM_BOUNDARY_ENGINE:id==='phase9-8c'?BGM_ENGINE:id==='phase9-7'?AUDIO_ENGINE:id==='phase9-6'?PERFORMANCE_ENGINE:id==='phase9-5b'?MEMORY_COMPAT_ENGINE:id==='phase9-4'?FIRST_TRACE_ENGINE:id==='phase9-3'?CPU_TRACE_ENGINE:REBOOT_ENGINE;
export async function prepareRebootEngine(id:ExperimentalEngineId='phase9-2'){
 const engine=experimentalEngine(id);
 const response=await fetch(`${import.meta.env.BASE_URL}${engine.directory}wdosbox.wasm`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`실험 엔진 파일을 불러오지 못했습니다 (${response.status}). 온라인에서 업데이트하거나 안정 엔진을 선택하세요.`);
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>4*1024*1024)throw Error('실험 엔진 크기가 예상 범위를 벗어났습니다. 실행을 중단했습니다.');
 return verifiedModule(bytes,engine.wasmSha256);
}
