import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {strToU8 as b,unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {DEFAULT_SETTINGS,type Profile,type Archive} from '../src/model';
import {planPcSaveExport,exportPcSave,pcOriginalPaths} from '../src/pc-save-export';
import {readPcSaves,planPcSaveImport,pcSaveResult} from '../src/pc-save-import';
import {normalizeSave} from '../src/save-state';
import {exportBackup,importBackup} from '../src/backup';
import {putSave,getSave,database,recoveryPoints} from '../src/storage';
const p:Profile={id:'export',name:'original',baseId:'a',patchIds:[],gameId:'ed4',engineId:'js-dos-v7',kind:'vanilla',executable:'GAME.BAT',settings:{...DEFAULT_SETTINGS},createdAt:1};
const source={'SAVE/ED4_S000.DAT':b('base slot'),'SAVE/ED4_S001.DAT':b('original second'),'SAVE/ED4_98.CFG':b('cfg'),'SAVE/ED4_S99_.DAT':b('consumed'),'SAVE/DATA_B.DAT':b('unknown'),'SAVE/LOCAL.SAV':b('custom'),'SAVE/HELP.TXT':b('not supported'),'SAVE/GAME.EXE':b('MZ'),'SAVE/MUSIC.RAW':b('raw'),'SAVE/ED4.ISO':b('iso'),'GAME.BAT':b('game'),'EFFECT/001.EFC':b('resource')};
const saved=()=>normalizeSave({profileId:p.id,profile:p,updatedAt:7,files:{'SAVE/ED4_S000.DAT':b('current slot'),'SAVE/ED4_S002.DAT':b('new slot')},tombstones:['SAVE/ED4_S99_.DAT'],resources:{'MOD.DAT':b('mod'),'SAVE/ED4_98.CFG':b('new cfg')},resourceTombstones:['SAVE/ED4_S001.DAT']});
const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
const defaults=(plan:ReturnType<typeof planPcSaveExport>)=>plan.rows.filter(r=>r.known&&r.allowed).map(r=>r.path);
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));afterEach(()=>vi.unstubAllGlobals());
it('exports effective slots/CFG only by default, excludes both tombstone sets and launcher format',()=>{
 const save=saved(),before=structuredClone({source,save}),plan=planPcSaveExport(p,source,save),files=unzipSync(exportPcSave(plan,defaults(plan)));
 expect(Object.keys(files)).toEqual(['SAVE/ED4_98.CFG','SAVE/ED4_S000.DAT','SAVE/ED4_S002.DAT']);
 expect(files['SAVE/ED4_S000.DAT']).toEqual(b('current slot'));expect(files['SAVE/ED4_98.CFG']).toEqual(b('new cfg'));
 expect(plan.deleted).toEqual(['SAVE/ED4_S99_.DAT','SAVE/ED4_S001.DAT']);expect(plan.rows.find(r=>r.path==='SAVE/DATA_B.DAT')?.known).toBe(false);
 expect({source,save}).toEqual(before);
});
it('unknown DAT/SAV requires explicit selection; non-save formats remain blocked even with forged selection',()=>{
 const plan=planPcSaveExport(p,source,saved());expect(Object.keys(unzipSync(exportPcSave(plan,['SAVE/LOCAL.SAV'])))).toEqual(['SAVE/LOCAL.SAV']);
 for(const path of ['SAVE/GAME.EXE','SAVE/MUSIC.RAW','SAVE/ED4.ISO','SAVE/HELP.TXT','GAME.BAT','EFFECT/001.EFC','../SAVE/A.DAT'])expect(()=>exportPcSave(plan,[path])).toThrow();
 expect(unzipSync(exportPcSave(plan,['SAVE/DATA_B.DAT']))['SAVE/DATA_B.DAT']).toEqual(b('unknown'));
});
it('nested registration yields SAVE/ in ZIP and preserves available original filename case',async()=>{
 const nested={...p,executable:'ED4/GAME.BAT'},input={'ED4/SAVE/ED4_S000.DAT':b('slot'),'ED4/SAVE/ED4_98.CFG':b('config'),'SAVE/OTHER.DAT':b('other installation')};
 const plan=planPcSaveExport(nested,input,undefined,{'ED4/SAVE/ED4_S000.DAT':'Package/Ed4/Save/Ed4_s000.dat','ED4/SAVE/ED4_98.CFG':'Ed4/Save/ED4_98.CFG'});
 const zip=exportPcSave(plan,defaults(plan)),files=unzipSync(zip);expect(Object.keys(files)).toEqual(['SAVE/ED4_98.CFG','SAVE/Ed4_s000.dat']);
 const entries=await readPcSaves([new File([zip as BlobPart],'ED4_PC_SAVE.zip')],'zip'),imported=planPcSaveImport(nested,{},undefined,entries,'merge'),next=pcSaveResult(imported,imported.rows.map(r=>r.path));
 for(const path of Object.keys(next.files)){expect(next.files[path]).toEqual(input[path as keyof typeof input]);expect(hash(next.files[path])).toBe(hash(input[path as keyof typeof input]));}
});
it('module round trip retains all selected bytes/hashes; launcher backup remains its original format',async()=>{
 const save=saved(),plan=planPcSaveExport(p,source,save),selected=defaults(plan),zip=exportPcSave(plan,selected),entries=await readPcSaves([new File([zip as BlobPart],'ED4_PC_SAVE.zip')],'zip');
 const imported=planPcSaveImport(p,source,save,entries,'merge'),next=pcSaveResult(imported,selected);
 for(const path of selected){expect(next.files[path]).toEqual(plan.files[path]);expect(hash(next.files[path])).toBe(hash(plan.files[path]));}
 expect(next.tombstones).toContain('SAVE/ED4_S99_.DAT');
 const launcher=exportBackup(p,save);expect(unzipSync(launcher)['ED4-BACKUP.JSON']).toBeDefined();expect(unzipSync(launcher)['FILES/SAVE/ED4_S000.DAT']).toBeDefined();expect(importBackup(launcher,p).files).toEqual(save.files);
});
it('winning mod filenames and bytes are isolated; read-only export never writes storage/recovery',async()=>{
 const a:Archive={id:'a',name:'base',files:source,size:1,createdAt:1,originalPaths:{'SAVE/ED4_S000.DAT':'Save/Ed4_s000.dat'}};
 const patch:Archive={...a,id:'patch',files:{'SAVE/ED4_S000.DAT':b('mod slot')},originalPaths:{}};
 const mod={...p,id:'mod',patchIds:['patch'],kind:'patch' as const};
 expect(pcOriginalPaths(mod,[a,patch])['SAVE/ED4_S000.DAT']).toBe('SAVE/ED4_S000.DAT');
 await putSave(saved());await putSave({...saved(),profileId:'mod',files:{'SAVE/ED4_S000.DAT':b('mod save')}});
 const db=await database();await db.put('archives',a);await db.put('archives',patch);await db.put('profiles',p);await db.put('profiles',mod);
 const before=await Promise.all(['archives','profiles','saves','recovery'].map(s=>db.getAll(s as 'saves')));
 const base=planPcSaveExport(p,source,await getSave(p.id)),mp=planPcSaveExport(mod,{...source,...patch.files},await getSave(mod.id));
 expect(unzipSync(exportPcSave(base,defaults(base)))['SAVE/ED4_S000.DAT']).toEqual(b('current slot'));
 expect(unzipSync(exportPcSave(mp,defaults(mp)))['SAVE/ED4_S000.DAT']).toEqual(b('mod save'));
 expect(await Promise.all(['archives','profiles','saves','recovery'].map(s=>db.getAll(s as 'saves')))).toEqual(before);expect(await recoveryPoints(p.id)).toHaveLength(0);
 expect(()=>planPcSaveExport(mod,source,saved())).toThrow('다른 프로필');
});
it('empty selection, oversized file, ambiguous long paths, and bad metadata cannot produce unsafe output',()=>{
 const plan=planPcSaveExport(p,{'SAVE/LONGFILENAME.DAT':b('x'),'SAVE/ED4_S001.DAT':new Uint8Array(8*1024*1024+1)});
 expect(()=>exportPcSave(plan,[])).toThrow();for(const r of plan.rows)expect(r.allowed).toBe(false);
 const normal=planPcSaveExport(p,source,undefined,{'SAVE/ED4_S000.DAT':'../../BAD.EXE'});
 expect(normal.rows.find(r=>r.path==='SAVE/ED4_S000.DAT')?.output).toBe('SAVE/ED4_S000.DAT');
 expect(()=>exportPcSave(normal,['SAVE/ED4_S000.DAT','SAVE/ED4_S000.DAT'])).toThrow();
});
it.skipIf(!process.env.ED4_PC_SAVE_ROOT)('read-only PC fixtures export and reimport without changing bytes; unknown DATA_B never default',async()=>{
 for(const folder of ['SAVE','ED4/SAVE']){
  const root=join(process.env.ED4_PC_SAVE_ROOT!,folder),files:Record<string,Uint8Array>={};
  for(const name of await readdir(root))if(/\.(DAT|CFG|SAV)$/i.test(name))files['SAVE/'+name.toUpperCase()]=new Uint8Array(await readFile(join(root,name)));
  const plan=planPcSaveExport(p,files);expect(defaults(plan)).not.toContain('SAVE/DATA_B.DAT');const zip=exportPcSave(plan,defaults(plan));
  const entries=await readPcSaves([new File([zip as BlobPart],'ED4_PC_SAVE.zip')],'zip');
  for(const entry of entries){expect(entry.bytes).toEqual(files[entry.path]);expect(hash(entry.bytes)).toBe(hash(files[entry.path]));}
 }
});
