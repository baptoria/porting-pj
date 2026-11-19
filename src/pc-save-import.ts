import type { Files, Profile, Save } from './model';
import { canonicalPath, readZip, validateTree } from './archive';
import { zipEntries } from './zip-index';
import { deletedFiles, normalizeSave } from './save-state';
import { effectiveFiles, equalBytes, type RecoveryPoint } from './temp-save';
import { commitProtectedSave } from './storage';
import { exportBackup } from './backup';

import { PC_SAVE_LIMITS, PC_SAVE_EXTENSION as extension, PC_SAVE_SHORT_NAME as shortName, pcSaveRoot } from './pc-save-paths';
export { PC_SAVE_LIMITS, pcSaveRoot } from './pc-save-paths';
export interface PcSaveEntry { path: string; bytes: Uint8Array }
export interface PcSaveRow { path: string; input?: string; action: 'add'|'overwrite'|'revive'|'same'|'delete'; bytes: number }
export interface PcSavePlan {
  profile: Profile; expected?: Save; incoming: Files; rows: PcSaveRow[];
  backup: Save; root: string; mode: 'merge'|'replace';
}
function inScope(path: string, root: string) { return path.startsWith(root) && extension.test(path); }
function limits(entries: {size: number}[]) {
  if (!entries.length || entries.length > PC_SAVE_LIMITS.count) throw Error('세이브 파일을 1~512개 선택해주세요.');
  if(entries.some(f=>f.size > PC_SAVE_LIMITS.file) || entries.reduce((n,f)=>n+f.size,0)>PC_SAVE_LIMITS.total)
    throw Error('세이브는 파일당 8 MiB, 전체 32 MiB까지 가져올 수 있습니다. 게임 본체가 포함되지 않았는지 확인해주세요.');
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for(const b of bytes){crc ^= b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
/** Read only explicitly selected saves; never reuse game/ISO/RAW import. */
export async function readPcSaves(files: File[], kind: 'files'|'folder'|'zip'): Promise<PcSaveEntry[]> {
  if(kind==='zip') {
    if(files.length!==1 || files[0].size>PC_SAVE_LIMITS.total) throw Error('32 MiB 이하의 세이브 ZIP 하나를 선택해주세요.');
    const index=await zipEntries(files[0]), leaves=index.filter(e=>!e.directory);
    limits(leaves);
    const seen=new Set<string>();
    for(const e of index){if(seen.has(e.path))throw Error('ZIP 중복 경로: '+e.path);seen.add(e.path);}
    for(const e of leaves)if(!extension.test(e.path))throw Error('세이브 전용 ZIP을 선택해주세요. 제외할 파일: '+e.path);
    const unpacked=readZip(new Uint8Array(await files[0].arrayBuffer()));
    return leaves.map(e=>{
      const bytes=unpacked[e.path];
      if(!bytes || bytes.length!==e.size || crc32(bytes)!==e.crc)throw Error('ZIP 데이터가 손상되었습니다: '+e.path);
      return {path:e.originalPath,bytes};
    });
  }
  // A real SAVE directory can also contain manually archived ZIPs. They are not imported recursively.
  if(kind==='folder')files=files.filter(f=>extension.test(f.name));
  limits(files);
  const paths=files.map(f=>kind==='folder'?f.webkitRelativePath:f.name);
  // Fail before reading bytes of accidentally selected game resources.
  paths.forEach(path=>{canonicalPath(path);if(!extension.test(path))throw Error('DAT·CFG·SAV 세이브만 선택해주세요. 다른 파일이 포함되어 있습니다: '+path);});
  const entries: PcSaveEntry[]=[];
  for(let i=0;i<files.length;i++)entries.push({path:paths[i],bytes:new Uint8Array(await files[i].arrayBuffer())});
  return entries;
}

export function planPcSaveImport(profile: Profile, source: Files, previous: Save|undefined, entries: PcSaveEntry[], mode: 'merge'|'replace'): PcSavePlan {
  if(previous && previous.profileId!==profile.id)throw Error('다른 프로필의 저장 자료입니다.');
  limits(entries.map(e=>({size:e.bytes.byteLength})));
  const root=pcSaveRoot(profile), incoming:Files=Object.create(null), inputs=new Map<string,string>(), origins=new Set<string>();
  for(const entry of entries){
    const input=canonicalPath(entry.path), parts=input.split('/'), at=parts.indexOf('SAVE');
    if(at<0 && parts.length!==1)throw Error('SAVE 폴더의 상대 경로를 확인할 수 없습니다: '+input);
    if(at>=0 && parts.lastIndexOf('SAVE')!==at)throw Error('중첩된 SAVE 폴더는 자동으로 합치지 않습니다. 하나의 SAVE 폴더만 선택해주세요.');
    origins.add(at<0?'(files)':parts.slice(0,at).join('/'));
    const tail=at<0?parts:parts.slice(at+1);
    if(!tail.length || !extension.test(tail.at(-1)!) || tail.some(p=>!shortName.test(p)))throw Error('DOS 8.3 형식의 DAT·CFG·SAV 저장 경로만 지원합니다: '+input);
    const path=canonicalPath(root+tail.join('/'));
    if(incoming[path])throw Error('같은 DOS 경로로 겹치는 세이브입니다: '+path);
    incoming[path]=entry.bytes.slice();inputs.set(path,entry.path);
  }
  if(origins.size!==1)throw Error('여러 설치본의 SAVE 폴더가 섞여 있습니다. 한 설치본의 세이브만 선택해주세요.');
  validateTree(incoming);
  const prior=previous?normalizeSave(previous):undefined, effective=effectiveFiles(source,prior), deleted=new Set(deletedFiles(prior));
  validateTree({...effective,...incoming});
  const rows:PcSaveRow[]=Object.keys(incoming).sort().map(path=>({path,input:inputs.get(path),bytes:incoming[path].length,
    action:deleted.has(path)?'revive':effective[path]?(equalBytes(effective[path],incoming[path])?'same':'overwrite'):'add'}));
  if(mode==='replace')for(const path of Object.keys(effective).sort())if(inScope(path,root)&&!incoming[path])rows.push({path,action:'delete',bytes:effective[path].length});
  // Include effective original saves as well as existing deltas; preserve consumed-file tombstones.
  const files={...prior?.files};
  for(const [path,bytes]of Object.entries(effective))if(inScope(path,root)&&!prior?.resources?.[path])files[path]=bytes;
  const backup=normalizeSave({...prior,profileId:profile.id,profile,files,updatedAt:prior?.updatedAt??Date.now()});
  return {profile,expected:prior,incoming,rows,backup,root,mode};
}

export function pcSaveResult(plan: PcSavePlan, selected: string[]): Save {
  const prior=plan.expected, files={...prior?.files},resources={...prior?.resources};
  const removed=new Set(prior?.tombstones??[]), resourceRemoved=new Set(prior?.resourceTombstones??[]);
  const rows=new Map(plan.rows.map(r=>[r.path,r]));
  if(!selected.length || new Set(selected).size!==selected.length)throw Error('적용할 파일을 선택해주세요.');
  for(const path of selected){
    const row=rows.get(path);if(!row||!inScope(path,plan.root))throw Error('확인하지 않은 저장 경로입니다.');
    delete files[path];delete resources[path];removed.delete(path);resourceRemoved.delete(path);
    if(row.action==='delete')removed.add(path);else files[path]=plan.incoming[path];
  }
  return normalizeSave({...prior,profileId:plan.profile.id,profile:plan.profile,files,resources,tombstones:[...removed],resourceTombstones:[...resourceRemoved],updatedAt:Date.now(),
    ...(prior?.tempSaveObservation?{tempSaveObservation:{...prior.tempSaveObservation,absentAfterPresent:prior.tempSaveObservation.absentAfterPresent.filter(p=>removed.has(p)||resourceRemoved.has(p))}}:{})});
}
export function pcSaveBackup(plan: PcSavePlan){return exportBackup(plan.profile,plan.backup);}
export async function applyPcSaveImport(plan: PcSavePlan, selected: string[]) {
  const next=pcSaveResult(plan,selected);
  const point:RecoveryPoint={id:crypto.randomUUID(),profileId:plan.profile.id,sessionId:crypto.randomUUID(),createdAt:Date.now(),kind:'before-restore',candidatePaths:[],save:plan.backup,
    note:'PC 세이브 가져오기 직전 상태. 삭제된 임시 저장은 삭제 상태로 보존하며 게임 메모리 진행은 포함하지 않습니다.'};
  // Exact previous-value guard plus save/recovery atomic transaction, including quota failure rollback.
  await commitProtectedSave(plan.profile.id,plan.expected,next,point);
}
