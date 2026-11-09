import {it,expect} from 'vitest';
import {createRuntime} from '../src/archive';
import {checkRequirements} from '../src/integrity';
import {exportBackup,importBackup} from '../src/backup';
import {DEFAULT_SETTINGS,type Profile,type Archive} from '../src/model';
import {unzipSync} from 'fflate';
const p:Profile={id:'mod-test',gameId:'ed4',engineId:'js-dos-v7',name:'modified',kind:'standalone',baseId:'base',patchIds:[],executable:'MOD.COM',settings:{...DEFAULT_SETTINGS},createdAt:0,archiveIdentities:{base:{versionId:'old',sha256:'a'.repeat(64)}},requiredBaseVersion:'old'};
const files={'MOD.COM':new Uint8Array([0xcd,0x20]),'GAME.EXE':new Uint8Array([77,90,1,2,3]),'DATA.DAT':new Uint8Array(333),'TRACK.RAW':new Uint8Array(19),'EFFECT.EFC':new Uint8Array(7)};
const a:Archive={id:'base',name:'user-mod',files,size:366,createdAt:0,sha256:'b'.repeat(64),versionId:'user-mod'};
it('different game hashes and EXE COM DAT RAW sizes do not block or alter runtime files',()=>{
 const before=structuredClone(a),profile=structuredClone(p);
 expect(checkRequirements(p,[a])).toHaveLength(2);
 const z=unzipSync(createRuntime(p,[a]));for(const [name,b]of Object.entries(files))expect(z[name]).toEqual(b);
 expect(a).toEqual(before);expect(p).toEqual(profile);
});
it('missing executable and missing patch remain actual file errors',()=>{
 expect(()=>createRuntime({...p,executable:'ABSENT.COM'},[a])).toThrow();
 expect(()=>checkRequirements({...p,patchIds:['absent']},[a])).toThrow('모드 파일');
});
it('same-profile save restore allows changed game identity; other profiles remain isolated',()=>{
 const old={...p,archiveIdentities:{base:{versionId:'previous',sha256:'c'.repeat(64)}}};
 const saved={profileId:p.id,files:{'TEST.SAV':new Uint8Array([7,8])},updatedAt:0,profile:old};
 const zip=exportBackup(old,saved);expect(importBackup(zip,p).files).toEqual(saved.files);
 expect(()=>importBackup(zip,{...p,id:'other'})).toThrow('다른 프로필');
});
