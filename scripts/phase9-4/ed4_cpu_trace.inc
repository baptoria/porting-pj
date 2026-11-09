// GPL-2.0-or-later. Included after Phase 9-2 ed4_trace.inc in cpu.cpp.
// No guest opcode/operand/stack bytes are read for instrumentation.
#include "ed4_cpu_trace.h"
struct ED4_CPU_State {
  Bit32u cs,ip,linear,csBase,ss,flags,cr0,psp,mode,core;
  Bit32u ip16,esp,sp,ssBase,codeBig,stackBig,stackMask,cpl,a20,paging;
};
struct ED4_CPU_Record {
  Bit32u sequence,epoch,kind,source,execId,rebootSequence,apiMask,intNumber,intType,complete;
  Bit32u operandBits,addressBits,decodeKnown;
  ED4_CPU_State before,after;
};
struct ED4_CPU_Entry {
  Bit32u execId,mode,cs,ip,ss,sp,psp,result,observed;
  char program[64];
  ED4_CPU_Record first;
};
typedef char ED4_state_layout[(sizeof(ED4_CPU_State)==80)?1:-1];
typedef char ED4_record_layout[(sizeof(ED4_CPU_Record)==212)?1:-1];
typedef char ED4_entry_layout[(sizeof(ED4_CPU_Entry)==312)?1:-1];
static ED4_CPU_Record ed4_cpu_ring[128],ed4_cpu_current;
static ED4_CPU_Entry ed4_cpu_entries[8];
// 8 independent first observations. Nothing here asserts a guest/CPU defect.
struct ED4_First {
  Bit32u type,seen,count,preCount,postCount,continuity,execId,execMode,execResult,errorCode,triggerSide,fetchConfirmed;
  char program[64];
  ED4_CPU_Record event,pre[24],post[16];
};
typedef char ED4_first_layout[(sizeof(ED4_First)==8804)?1:-1];
static ED4_First ed4_first[8];
static ED4_CPU_Entry ed4_target_entry;
static bool ed4_target_active=false,ed4_first_pending=false;
static Bit32u ed4_first_post_mask=0;
static Bit32u ed4_cpu_head=0,ed4_cpu_count=0,ed4_cpu_seq=0,ed4_cpu_epoch=0;
static Bit32u ed4_cpu_entry_count=0,ed4_cpu_overwritten=0,ed4_cpu_instructions=0;
static bool ed4_cpu_active=false,ed4_cpu_deferred=false,ed4_cpu_frozen=false;
static Bitu ed4_cpu_opcode=0; // Transient decode selector; never exported or buffered.
static int ed4_cpu_match=-1;
static Bit32u ED4_CPU_Core(void) {
  if(cpudecoder==CPU_Core_Normal_Run)return 1;
  if(cpudecoder==CPU_Core_Normal_Trap_Run)return 2;
  if(cpudecoder==CPU_Core_Simple_Run||cpudecoder==CPU_Core_Simple_Trap_Run)return 3;
  if(cpudecoder==CPU_Core_Full_Run)return 4;
  if(cpudecoder==CPU_Core_Prefetch_Run||cpudecoder==CPU_Core_Prefetch_Trap_Run)return 5;
  return 0; // Includes HLT and uninstrumented decoders; never guess their identity.
}
static ED4_CPU_State ED4_CPU_StateNow(void) {
  ED4_CPU_State s;
  s.cs=SegValue(cs);s.ip=reg_eip;s.csBase=SegPhys(cs);s.linear=s.csBase+s.ip;
  s.ss=SegValue(ss);s.flags=ED4_Flags();s.cr0=cpu.cr0;s.psp=dos.psp();
  s.mode=cpu.pmode?((reg_flags&FLAG_VM)?2:1):0;s.core=ED4_CPU_Core();
  s.ip16=reg_ip;s.esp=reg_esp;s.sp=reg_sp;s.ssBase=SegPhys(ss);
  s.codeBig=cpu.code.big;s.stackBig=cpu.stack.big;s.stackMask=cpu.stack.mask;s.cpl=cpu.cpl;
  s.a20=MEM_A20_Enabled();s.paging=(cpu.cr0&0x80000000u)?1:0;return s;
}
static bool ED4_SameAddress(const ED4_CPU_State& a,const ED4_CPU_State& b) {
  return a.cs==b.cs&&a.ip==b.ip&&a.csBase==b.csBase&&a.mode==b.mode&&a.cr0==b.cr0;
}
static bool ED4_TargetName(const char* p) {
  const char* target="ED4.EXE";
  for(unsigned i=0;i<7;i++){char c=p[i];if(c>='a'&&c<='z')c-=32;if(c!=target[i])return false;}
  return p[7]==0;
}
static bool ED4_Bios(const ED4_CPU_State& s) {
  return s.mode==0&&!s.paging&&s.linear>=0xf0000u&&s.linear<=0xfffffu;
}
static unsigned ED4_Continuity(const ED4_CPU_Record& r) {
  if(!ed4_cpu_count)return 0;
  const ED4_CPU_Record& p=ed4_cpu_ring[(ed4_cpu_head+127)%128];
  if(ED4_SameAddress(p.after,r.before))return 1;
  if(r.source==3||p.source==3)return 3;
  if((r.before.core!=1&&r.before.core!=2)||(p.after.core!=1&&p.after.core!=2))return 4;
  return 2;
}
static void ED4_Anchor(unsigned type,const ED4_CPU_Record& r,unsigned side,unsigned continuity) {
  ED4_First& a=ed4_first[type];
  if(a.count!=0xffffffffu)++a.count;
  if(a.seen)return;
  a.type=type;a.seen=1;a.event=r;a.triggerSide=side;a.continuity=continuity;
  a.fetchConfirmed=(side==0&&r.source==1)?1:0;ed4_first_post_mask|=1u<<type;
  a.execId=ed4_exec_id;a.execMode=ed4_exec_mode;a.execResult=ed4_exec_result;a.errorCode=(Bit32u)ed4_error;
  strncpy(a.program,ed4_program,63);
  a.preCount=ed4_cpu_count<24?ed4_cpu_count:24;
  for(unsigned i=0;i<a.preCount;i++)a.pre[i]=ed4_cpu_ring[(ed4_cpu_head+128-a.preCount+i)%128];
}
static void ED4_FirstObserve(const ED4_CPU_Record& r) {
  if(!ed4_target_active)return;
  // Append successors to anchors already captured; never overwrite their prefix.
  if(ed4_first_post_mask)for(unsigned i=0;i<8;i++)if(ed4_first_post_mask&(1u<<i)){
    ED4_First& a=ed4_first[i];
    if(a.postCount==0&&a.triggerSide==1&&r.source==1&&ED4_SameAddress(a.event.after,r.before))a.fetchConfirmed=1;
    a.post[a.postCount++]=r;if(a.postCount==16)ed4_first_post_mask&=~(1u<<i);
  }
  const unsigned continuity=ED4_Continuity(r);
  const ED4_CPU_Record* previous=ed4_cpu_count?&ed4_cpu_ring[(ed4_cpu_head+127)%128]:0;
  const bool gap=previous&&!ED4_SameAddress(previous->after,r.before);
  const bool beforeF=r.before.cs==0xffff,afterF=r.after.cs==0xffff;
  const bool beforeW=r.before.mode==0&&r.before.ip>0xffff,afterW=r.after.mode==0&&r.after.ip>0xffff;
  const bool beforeB=ED4_Bios(r.before),afterB=ED4_Bios(r.after);
  const bool beforeR=beforeB&&r.before.linear==0xffff0,afterR=afterB&&r.after.linear==0xffff0;
  if(ed4_first_pending){ed4_target_entry.first=r;ed4_target_entry.observed=1;ED4_Anchor(0,r,0,continuity);ed4_first_pending=false;}
  if(beforeF&&(!ed4_first[1].seen||(gap&&previous->after.cs!=0xffff)))ED4_Anchor(1,r,0,continuity);
  if(afterF&&!beforeF)ED4_Anchor(1,r,1,continuity);
  if(beforeW&&(!ed4_first[2].seen||(gap&&!(previous->after.mode==0&&previous->after.ip>0xffff))))ED4_Anchor(2,r,0,continuity);
  if(afterW&&!beforeW)ED4_Anchor(2,r,1,continuity);
  if(beforeB&&(!ed4_first[3].seen||(gap&&!ED4_Bios(previous->after))))ED4_Anchor(3,r,0,continuity);
  if(afterB&&!beforeB)ED4_Anchor(3,r,1,continuity);
  if(beforeR&&!ed4_first[4].seen)ED4_Anchor(4,r,0,continuity);
  if(afterR&&!beforeR)ED4_Anchor(4,r,1,continuity);
  const bool csChange=r.before.cs!=r.after.cs||r.before.csBase!=r.after.csBase;
  const bool attributed=(r.apiMask&(1|2|4|8|64))!=0&&r.source!=3;
  if(csChange){ED4_Anchor(7,r,1,continuity);if(!attributed)ED4_Anchor(5,r,1,continuity);}
  if(gap&&(previous->after.cs!=r.before.cs||previous->after.csBase!=r.before.csBase)){ED4_Anchor(7,r,0,continuity);ED4_Anchor(5,r,0,continuity);}
  if(r.before.mode!=r.after.mode||r.before.cr0!=r.after.cr0)ED4_Anchor(6,r,1,continuity);
  else if(gap&&(previous->after.mode!=r.before.mode||previous->after.cr0!=r.before.cr0))ED4_Anchor(6,r,0,continuity);
}
static void ED4_CPU_Begin(Bitu kind,Bitu source) {
  if(ed4_cpu_frozen||ed4_cpu_active)return;
  memset(&ed4_cpu_current,0,sizeof(ed4_cpu_current));
  if(++ed4_cpu_seq==0)++ed4_cpu_epoch;
  ed4_cpu_current.sequence=ed4_cpu_seq;ed4_cpu_current.epoch=ed4_cpu_epoch;
  ed4_cpu_current.kind=kind;ed4_cpu_current.source=source;
  ed4_cpu_current.execId=ed4_exec_id;ed4_cpu_current.rebootSequence=ed4_sequence;
  ed4_cpu_current.intNumber=0xffffffffu;ed4_cpu_current.before=ED4_CPU_StateNow();
  ed4_cpu_active=true;ed4_cpu_deferred=false;ed4_cpu_match=-1;
}
void ED4_CPU_End(void) {
  if(!ed4_cpu_active)return;
  ed4_cpu_current.after=ED4_CPU_StateNow();ed4_cpu_current.complete=1;
  ED4_FirstObserve(ed4_cpu_current);
  ed4_cpu_ring[ed4_cpu_head]=ed4_cpu_current;ed4_cpu_head=(ed4_cpu_head+1)%128;
  if(ed4_cpu_count<128)++ed4_cpu_count;else ++ed4_cpu_overwritten;
  if(ed4_cpu_match>=0){ed4_cpu_entries[ed4_cpu_match].first=ed4_cpu_current;ed4_cpu_entries[ed4_cpu_match].observed=1;}
  ed4_cpu_active=false;ed4_cpu_deferred=false;ed4_cpu_match=-1;
}
ED4_InstructionScope::ED4_InstructionScope(Bitu linear):owned(false) {
  if(ed4_cpu_frozen||ed4_cpu_active)return;
  ED4_CPU_Begin(0,1);owned=true;++ed4_cpu_instructions;
  // LOADIP has run, so this is the actual instruction start, including prefixes.
  ed4_cpu_current.before.linear=linear;
  ed4_cpu_current.before.ip=linear-SegPhys(cs);
  ed4_cpu_opcode=0;
  if(ed4_cpu_entry_count){
    const int i=(ed4_cpu_entry_count-1)%8;ED4_CPU_Entry& e=ed4_cpu_entries[i];
    if(e.result==1&&!e.observed&&e.cs==SegValue(cs)&&e.ip==reg_eip&&e.psp==dos.psp())ed4_cpu_match=i;
    if(ed4_cpu_match==i&&!ed4_target_active&&ED4_TargetName(e.program)){ed4_target_entry=e;ed4_target_active=true;ed4_first_pending=true;}
  }
}
ED4_InstructionScope::~ED4_InstructionScope(){if(owned&&!ed4_cpu_deferred)ED4_CPU_End();}
void ED4_CPU_Defer(void){if(ed4_cpu_active)ed4_cpu_deferred=true;}
// kind: 0 other, 1 far-jmp, 2 indirect-far-jmp, 3 retf, 4 iret,
// 5 int, 6 near-jmp, 7 indirect-near-jmp, 8 near-call, 9 far-call,
// 10 indirect-far-call, 11 near-ret, 12 conditional, 13 loop, 14 hlt,
// 15 callback-opcode, 16 control-register, 17 segment-load,
// 18 host-enter, 19 host-return, 20 core-gap-enter, 21 core-gap-return, 22 cpu-api.
Bitu ED4_CPU_Opcode(Bitu op,Bitu address32) {
  if(!ed4_cpu_active)return op;
  ed4_cpu_opcode=op;Bitu b=op&255,k=0;
  ed4_cpu_current.operandBits=(op&0x200)?32:16;ed4_cpu_current.addressBits=address32?32:16;ed4_cpu_current.decodeKnown=1;
  if(op&0x100){if(b>=0x80&&b<=0x8f)k=12;else if(b==0x22||b==0x01)k=16;}
  else {
    if(b==0xea)k=1;else if(b==0xca||b==0xcb)k=3;else if(b==0xcf)k=4;
    else if(b>=0xcc&&b<=0xce)k=5;else if(b==0xe9||b==0xeb)k=6;
    else if(b==0xe8)k=8;else if(b==0x9a)k=9;else if(b==0xc2||b==0xc3)k=11;
    else if(b>=0x70&&b<=0x7f)k=12;else if(b>=0xe0&&b<=0xe3)k=13;
    else if(b==0xf4)k=14;else if(b==0x8e||b==0x07||b==0x17||b==0x1f)k=17;
  }
  ed4_cpu_current.kind=k;return op; // Exactly the original switch value.
}
void ED4_CPU_ModRM(Bitu rm) {
  if(!ed4_cpu_active||(ed4_cpu_opcode&0x100))return;
  const Bitu group=(rm>>3)&7,op=ed4_cpu_opcode&255;
  if(op==0xff){if(group==2)ed4_cpu_current.kind=8;else if(group==3)ed4_cpu_current.kind=10;
    else if(group==4)ed4_cpu_current.kind=7;else if(group==5)ed4_cpu_current.kind=2;}
  else if(op==0xfe&&group==7)ed4_cpu_current.kind=15;
}
ED4_ControlScope::ED4_ControlScope(Bitu mask,Bitu number,Bitu type):owned(false) {
  if(!mask||ed4_cpu_frozen)return;
  if(!ed4_cpu_active){ED4_CPU_Begin(22,2);owned=true;}
  ed4_cpu_current.apiMask|=mask;
  if(mask&8){ed4_cpu_current.intNumber=number;ed4_cpu_current.intType=type;}
}
ED4_ControlScope::~ED4_ControlScope(){if(owned)ED4_CPU_End();}
void ED4_CPU_Boundary(Bitu kind,Bitu detail) {
  if(ed4_cpu_frozen||ed4_cpu_active)return;
  ED4_CPU_Begin(kind,3);ed4_cpu_current.apiMask=detail;ED4_CPU_End();
}
void ED4_CPU_CoreBoundary(bool before) {
  const Bitu core=ED4_CPU_Core();
  if(core!=1&&core!=2)ED4_CPU_Boundary(before?20:21,core);
}
void ED4_CPU_Prepared(Bitu csValue,Bitu ip,Bitu ssValue,Bitu sp,Bitu psp,Bitu mode) {
  if(ed4_cpu_frozen)return;
  ED4_CPU_Entry& e=ed4_cpu_entries[ed4_cpu_entry_count++%8];memset(&e,0,sizeof(e));
  e.execId=ed4_exec_id;e.mode=mode;e.cs=csValue;e.ip=ip;e.ss=ssValue;e.sp=sp;e.psp=psp;
  strncpy(e.program,ed4_program,63);
}
void ED4_CPU_ExecResult(bool success) {
  if(ed4_cpu_frozen||!ed4_cpu_entry_count)return;
  ED4_CPU_Entry& e=ed4_cpu_entries[(ed4_cpu_entry_count-1)%8];
  if(e.execId==(Bit32u)ed4_exec_id)e.result=success?1:2;
}
// Bounded metadata only. A20 state is recorded; no page walk/guest memory read.
EM_JS(void, ed4_cpu_send,(const void* ring,unsigned head,unsigned count,const void* entries,unsigned entry_count,
 unsigned reason,unsigned reboot_seq,unsigned overwritten,unsigned instructions,unsigned bytes,const void* trigger,const void* first,const void* target,unsigned armed),{
 try {
  function state(p){var a=HEAPU32;return {cs:a[p],ip:a[p+1],linear:a[p+2],csBase:a[p+3],ss:a[p+4],flags:a[p+5],cr0:a[p+6],psp:a[p+7],mode:a[p+8],core:a[p+9],ip16:a[p+10],esp:a[p+11],sp:a[p+12],ssBase:a[p+13],codeBig:!!a[p+14],stackBig:!!a[p+15],stackMask:a[p+16],cpl:a[p+17],a20:!!a[p+18],paging:!!a[p+19]};}
  function record(p){var a=HEAPU32;return {sequence:a[p],epoch:a[p+1],kind:a[p+2],source:a[p+3],execId:a[p+4],rebootSequence:a[p+5],apiMask:a[p+6],interruptNumber:a[p+7]===4294967295?null:a[p+7],interruptType:a[p+8],complete:!!a[p+9],operandBits:a[p+10],addressBits:a[p+11],decodeKnown:!!a[p+12],before:state(p+13),after:state(p+33)};}
  function entry(p){var a=HEAPU32;return {execId:a[p],mode:a[p+1],cs:a[p+2],ip:a[p+3],ss:a[p+4],sp:a[p+5],psp:a[p+6],result:a[p+7],observed:!!a[p+8],program:UTF8ToString((p+9)*4),firstInstruction:a[p+8]?record(p+25):null};}
  var rows=[],loads=[],anchors=[];
  for(var i=0;i<count;i++)rows.push(record((ring>>>2)+((head+128-count+i)%128)*53));
  for(var j=0,n=Math.min(8,entry_count);j<n;j++)loads.push(entry((entries>>>2)+((entry_count-n+j)%8)*78));
  for(var k=0;k<8;k++){
   var p=(first>>>2)+k*2201,a=HEAPU32;if(!a[p+1])continue;var pre=[],post=[];
   for(var l=0;l<a[p+3];l++)pre.push(record(p+81+l*53));
   for(var l=0;l<a[p+4];l++)post.push(record(p+1353+l*53));
   anchors.push({type:a[p],occurrences:a[p+2],continuity:a[p+5],lastExec:{id:a[p+6],mode:a[p+7],result:a[p+8],errorCode:a[p+9]===4294967295?null:a[p+9],program:UTF8ToString((p+12)*4)},triggerSide:a[p+10],fetchConfirmed:!!a[p+11],event:record(p+28),before:pre,after:post});
  }
  self.postMessage({name:'ed4-cpu-history',props:{version:2,reason:reason,rebootSequence:reboot_seq,capacity:128,ringBytes:128*212,storageBytes:bytes,overwritten:overwritten,instructions:instructions,trigger:state(trigger>>>2),records:rows,execEntries:loads,first:{target:'ED4.EXE',armed:!!armed,preCapacity:24,postCapacity:16,targetEntry:armed?entry(target>>>2):null,anchors:anchors}}});
 }catch(_){}
});
void ED4_CPU_Flush(Bitu reason,Bitu reboot_sequence) {
 if(ed4_cpu_frozen)return;
 const ED4_CPU_State trigger=ED4_CPU_StateNow();
 if(reason==1&&ed4_target_active&&!ed4_first[4].seen){ED4_CPU_Begin(23,4);ED4_CPU_End();}
 if(reason==1)for(unsigned i=0;i<8;i++)if(ed4_first[i].seen){const ED4_First& a=ed4_first[i];if(a.event.sequence==ed4_cpu_seq&&a.event.epoch==ed4_cpu_epoch&&ED4_SameAddress(a.triggerSide?a.event.after:a.event.before,trigger))ed4_first[i].fetchConfirmed=1;}
 ed4_cpu_frozen=true;
 ed4_cpu_send(ed4_cpu_ring,ed4_cpu_head,ed4_cpu_count,ed4_cpu_entries,ed4_cpu_entry_count,
 reason,reboot_sequence,ed4_cpu_overwritten,ed4_cpu_instructions,
 sizeof(ed4_cpu_ring)+sizeof(ed4_cpu_current)+sizeof(ed4_cpu_entries)+sizeof(ed4_first)+sizeof(ed4_target_entry),&trigger,ed4_first,&ed4_target_entry,ed4_target_active);
}
