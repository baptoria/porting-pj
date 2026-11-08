import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { analyzeLaunch, launchChoice } from "../src/launch-analysis";
import { DEFAULT_SETTINGS, type Files, type Profile } from "../src/model";
import { database, getSave, putProfile, putSave, listCatalog } from "../src/storage";
import { exportBackup, recoverProfile } from "../src/backup";
import { zipEntries } from "../src/zip-index";
import { zipSync } from "fflate";
import { importAdvice } from "../src/simple-registration";
import { musicDB, resolvedTracks } from "../src/music";
import { reconnectArchive } from "../src/storage";
const text = (s:string)=>new TextEncoder().encode(s);
const program = new Uint8Array([0xb8,0,0x4c,0xcd,0x21]);
const files = (bat:string, extra:Files = {}):Files=>({'GAME.BAT':text(bat),'ED4.EXE':program,...extra});
describe('Phase 5 conservative execution selection',()=>{
  it('uses original GAME.BAT with the observed initialization order',()=>{
    const result=analyzeLaunch(files('@echo off\r\nSOUNDRV.COM\r\nDRIVER.EXE\r\nED4.EXE',{'SOUNDRV.COM':program,'DRIVER.EXE':program}));
    expect(result.automatic).toBe('GAME.BAT');
    expect(launchChoice(result,'GAME.BAT',false).initialization).toEqual(['SOUNDRV.COM','DRIVER.EXE','ED4.EXE']);
  });
  it('blocks a missing driver and names it',()=>{
    const result=analyzeLaunch(files('SOUNDRV.COM\r\nED4.EXE'));
    expect(result.automatic).toBeUndefined();expect(result.candidates.find(c=>c.path==='GAME.BAT')?.missing).toEqual(['SOUNDRV.COM']);
    expect(()=>launchChoice(result,'GAME.BAT',true)).toThrow('SOUNDRV.COM');
  });
  it('resolves CALL and changed working directories without generating commands',()=>{
    const result=analyzeLaunch(files('cd SOUND\r\ncall INIT.BAT\r\ncd ..\r\nED4.EXE',{'SOUND/INIT.BAT':text('DRIVER.COM'),'SOUND/DRIVER.COM':program}));
    expect(result.automatic).toBe('GAME.BAT');
    expect(result.candidates.find(c=>c.path==='GAME.BAT')?.initialization).toEqual(['SOUND/INIT.BAT','SOUND/DRIVER.COM','ED4.EXE']);
  });
  it('requires a choice for variables and preserves that explicit choice',()=>{
    const result=analyzeLaunch(files('SET BLASTER=A220 I7 D1\nED4.EXE'));
    expect(result.automatic).toBeUndefined();expect(launchChoice(result,'GAME.BAT',true).source).toBe('user-choice');
    expect(()=>launchChoice(result,'GAME.BAT',false)).toThrow('선택');
  });
  it.each(['IF EXIST ED4.EXE ED4.EXE','GOTO START','FOR %A IN (*) DO ED4.EXE','ED4.EXE > OUT.TXT','ED4.EXE & DRIVER.EXE'])('does not auto-execute unsupported syntax: %s',bat=>{
    expect(analyzeLaunch(files(bat)).automatic).toBeUndefined();
  });
  it('rejects recursive batch flow as an automatic candidate',()=>{
    expect(analyzeLaunch(files('call GAME.BAT')).automatic).toBeUndefined();
  });
  it('does not guess execution order from driver/game names',()=>{
    expect(analyzeLaunch({'DRIVER.EXE':program,'ED4.EXE':program,'SOUNDRV.COM':program}).automatic).toBeUndefined();
  });
  it('only auto-selects a sole executable without GAME.BAT',()=>{
    expect(analyzeLaunch({'START.COM':program}).automatic).toBe('START.COM');
    expect(analyzeLaunch({'START.COM':program,'NOSOUND.BAT':text('START.COM')}).automatic).toBeUndefined();
  });
  it('checks EFFECT RAW references using music inventory',()=>{
    expect(analyzeLaunch(files('ED4.EXE EFFECT\\FX.RAW'),['EFFECT/FX.RAW']).automatic).toBe('GAME.BAT');
    expect(analyzeLaunch(files('ED4.EXE EFFECT\\FX.RAW')).candidates.find(c=>c.path==='GAME.BAT')?.missing).toContain('EFFECT/FX.RAW');
  });
  it('blocks PE entry and PE drivers called from a BAT',()=>{
    const pe=new Uint8Array(100);pe.set([77,90]);pe[60]=80;pe.set([80,69],80);
    expect(analyzeLaunch(files('ED4.EXE',{'ED4.EXE':pe})).candidates.every(c=>c.blocked)).toBe(true);
  });
  it('does not invent short aliases for long execution folders',()=>{
    const result=analyzeLaunch({'LONGFOLDER/GAME.BAT':text('ED4.EXE'),'LONGFOLDER/ED4.EXE':program});
    expect(result.automatic).toBeUndefined();expect(result.candidates.every(c=>c.blocked)).toBe(true);
  });
  it('requires a choice for an unrecognized BAT encoding',()=>{
    expect(analyzeLaunch({'GAME.BAT':new Uint8Array([255,254,65,0]),'ED4.EXE':program}).automatic).toBeUndefined();
  });
  it('unknown DOS/PATH commands require a choice without inventing a missing executable',()=>{
    const result=analyzeLaunch(files('KEYB US\rED4.EXE'));
    expect(result.automatic).toBeUndefined();expect(result.candidates.find(c=>c.path==='GAME.BAT')?.missing).toEqual([]);
    expect(launchChoice(result,'GAME.BAT',true).source).toBe('user-choice');
  });
  it('detects the non-returning BAT chain before following commands',()=>{
    expect(analyzeLaunch(files('SOUND.BAT\nED4.EXE',{'SOUND.BAT':text('DRIVER.COM'),'DRIVER.COM':program})).automatic).toBeUndefined();
  });
  it('retains original ZIP spelling alongside case-insensitive DOS keys',async()=>{
    const entries=await zipEntries(new Blob([new Uint8Array(zipSync({'Effect/Fx.Raw':new Uint8Array(12),'Game.bat':text('ED4.EXE')}))]));
    expect(entries.map(e=>[e.path,e.originalPath])).toEqual([['EFFECT/FX.RAW','Effect/Fx.Raw'],['GAME.BAT','Game.bat']]);
  });
});
const profile=(key:string):Profile=>({id:key,gameId:'ed4',engineId:'js-dos-v7',name:key,kind:'vanilla',baseId:key+'-base',patchIds:[],executable:'ED4.EXE',settings:{...DEFAULT_SETTINGS},createdAt:1});
it('cancelled registration cannot overwrite existing profile or save',async()=>{
  const p=profile('cancel-unit');await putProfile(p);await putSave({profileId:p.id,files:{'TEST.SAV':program},updatedAt:5});
  const signal=AbortSignal.abort();await expect(putProfile({...p,name:'changed'},[],signal)).rejects.toThrow();
  expect((await listCatalog()).profiles.find(x=>x.id===p.id)?.name).toBe(p.name);
  expect((await getSave(p.id))?.files['TEST.SAV']).toEqual(program);
});
it('IDB write failure rolls back both profile and archive registration',async()=>{
  const p=profile('transaction-unit');const db=await database();
  const bad={id:p.baseId,name:'bad',files:{'ED4.EXE':program},size:5,createdAt:1,uncloneable:()=>0};
  await expect(putProfile(p,[bad])).rejects.toThrow();
  expect(await db.get('archives',p.baseId)).toBeUndefined();expect(await db.get('profiles',p.id)).toBeUndefined();expect(await db.get('catalog',p.baseId)).toBeUndefined();
});
it('v2 backup preserves one-time execution selection and no source bytes',()=>{
  const p=profile('backup-unit');p.launch=launchChoice(analyzeLaunch(files('SET BLASTER=A220\nED4.EXE')),'GAME.BAT',true);p.executable='GAME.BAT';
  const zip=exportBackup(p,{profileId:p.id,files:{'TEST.SAV':program},updatedAt:1});
  const restored=recoverProfile(zip);expect(restored.profile.launch).toEqual(p.launch);expect(restored.profile.executable).toBe('GAME.BAT');expect(Object.keys(restored.save.files)).toEqual(['TEST.SAV']);
});
it('quota and abort errors provide actionable preservation messages',()=>{
  expect(importAdvice(new DOMException('quota','QuotaExceededError'))).toContain('백업');
  expect(importAdvice(new DOMException('cancel','AbortError'))).toContain('기존 게임과 저장은 유지');
});
it('music overlays replace only equal paths and retain original pack metadata',async()=>{
 const db=await musicDB();
 const track=(path:string)=>({path,key:path,size:12,sha256:'',header:''});
 await db.put('packs',{id:'base-music',tracks:[track('A.RAW'),track('EFFECT/B.RAW')],name:'base',bytes:24,createdAt:1});
 await db.put('packs',{id:'patch-music',tracks:[track('A.RAW')],name:'patch',bytes:12,createdAt:1});
 const p=profile('overlay');p.music={packId:'base-music',prefix:'',overlays:[{packId:'patch-music',prefix:''}]};
 expect((await resolvedTracks(p)).map(t=>[t.path,t.packId])).toEqual([['A.RAW','patch-music'],['EFFECT/B.RAW','base-music']]);
 expect((await db.get('packs','base-music')).tracks).toHaveLength(2);
 const restored=recoverProfile(exportBackup(p,{profileId:p.id,files:{},updatedAt:1}));expect(restored.profile.music).toEqual(p.music);
});
it('reconnecting the same original replaces only its proven music reference and keeps saves',async()=>{
 const p=profile('reconnect-music');p.music={packId:'old-music',prefix:'',sourceArchiveId:p.baseId,overlays:[{packId:'other-music',prefix:'',sourceArchiveId:'patch-id'}]};
 const a={id:p.baseId,name:'original',files:{'ED4.EXE':program},size:5,createdAt:1,sha256:'a'.repeat(64),musicPackId:'old-music'};
 await putProfile(p,[a]);await putSave({profileId:p.id,files:{'TEST.SAV':program},updatedAt:1,profile:p});
 await reconnectArchive({...a,musicPackId:'new-music'});
 const restored=(await listCatalog()).profiles.find(v=>v.id===p.id)!;
 expect(restored.music?.packId).toBe('new-music');expect(restored.music?.overlays?.[0].packId).toBe('other-music');expect((await getSave(p.id))?.files['TEST.SAV']).toEqual(program);
});
