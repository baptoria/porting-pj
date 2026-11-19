import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { zipSync,strToU8 } from 'fflate';
import { readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { planPcSaveImport,pcSaveResult,pcSaveBackup,applyPcSaveImport,readPcSaves,PC_SAVE_LIMITS } from '../src/pc-save-import';
import { DEFAULT_SETTINGS,type Profile,type Save } from '../src/model';
import { normalizeSave,reconcileSave,deletedFiles } from '../src/save-state';
import { importBackup } from '../src/backup';
import { effectiveFiles,restoredSave } from '../src/temp-save';
import { getSave,putSave,recoveryPoints,database } from '../src/storage';
const b=strToU8,temp='SAVE/ED4_S99_.DAT';
const p:Profile={id:'pc',name:'mod profile',baseId:'original',patchIds:[],gameId:'ed4',engineId:'js-dos-v7',kind:'vanilla',createdAt:1,executable:'GAME.BAT',settings:{...DEFAULT_SETTINGS}};
const source={'GAME.BAT':b('GAME'),[temp]:b('original temp'),'SAVE/ED4_98.CFG':b('config'),'MOD.DAT':b('mod'),'EFFECT/MUSIC.RAW':b('music')};
const prior=()=>normalizeSave({profileId:p.id,profile:p,updatedAt:1,files:{'SAVE/SLOT1.DAT':b('old'),'NOTES.SAV':b('other save')},tombstones:[temp],resources:{'MOD.DAT':b('modified')},resourceTombstones:['EFFECT/OLD.EFC'],tempSaveObservation:{sessionId:'old',absentAfterPresent:[temp]}});
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('loose files merge into current DOS SAVE path, retain resource bytes and unrelated tombstones',()=>{
 const old=prior(),original=structuredClone(source),plan=planPcSaveImport(p,source,old,[{path:'Slot1.dat',bytes:b('PC')},{path:'ED4_98.cfg',bytes:b('PC config')}],'merge');
 expect(plan.rows.map(r=>r.action)).toEqual(['overwrite','overwrite']);
 const next=pcSaveResult(plan,plan.rows.map(r=>r.path));
 expect(next.files['SAVE/SLOT1.DAT']).toEqual(b('PC'));expect(next.files['NOTES.SAV']).toEqual(old.files['NOTES.SAV']);
 expect(next.resources).toEqual(old.resources);expect(next.resourceTombstones).toEqual(old.resourceTombstones);expect(next.tombstones).toContain(temp);
 expect(source).toEqual(original);expect(old).toEqual(prior());
});
it('selected SAVE subtree maps relative to nested executable without flattening subdirectories',()=>{
 const plan=planPcSaveImport({...p,executable:'ED4/GAME.BAT'},{},undefined,[{path:'PC/SAVE/Sub/Slot1.dat',bytes:b('a')}],'merge');
 expect(plan.rows[0].path).toBe('ED4/SAVE/SUB/SLOT1.DAT');expect(plan.rows[0].input).toBe('PC/SAVE/Sub/Slot1.dat');
});
it('unchecked overwrite and consumed temp are preserved; explicitly selected temp clears only its tombstone',()=>{
 const plan=planPcSaveImport(p,source,prior(),[{path:'ED4_S99_.DAT',bytes:b('new temp')},{path:'SLOT1.DAT',bytes:b('new slot')}],'merge');
 expect(plan.rows.find(r=>r.path===temp)?.action).toBe('revive');
 const kept=pcSaveResult(plan,['SAVE/SLOT1.DAT']);expect(kept.tombstones).toContain(temp);
 const revived=pcSaveResult(plan,[temp]);expect(revived.tombstones).not.toContain(temp);expect(revived.tempSaveObservation?.absentAfterPresent).toEqual([]);expect(revived.files['SAVE/SLOT1.DAT']).toEqual(b('old'));
 const consumed=reconcileSave(p,revived,{files:{},presentPaths:Object.keys(effectiveFiles(source,revived)).filter(x=>x!==temp)},Object.keys(source));
 expect(consumed.tombstones).toContain(temp);expect(effectiveFiles(source,consumed)[temp]).toBeUndefined();
});
it('replacement lists missing saves as explicit deletions, does not resurrect original or touch resources',()=>{
 const plan=planPcSaveImport(p,source,prior(),[{path:'NEW.DAT',bytes:b('new')}],'replace');
 expect(plan.rows.filter(r=>r.action==='delete').map(r=>r.path)).toEqual(['SAVE/ED4_98.CFG','SAVE/SLOT1.DAT']);
 const next=pcSaveResult(plan,plan.rows.map(r=>r.path));expect(next.tombstones).toEqual(expect.arrayContaining([temp,'SAVE/ED4_98.CFG','SAVE/SLOT1.DAT']));
 expect(effectiveFiles(source,next)['SAVE/ED4_98.CFG']).toBeUndefined();expect(next.resources).toEqual(prior().resources);expect(next.files['NOTES.SAV']).toEqual(b('other save'));
});
it('backup includes effective original saves, preserves consumed absence, round-trips through existing importer',()=>{
 const plan=planPcSaveImport(p,source,prior(),[{path:'A.DAT',bytes:b('new')}],'merge'), restored=importBackup(pcSaveBackup(plan),p);
 expect(restored.files['SAVE/ED4_98.CFG']).toEqual(b('config'));expect(restored.files[temp]).toBeUndefined();expect(deletedFiles(restored)).toContain(temp);
 expect(restored.resources).toEqual(prior().resources);expect(restored.files['GAME.BAT']).toBeUndefined();expect(restored.files['EFFECT/MUSIC.RAW']).toBeUndefined();
});
it('atomic import backs up first, supports existing recovery, and leaves other profiles untouched',async()=>{
 const old=prior();await putSave(old);await putSave({...old,profileId:'other'});
 const db=await database();await db.put('archives',{id:'original',name:'original',files:source,size:1,createdAt:1});await db.put('profiles',p);
 const plan=planPcSaveImport(p,source,old,[{path:'A.DAT',bytes:b('new')}],'replace');await applyPcSaveImport(plan,plan.rows.map(r=>r.path));
 const point=(await recoveryPoints(p.id))[0];expect(point.kind).toBe('before-restore');expect(point.save.files['SAVE/ED4_98.CFG']).toEqual(b('config'));
 const rollback=restoredSave(p,await getSave(p.id),source,point);expect(effectiveFiles(source,rollback)).toEqual(effectiveFiles(source,old));
 expect(await getSave('other')).toEqual({...old,profileId:'other'});expect((await db.get('archives','original'))?.files).toEqual(source);expect(await db.get('profiles',p.id)).toEqual(p);
});
it('stale preview cannot overwrite a newer save or create a recovery point',async()=>{
 const plan=planPcSaveImport(p,source,prior(),[{path:'A.DAT',bytes:b('a')}],'merge');const newer={...prior(),updatedAt:99};await putSave(newer);
 await expect(applyPcSaveImport(plan,['SAVE/A.DAT'])).rejects.toThrow('다른 탭');expect(await getSave(p.id)).toEqual(newer);expect(await recoveryPoints(p.id)).toHaveLength(0);
});
it('transaction write failure rolls back both new save and new recovery; prior point survives',async()=>{
 await putSave(prior());const plan=planPcSaveImport(p,source,prior(),[{path:'A.DAT',bytes:b('a')}],'merge');
 const db=await database();await db.put('recovery',{id:'oldpoint',profileId:p.id,sessionId:'old',createdAt:1,kind:'before-restore',candidatePaths:[],save:prior(),note:'keep'});
 const original=IDBObjectStore.prototype.put;vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){if(this.name==='saves')throw new DOMException('full','QuotaExceededError');return original.apply(this,args);});
 await expect(applyPcSaveImport(plan,['SAVE/A.DAT'])).rejects.toThrow('full');expect(await getSave(p.id)).toEqual(prior());expect((await recoveryPoints(p.id)).map(p=>p.id)).toEqual(['oldpoint']);
});
it('quota preflight retains old state',async()=>{
 await putSave(prior());vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:99,quota:100})}});
 const plan=planPcSaveImport(p,source,prior(),[{path:'A.DAT',bytes:b('a')}],'merge');await expect(applyPcSaveImport(plan,['SAVE/A.DAT'])).rejects.toThrow();expect(await getSave(p.id)).toEqual(prior());expect(await recoveryPoints(p.id)).toHaveLength(0);
});
for(const path of ['../SLOT.DAT','C:/SAVE/A.DAT','/SAVE/A.DAT','SAVE/GAME.EXE','SAVE/MUSIC.RAW','SAVE/TOOL.BAT','SAVE/A.DAT/../B.DAT','OTHER/A.DAT','SAVE/NUL.DAT','SAVE/LONGFILENAME.DAT','SAVE/한글.DAT'])it('rejects unsafe or non-save destination '+path,()=>{
 expect(()=>planPcSaveImport(p,source,undefined,[{path,bytes:b('x')}],'merge')).toThrow();
});
it('rejects multiple installations, aliases and file/directory collisions',()=>{
 for(const paths of [['A/SAVE/ONE.DAT','B/SAVE/TWO.DAT'],['SAVE/a.dat','SAVE/A.DAT'],['SAVE/SAVE/A.DAT']])expect(()=>planPcSaveImport(p,{},undefined,paths.map(path=>({path,bytes:b('a')})),'merge')).toThrow();
 expect(()=>planPcSaveImport(p,{'SAVE':b('file')},undefined,[{path:'A.DAT',bytes:b('a')}],'merge')).toThrow('충돌');
});
it('bounded file and ZIP inputs, CRC corruption, encryption and traversal fail without storage writes',async()=>{
 const zip=zipSync({'SAVE/A.DAT':b('hello')},{level:0}), file=(bytes:Uint8Array)=>new File([bytes as BlobPart],'save.zip');
 expect((await readPcSaves([file(zip)],'zip'))[0]).toEqual({path:'SAVE/A.DAT',bytes:b('hello')});
 const corrupt=zip.slice();corrupt[30+'SAVE/A.DAT'.length]^=1;await expect(readPcSaves([file(corrupt)],'zip')).rejects.toThrow('손상');
 await expect(readPcSaves([file(zipSync({'../A.DAT':b('x')}))],'zip')).rejects.toThrow();
 await expect(readPcSaves([file(zipSync({'SAVE/A.DAT':b('x'),'GAME.EXE':b('MZ')}))],'zip')).rejects.toThrow('전용 ZIP');
 await expect(readPcSaves([new File([new Uint8Array(PC_SAVE_LIMITS.file+1)],'A.DAT')],'files')).rejects.toThrow('8 MiB');
 const encrypted=zip.slice();const view=new DataView(encrypted.buffer);for(let i=0;i<encrypted.length-10;i++)if(view.getUint32(i,true)===0x02014b50)view.setUint16(i+8,1,true);
 await expect(readPcSaves([file(encrypted)],'zip')).rejects.toThrow('암호화');
});
it('SAVE folder skips nested ZIP archives without reading or unpacking them',async()=>{
 const a=new File([b('data')],'A.DAT'),archive=new File([b('not read')],'개인 백업.zip');Object.defineProperty(a,'webkitRelativePath',{value:'SAVE/A.DAT'});Object.defineProperty(archive,'webkitRelativePath',{value:'SAVE/개인 백업.zip'});
 vi.spyOn(archive,'arrayBuffer').mockRejectedValue(Error('must not read'));expect(await readPcSaves([a,archive],'folder')).toEqual([{path:'SAVE/A.DAT',bytes:b('data')}]);
});
it.skipIf(!process.env.ED4_PC_SAVE_ROOT)('read-only real PC saves round-trip exactly; no game execution',async()=>{
 for(const folder of ['SAVE','ED4/SAVE']){
  const root=join(process.env.ED4_PC_SAVE_ROOT!,folder),entries=[];
  for(const name of await readdir(root))if(/\.(DAT|CFG|SAV)$/i.test(name))entries.push({path:'SAVE/'+name,bytes:new Uint8Array(await readFile(join(root,name)))});
  const plan=planPcSaveImport(p,{},undefined,entries,'merge'),next=pcSaveResult(plan,plan.rows.map(r=>r.path));
  await applyPcSaveImport(plan,plan.rows.map(r=>r.path));expect((await getSave(p.id))?.files).toEqual(next.files);
  for(const entry of entries)expect(next.files[entry.path.toUpperCase()]).toEqual(new Uint8Array(await readFile(join(root,entry.path.slice(5)))));
  await (await database()).delete('saves',p.id);
 }
});
it('recovery point creation failure prevents save apply and preserves previous recovery',async()=>{
 await putSave(prior());const plan=planPcSaveImport(p,source,prior(),[{path:'A.DAT',bytes:b('a')}],'merge');
 const db=await database();await db.put('recovery',{id:'oldpoint',profileId:p.id,sessionId:'old',createdAt:1,kind:'before-restore',candidatePaths:[],save:prior(),note:'keep'});
 const original=IDBObjectStore.prototype.add;vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){if(this.name==='recovery')throw new DOMException('recovery full','QuotaExceededError');return original.apply(this,args);});
 await expect(applyPcSaveImport(plan,['SAVE/A.DAT'])).rejects.toThrow('recovery full');expect(await getSave(p.id)).toEqual(prior());expect((await recoveryPoints(p.id)).map(p=>p.id)).toEqual(['oldpoint']);
});
