// Strict, bounded metadata only. Never spread a Worker object into diagnostics.
const kinds=['unknown','interrupt-request','far-jump-request','reset-entry','reboot-handler','before-abort','exec-request','exec-result'] as const;
const routes=['unknown','int18','int19','reset-vector'] as const;
const uint=(v:unknown,max=0xffffffff):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
export function rebootEvent(value:unknown){
 if(!value||typeof value!=='object')return;
 const v=value as Record<string,unknown>;
 if(v.version!==1||!uint(v.kind,7)||v.kind===0||!uint(v.route,3)||!uint(v.sequence)||v.sequence===0||!uint(v.originSequence)||
  !uint(v.cs,65535)||!uint(v.ss,65535)||!uint(v.psp,65535)||!uint(v.eip)||!uint(v.flags)||!uint(v.cr0)||typeof v.protectedMode!=='boolean'||
  !uint(v.execId)||!uint(v.execMode,255)||!uint(v.execResult,2)||!(v.errorCode===-1||uint(v.errorCode,65535))||!uint(v.detail)||!uint(v.extra))return;
 const program=typeof v.program==='string'?v.program.split(/[\\/:]/).pop()!.slice(0,64).replace(/[^A-Za-z0-9_. ()~-]/g,'?'):'';
 return {sequence:v.sequence,kind:kinds[v.kind],route:routes[v.route],originSequence:v.originSequence,
  phase:v.kind===1||v.kind===2?'before-transfer':v.kind===3?'after-transfer-before-reset-instruction':v.kind===4?'handler-entry-after-transfer':v.kind===5?'before-original-abort':v.kind===6?'before-DOS-Execute':'after-DOS-Execute-before-guest-resume',
  cpu:{cs:v.cs,ss:v.ss,eip:v.eip,flags:v.flags,cr0:v.cr0,protectedMode:v.protectedMode,psp:v.psp},
  lastExec:{id:v.execId,program,mode:v.execMode,result:['pending-or-unobserved','loader-prepared','failed'][v.execResult],errorCode:v.errorCode===-1?null:v.errorCode},
  returnIp:v.kind===1||v.kind===2?v.detail:undefined,interruptType:v.kind===1?v.extra:undefined,
  resetLinear:v.kind===3?v.detail:undefined,jumpTargetLinear:v.kind===2?v.extra:undefined,
  unknownReason:v.kind===4&&v.route===0?'No uninterrupted normal-core instruction/callback chain proved the entry route. Other cores, custom vectors, intervening interrupts, or direct callback entry are not attributed.':undefined};
}
type Event=NonNullable<ReturnType<typeof rebootEvent>>;
export class RebootObservation{
 private events:Event[]=[];private dropped=0;private rejected=0;private sequence=0;
 private reboot?:Event;private origin?:Event;
 accept(value:unknown){
  const e=rebootEvent(value);if(!e||e.sequence<=this.sequence){this.rejected++;return;}
  this.sequence=e.sequence;
  if(e.kind==='reboot-handler'&&!this.reboot){this.reboot=e;this.origin=this.events.find(v=>v.sequence===e.originSequence);}
  if(this.events.length>=128){this.events.shift();this.dropped++;}this.events.push(e);
  return e;
 }
 report(){return {revision:'phase9-2-reboot-1',events:[...this.events],firstReboot:this.reboot,preTransfer:this.origin,dropped:this.dropped,rejected:this.rejected,
  note:'CPU fields are emulator registers, not guest memory. EIP is the saved decoder register; returnIp is the requested interrupt/far-jump return EIP, not an inferred opcode address. FLAGS are read from lazy flag getters without mutation. PSP is only the DOS current PSP segment, not a protected-mode task identity. lastExec describes INT21/AH4B loader requests/results, not program initialization or all DOS errors. A proven BIOS entry route does not prove why the caller chose it. Missing origins/unknown paths are not reconstructed.'};}
}
