// Only bounded numeric metadata from the separately verified Phase 9-4 engine.
const kinds=['other','far-jmp','indirect-far-jmp','retf','iret','interrupt','near-jmp','indirect-near-jmp','near-call','far-call','indirect-far-call','near-ret','conditional-branch','loop','hlt','callback-opcode','control-register-group','segment-load','host-enter','host-return','core-gap-enter','core-gap-return','cpu-api','fetch-boundary'] as const;
const cores=['unknown-or-hlt','normal','normal-trap','simple','full','prefetch'] as const;
const uint=(v:unknown,max=0xffffffff):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
type Raw=Record<string,unknown>;
const object=(v:unknown):Raw|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Raw:undefined;
function state(value:unknown){
 const v=object(value);if(!v)return;
 for(const k of ['cs','ss','psp'])if(!uint(v[k],65535))return;
 for(const k of ['ip','linear','csBase','flags','cr0'])if(!uint(v[k]))return;
 if(!uint(v.mode,2)||!uint(v.core,5))return;
 for(const k of ['ip16','sp'])if(!uint(v[k],65535))return;
 for(const k of ['esp','ssBase','stackMask'])if(!uint(v[k]))return;
 if(!uint(v.cpl,3))return;for(const k of ['codeBig','stackBig','a20','paging'])if(typeof v[k]!=='boolean')return;
 return {ip16:v.ip16 as number,esp:v.esp as number,sp:v.sp as number,ssBase:v.ssBase as number,codeBig:v.codeBig as boolean,stackBig:v.stackBig as boolean,stackMask:v.stackMask as number,cpl:v.cpl as number,a20:v.a20 as boolean,paging:v.paging as boolean,
 physicalAddress:null,codeLimit:null,a20WindowCandidate:v.mode===0&&!v.paging?(!v.a20&&(v.linear as number)>=0x100000&&(v.linear as number)<0x110000?(v.linear as number)-0x100000:v.linear as number):null,
 cs:v.cs as number,ip:v.ip as number,linear:v.linear as number,csBase:v.csBase as number,ss:v.ss as number,flags:v.flags as number,cr0:v.cr0 as number,psp:v.psp as number,mode:['real','protected','v86'][v.mode],core:cores[v.core]};
}
function record(value:unknown){
 const v=object(value);if(!v)return;
 for(const k of ['sequence','epoch','execId','rebootSequence','apiMask','interruptType'])if(!uint(v[k]))return;
 if(!uint(v.kind,23)||!uint(v.source,4)||v.source===0||v.complete!==true||!(v.interruptNumber===null||uint(v.interruptNumber,255)))return;
 if(typeof v.decodeKnown!=='boolean'||![0,16,32].includes(v.operandBits as number)||![0,16,32].includes(v.addressBits as number))return;
 const before=state(v.before),after=state(v.after);if(!before||!after)return;
 return {operandBits:v.operandBits as number,addressBits:v.addressBits as number,decodeKnown:v.decodeKnown as boolean,sequence:v.sequence as number,epoch:v.epoch as number,kind:kinds[v.kind],source:['','normal-instruction','cpu-api','host-boundary','fetch-boundary'][v.source],execId:v.execId as number,rebootSequence:v.rebootSequence as number,
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
const eventNames=['target-entry','first-cs-ffff','first-real-eip-wide','first-bios-region','first-reset-address','first-unattributed-cs-change','first-mode-cr0-change','first-cs-transfer'] as const;
function parseFirst(value:unknown){
 const v=object(value);if(!v||v.target!=='ED4.EXE'||typeof v.armed!=='boolean'||v.preCapacity!==24||v.postCapacity!==16||!Array.isArray(v.anchors)||v.anchors.length>8)return;
 const targetEntry=v.armed?entry(v.targetEntry):null;if(v.armed&&(!targetEntry||!targetEntry.entryObserved||targetEntry.program.toUpperCase()!=='ED4.EXE')||!v.armed&&v.targetEntry!==null)return;
 const anchors=[];const seen=new Set<number>();
 for(const value of v.anchors){
  const a=object(value);if(!a||!uint(a.type,7)||seen.has(a.type)||!uint(a.occurrences)||!a.occurrences||!uint(a.continuity,4)||!uint(a.triggerSide,1)||typeof a.fetchConfirmed!=='boolean')return;
  if(!Array.isArray(a.before)||a.before.length>24||!Array.isArray(a.after)||a.after.length>16)return;
  const e=record(a.event),before=a.before.map(record),after=a.after.map(record),x=object(a.lastExec);
  if(!e||before.some(r=>!r)||after.some(r=>!r)||!x||!uint(x.id)||!uint(x.mode,255)||!uint(x.result,2)||!(x.errorCode===null||uint(x.errorCode,65535))||typeof x.program!=='string'||!/^[A-Za-z0-9_. ()~?\-]{0,64}$/.test(x.program))return;
  const order=[...before,e,...after] as NonNullable<ReturnType<typeof record>>[];
  for(let i=1;i<order.length;i++){const p=order[i-1],q=order[i];if(q.epoch<p.epoch||(q.epoch===p.epoch&&q.sequence<=p.sequence))return;}
  seen.add(a.type);anchors.push({type:eventNames[a.type],occurrences:a.occurrences,assessment:a.type===5?'unattributed-not-proven-invalid':'observation-not-an-error',
   continuity:['no-predecessor','same-address-mode','unexplained-gap','host-boundary-gap','untraced-core-gap'][a.continuity],triggerSide:a.triggerSide?'after':'before',fetchConfirmed:a.fetchConfirmed,event:e,before,after,
   lastExec:{id:x.id,mode:x.mode,result:['unobserved','loader-prepared','failed'][x.result],errorCode:x.errorCode,program:x.program}});
 }
 if(!v.armed&&anchors.length||v.armed&&!seen.has(0))return;
 return {target:v.target,armed:v.armed,preCapacity:24,postCapacity:16,targetEntry,anchors};
}
export function firstHistory(value:unknown){
 const v=object(value);if(!v||v.version!==2||!(v.reason===1||v.reason===2)||v.capacity!==128||v.ringBytes!==27136||v.storageBytes!==100588)return;
 for(const k of ['rebootSequence','overwritten','instructions'])if(!uint(v[k]))return;
 if(!Array.isArray(v.records)||v.records.length>128||!Array.isArray(v.execEntries)||v.execEntries.length>8)return;
 const trigger=state(v.trigger),records=v.records.map(record),execEntries=v.execEntries.map(entry);
 if(!trigger||records.some(r=>!r)||execEntries.some(e=>!e))return;
 const rows=records as NonNullable<ReturnType<typeof record>>[];
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(b.epoch<a.epoch||(b.epoch===a.epoch&&b.sequence<=a.sequence))return;}
 const first=parseFirst(v.first);if(!first)return;
 return {first,version:2,reason:v.reason===1?'reset-vector-fetch':'reboot-handler',rebootSequence:v.rebootSequence as number,capacity:128,ringBytes:27136,storageBytes:100588,
  overwritten:v.overwritten as number,instructions:v.instructions as number,trigger,records:rows,execEntries:execEntries as NonNullable<ReturnType<typeof entry>>[]};
}
export class FirstAnomaly {
 private history?:NonNullable<ReturnType<typeof firstHistory>>;private rejected=0;
 accept(value:unknown){if(this.history){this.rejected++;return;}const h=firstHistory(value);if(!h){this.rejected++;return;}this.history=h;return h;}
 report(){return {revision:'phase9-4-first-1',history:this.history,rejected:this.rejected,
  note:'First events are observations, not defects. ED4.EXE basename/entry matching starts a session-wide scope, not ownership of later addresses. Expected API transfers and BIOS calls are not flagged as erroneous. Unattributed CS changes may be host callbacks or gaps. A20 candidate is only the fixed low 64KiB window rule, not a translated physical address; paging/EMS/hidden limit are unobserved. Bounded normal-core observations, not a complete execution log. before/after are actual emulator states, not requested targets or guest stack contents. Linear addresses are CS base + EIP before paging/A20. Other cores have gap/API records only. Host boundaries are not guest instructions. Entry observation proves the first instruction was observed, not initialization success. PSP is the DOS segment, not protected-mode task identity. Missing history or an overwritten predecessor cannot establish a cause.'};}
}
