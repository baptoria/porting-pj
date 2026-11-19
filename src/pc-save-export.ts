import { zipSync } from 'fflate';
import { canonicalPath, validateTree } from './archive';
import type { Archive, Files, Profile, Save } from './model';
import { normalizeSave, deletedFiles } from './save-state';
import { effectiveFiles } from './temp-save';
import { pcSaveRoot, PC_SAVE_EXTENSION, PC_SAVE_SHORT_NAME, PC_SAVE_LIMITS } from './pc-save-paths';

export interface PcExportRow { path:string; output:string; size:number; known:boolean; allowed:boolean; reason:string }
export interface PcExportPlan { profileId:string; root:string; rows:PcExportRow[]; files:Files; deleted:string[] }
/** Use only metadata from the winning registered layer; never invent aliases. */
export function pcOriginalPaths(profile:Profile, archives:Archive[]) {
  const names:Record<string,string>=Object.create(null);
  for(const id of [profile.baseId,...profile.patchIds]){
    const a=archives.find(a=>a.id===id);if(!a)throw Error('게임/모드 데이터가 없습니다.');
    for(const path of Object.keys(a.files))names[path]=a.originalPaths?.[path]??path;
  }
  return names;
}
export function planPcSaveExport(profile:Profile, source:Files, save?:Save, originalPaths:Record<string,string>={}):PcExportPlan {
  if(save&&save.profileId!==profile.id)throw Error('다른 프로필의 세이브는 내보낼 수 없습니다.');
  const prior=save?normalizeSave(save):undefined, effective=effectiveFiles(source,prior),root=pcSaveRoot(profile),rows:PcExportRow[]=[],files:Files=Object.create(null);
  for(const path of Object.keys(effective).sort()){
    if(!path.startsWith(root))continue;
    if(canonicalPath(path)!==path)throw Error('저장 경로가 정규화되지 않았습니다.');
    const tail=path.slice(root.length), data=effective[path],short=tail.split('/').every(p=>PC_SAVE_SHORT_NAME.test(p));
    let name=tail;
    const original=originalPaths[path];
    if(original){
      // Original relative names may retain a container prefix removed during registration.
      const parts=original.replace(/\\/g,'/').split('/'), count=tail.split('/').length;
      const candidate=parts.slice(-count).join('/');
      try{if(canonicalPath(candidate)===tail)name=candidate;}catch{/* Stored DOS spelling remains authoritative. */}
    }
    const allowed=short&&PC_SAVE_EXTENSION.test(path)&&data.byteLength<=PC_SAVE_LIMITS.file;
    const known=!tail.includes('/')&&(/^ED4_S[^/]*\.DAT$/.test(tail)||tail==='ED4_98.CFG');
    const reason=!short?'지원하지 않는 DOS 경로':!PC_SAVE_EXTENSION.test(path)?'실행 파일·음악·리소스 또는 지원하지 않는 형식: 제외':data.byteLength>PC_SAVE_LIMITS.file?'파일당 8 MiB 제한 초과':known?'확인된 슬롯/설정 이름 · 기본 선택':'용도 미확인 · 세이브인지 확인 후 개별 선택';
    rows.push({path,output:'SAVE/'+name,size:data.byteLength,known,allowed,reason});
    if(allowed)files[path]=data;
  }
  return {profileId:profile.id,root,rows,files,deleted:deletedFiles(prior).filter(p=>p.startsWith(root))};
}
/** Read-only plain DOS ZIP. No launcher manifest, recovery metadata or tombstones. */
export function exportPcSave(plan:PcExportPlan, selected:string[]):Uint8Array {
  if(!selected.length||selected.length>PC_SAVE_LIMITS.count||new Set(selected).size!==selected.length)throw Error('내보낼 세이브를 1~512개 선택해주세요.');
  const rows=new Map(plan.rows.map(r=>[r.path,r])), files:Files=Object.create(null);let size=0;
  for(const path of selected){
    const row=rows.get(path),data=plan.files[path];
    if(!row?.allowed||!data)throw Error('내보낼 수 없는 파일입니다: '+path);
    const output=canonicalPath(row.output);
    if(output!=='SAVE/'+path.slice(plan.root.length)||!PC_SAVE_EXTENSION.test(output)||!path.startsWith(plan.root))throw Error('PC 세이브 출력 경로 오류');
    if(data.length>PC_SAVE_LIMITS.file||(size+=data.length)>PC_SAVE_LIMITS.total)throw Error('전체 32 MiB 이하로 파일을 나누어 선택해주세요.');
    files[row.output]=data;
  }
  validateTree(files);
  const zip=zipSync(files,{level:6});
  if(zip.length>PC_SAVE_LIMITS.total)throw Error('ZIP이 32 MiB를 넘습니다. 파일을 나누어 선택해주세요.');
  return zip;
}
