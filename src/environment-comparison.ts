import type {Files} from './model';
export type EnvironmentMode='pc-baseline'|'pc-mixer-nosound';
export function environmentNosound(mode:EnvironmentMode){
 if(mode!=='pc-baseline'&&mode!=='pc-mixer-nosound')throw Error('지원하지 않는 환경 비교입니다.');
 return mode==='pc-mixer-nosound';
}
// Only generated diagnostic BATs receive the identical observation commands.
// CONFIG -get reads the DOSBox property and sets the shell's CONFIG variable;
// it does not attest to the guest's later runtime or a physical device state.
export function environmentQueries(stage:'BEFORE'|'AFTER'){
 return ['mixer nosound','cpu cycles'].map((q,i)=>`@ECHO E4ENV ${stage} ${i} BEGIN\r\n@CONFIG -get "${q}"\r\n@ECHO.\r\n@ECHO E4ENV END\r\n`).join('');
}
export function observeEnvironmentBatch(files:Files,entry:string){
 if(!files[entry])throw Error('생성된 진단 BAT가 없습니다.');
 const text=(s:string)=>Uint8Array.from(s,c=>c.charCodeAt(0));
 const prefix=text(environmentQueries('BEFORE')),suffix=text(environmentQueries('AFTER')),original=files[entry];
 const out=new Uint8Array(prefix.length+original.length+suffix.length);out.set(prefix);out.set(original,prefix.length);out.set(suffix,prefix.length+original.length);
 return {...files,[entry]:out};
}
export class EnvironmentObservation {
 private tail='';
 readonly samples:{stage:'BEFORE'|'AFTER';key:string;value:string}[]=[];
 accept(text:string){
  this.tail=(this.tail+text).slice(-8192);let end=0;
  for(const m of this.tail.matchAll(/E4ENV (BEFORE|AFTER) ([01]) BEGIN\s*([a-zA-Z0-9 .%\-]+?)\s*E4ENV END/g)){
   const stage=m[1] as 'BEFORE'|'AFTER',key=m[2]==='0'?'mixer.nosound':'cpu.cycles',value=m[3].trim();end=m.index!+m[0].length;
   if(value.length>64||(key==='mixer.nosound'&&!/^(true|false)$/.test(value)))continue;
   if(!this.samples.some(s=>s.stage===stage&&s.key===key))this.samples.push({stage,key,value});
  }this.tail=this.tail.slice(end);
 }
}
export async function executableIdentities(files:Files,entry:string){
 const dir=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'';
 return Promise.all(['ED4.EXE','DRIVER.EXE','LOADER.COM','LOGO.EXE','RTM.EXE','DPMI16BI.OVL','GAME.BAT','NOSOUND.BAT','SOUNDRV.COM'].map(async name=>{
  const b=files[dir+name];if(!b)return {name,present:false};
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b as Uint8Array<ArrayBuffer>)),v=>v.toString(16).padStart(2,'0')).join('');
  let mz:undefined|{cs:number;ip:number;ss:number;sp:number;minAlloc:number;maxAlloc:number};
  if(name==='ED4.EXE'&&b.length>=28&&b[0]===77&&b[1]===90){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);mz={cs:v.getUint16(22,true),ip:v.getUint16(20,true),ss:v.getUint16(14,true),sp:v.getUint16(16,true),minAlloc:v.getUint16(10,true),maxAlloc:v.getUint16(12,true)};}
  return {name,present:true,bytes:b.length,sha256,mz};
 }));
}
