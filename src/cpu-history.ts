// Only bounded numeric metadata from the separately verified Phase 9-3 engine.
const kinds=['other','far-jmp','indirect-far-jmp','retf','iret','interrupt','near-jmp','indirect-near-jmp','near-call','far-call','indirect-far-call','near-ret','conditional-branch','loop','hlt','callback-opcode','control-register-group','segment-load','host-enter','host-return','core-gap-enter','core-gap-return','cpu-api'] as const;
const cores=['unknown-or-hlt','normal','normal-trap','simple','full','prefetch'] as const;
const uint=(v:unknown,max=0xffffffff):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
type Raw=Record<string,unknown>;
const object=(v:unknown):Raw|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Raw:undefined;
function state(value:unknown){
 const v=object(value);if(!v)return;
 for(const k of ['cs','ss','psp'])if(!uint(v[k],65535))return;
 for(const k of ['ip','linear','csBase','flags','cr0'])if(!uint(v[k]))return;
 if(!uint(v.mode,2)||!uint(v.core,5))return;
 return {cs:v.cs as number,ip:v.ip as number,linear:v.linear as number,csBase:v.csBase as number,ss:v.ss as number,flags:v.flags as number,cr0:v.cr0 as number,psp:v.psp as number,mode:['real','protected','v86'][v.mode],core:cores[v.core]};
}
function record(value:unknown){
 const v=object(value);if(!v)return;
 for(const k of ['sequence','epoch','execId','rebootSequence','apiMask','interruptType'])if(!uint(v[k]))return;
 if(!uint(v.kind,22)||!uint(v.source,3)||v.source===0||v.complete!==true||!(v.interruptNumber===null||uint(v.interruptNumber,255)))return;
 const before=state(v.before),after=state(v.after);if(!before||!after)return;
 return {sequence:v.sequence as number,epoch:v.epoch as number,kind:kinds[v.kind],source:['','normal-instruction','cpu-api','host-boundary'][v.source],execId:v.execId as number,rebootSequence:v.rebootSequence as number,
  apiMask:v.source===3?undefined:v.apiMask as number,boundaryDetail:v.source===3?v.apiMask as number:undefined,
  interruptNumber:v.interruptNumber as number|null,interruptType:v.interruptType as number,complete:true,before,after};
}
function entry(value:unknown){
 const v=object(value);if(!v)return;
 for(const k of ['execId','mode'])if(!uint(v[k]))return;
 for(const k of ['cs','ss','sp','psp'])if(!uint(v[k],65535))return;
 if(!uint(v.ip)||!uint(v.result,2)||typeof v.observed!=='boolean'||typeof v.program!=='string'||v.program.length>64)return;
 const first=v.observed?record(v.firstInstruction):null;if(v.observed&&!first)return;
 if(!v.observed&&v.firstInstruction!==null)return;
 // Reject personal paths/credentials; only the native sanitized DOS basename is accepted.
 if(!/^[A-Za-z0-9_. ()~?\-]{0,64}$/.test(v.program))return;
 return {execId:v.execId as number,loadMode:v.mode as number,program:v.program,result:['unobserved','loader-prepared','failed'][v.result],prepared:{cs:v.cs as number,ip:v.ip as number,ss:v.ss as number,sp:v.sp as number,psp:v.psp as number},entryObserved:v.observed,firstInstruction:first};
}
export function cpuHistory(value:unknown){
 const v=object(value);if(!v||v.version!==1||!(v.reason===1||v.reason===2)||v.capacity!==128||v.ringBytes!==15360||v.storageBytes!==17240)return;
 for(const k of ['rebootSequence','overwritten','instructions'])if(!uint(v[k]))return;
 if(!Array.isArray(v.records)||v.records.length>128||!Array.isArray(v.execEntries)||v.execEntries.length>8)return;
 const trigger=state(v.trigger),records=v.records.map(record),execEntries=v.execEntries.map(entry);
 if(!trigger||records.some(r=>!r)||execEntries.some(e=>!e))return;
 const rows=records as NonNullable<ReturnType<typeof record>>[];
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(b.epoch<a.epoch||(b.epoch===a.epoch&&b.sequence<=a.sequence))return;}
 return {version:1,reason:v.reason===1?'reset-vector-fetch':'reboot-handler',rebootSequence:v.rebootSequence as number,capacity:128,ringBytes:15360,storageBytes:17240,
  overwritten:v.overwritten as number,instructions:v.instructions as number,trigger,records:rows,execEntries:execEntries as NonNullable<ReturnType<typeof entry>>[]};
}
export class CpuHistory {
 private history?:NonNullable<ReturnType<typeof cpuHistory>>;private rejected=0;
 accept(value:unknown){if(this.history){this.rejected++;return;}const h=cpuHistory(value);if(!h){this.rejected++;return;}this.history=h;return h;}
 report(){return {revision:'phase9-3-cpu-1',history:this.history,rejected:this.rejected,
  note:'Bounded normal-core observations, not a complete execution log. before/after are actual emulator states, not requested targets or guest stack contents. Linear addresses are CS base + EIP before paging/A20. Other cores have gap/API records only. Host boundaries are not guest instructions. Entry observation proves the first instruction was observed, not initialization success. PSP is the DOS segment, not protected-mode task identity. Missing history or an overwritten predecessor cannot establish a cause.'};}
}
