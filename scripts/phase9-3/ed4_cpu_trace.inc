// GPL-2.0-or-later. Included after Phase 9-2 ed4_trace.inc in cpu.cpp.
// No guest opcode/operand/stack bytes are read for instrumentation.
#include "ed4_cpu_trace.h"
struct ED4_CPU_State {
  Bit32u cs,ip,linear,csBase,ss,flags,cr0,psp,mode,core;
};
struct ED4_CPU_Record {
  Bit32u sequence,epoch,kind,source,execId,rebootSequence,apiMask,intNumber,intType,complete;
  ED4_CPU_State before,after;
};
struct ED4_CPU_Entry {
  Bit32u execId,mode,cs,ip,ss,sp,psp,result,observed;
  char program[64];
  ED4_CPU_Record first;
};
typedef char ED4_state_layout[(sizeof(ED4_CPU_State)==40)?1:-1];
typedef char ED4_record_layout[(sizeof(ED4_CPU_Record)==120)?1:-1];
typedef char ED4_entry_layout[(sizeof(ED4_CPU_Entry)==220)?1:-1];
static ED4_CPU_Record ed4_cpu_ring[128],ed4_cpu_current;
static ED4_CPU_Entry ed4_cpu_entries[8];
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
  s.mode=cpu.pmode?((reg_flags&FLAG_VM)?2:1):0;s.core=ED4_CPU_Core();return s;
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
  }
}
ED4_InstructionScope::~ED4_InstructionScope(){if(owned&&!ed4_cpu_deferred)ED4_CPU_End();}
void ED4_CPU_Defer(void){if(ed4_cpu_active)ed4_cpu_deferred=true;}
// kind: 0 other, 1 far-jmp, 2 indirect-far-jmp, 3 retf, 4 iret,
// 5 int, 6 near-jmp, 7 indirect-near-jmp, 8 near-call, 9 far-call,
// 10 indirect-far-call, 11 near-ret, 12 conditional, 13 loop, 14 hlt,
// 15 callback-opcode, 16 control-register, 17 segment-load,
// 18 host-enter, 19 host-return, 20 core-gap-enter, 21 core-gap-return, 22 cpu-api.
Bitu ED4_CPU_Opcode(Bitu op) {
  if(!ed4_cpu_active)return op;
  ed4_cpu_opcode=op;Bitu b=op&255,k=0;
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
// Read fixed metadata structures ONLY at a trigger. No heap dump/byte array transfer.
EM_JS(void, ed4_cpu_send,(const void* ring,unsigned head,unsigned count,const void* entries,unsigned entry_count,
  unsigned reason,unsigned reboot_seq,unsigned overwritten,unsigned instructions,unsigned bytes,const void* trigger),{
  try {
    function state(p){var a=HEAPU32;return {cs:a[p],ip:a[p+1],linear:a[p+2],csBase:a[p+3],ss:a[p+4],flags:a[p+5],cr0:a[p+6],psp:a[p+7],mode:a[p+8],core:a[p+9]};}
    function record(p){var a=HEAPU32;return {sequence:a[p],epoch:a[p+1],kind:a[p+2],source:a[p+3],execId:a[p+4],rebootSequence:a[p+5],apiMask:a[p+6],interruptNumber:a[p+7]===4294967295?null:a[p+7],interruptType:a[p+8],complete:!!a[p+9],before:state(p+10),after:state(p+20)};}
    var rows=[],loads=[];
    for(var i=0;i<count;i++)rows.push(record((ring>>>2)+((head+128-count+i)%128)*30));
    for(var j=0,n=Math.min(8,entry_count);j<n;j++){
      var p=(entries>>>2)+((entry_count-n+j)%8)*55,a=HEAPU32;
      loads.push({execId:a[p],mode:a[p+1],cs:a[p+2],ip:a[p+3],ss:a[p+4],sp:a[p+5],psp:a[p+6],result:a[p+7],observed:!!a[p+8],program:UTF8ToString((p+9)*4),firstInstruction:a[p+8]?record(p+25):null});
    }
    self.postMessage({name:'ed4-cpu-history',props:{version:1,reason:reason,rebootSequence:reboot_seq,capacity:128,
      ringBytes:128*120,storageBytes:bytes,overwritten:overwritten,instructions:instructions,trigger:state(trigger>>>2),records:rows,execEntries:loads}});
  }catch(_){} // Never suppress CPU/guest errors; only metadata transport errors.
});
void ED4_CPU_Flush(Bitu reason,Bitu reboot_sequence) {
  if(ed4_cpu_frozen)return;
  const ED4_CPU_State trigger=ED4_CPU_StateNow();
  ed4_cpu_frozen=true;
  ed4_cpu_send(ed4_cpu_ring,ed4_cpu_head,ed4_cpu_count,ed4_cpu_entries,ed4_cpu_entry_count,
    reason,reboot_sequence,ed4_cpu_overwritten,ed4_cpu_instructions,
    sizeof(ed4_cpu_ring)+sizeof(ed4_cpu_current)+sizeof(ed4_cpu_entries),&trigger);
}
