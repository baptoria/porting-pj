import BUILD from './build-info.json';
/** Public error receipt, not the developer diagnostics export. Never include
 * logs, file names, profile/save content, paths or the raw exception message. */
export function supportReceipt(message: string, stage: string, artifact?: {id:string;wasmSha256?:string}) {
  const category = /공간|Quota/i.test(message)?'storage-capacity':/무결성|SHA|해시|hash/i.test(message)?'integrity':/배속|오디오|AudioWorklet|AudioContext/i.test(message)?'speed-or-audio':/Worker|WASM|RuntimeError/i.test(message)?'engine-runtime':/저장|복구|세이브/.test(message)?'save-or-recovery':/파일|폴더|등록/.test(message)?'registration-or-file':'unclassified';
  return {format:'ed4-public-error',version:1,buildId:BUILD.id,at:new Date().toISOString(),category,
    stage:['준비','시작 중','실행 중','일시 정지','시작 실패','종료됨','실행 오류 · 진단 확인'].includes(stage)?stage:'other',
    engine:artifact&&/^(stable|phase9-[a-z0-9-]+)$/.test(artifact.id)?{id:artifact.id,wasmSha256:/^[a-f0-9]{64}$/.test(artifact.wasmSha256??'')?artifact.wasmSha256:undefined}:undefined,
    note:'Error category only; no file contents, names, logs or raw exception. Describe the visible error separately.'};
}
