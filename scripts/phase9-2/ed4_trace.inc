// GPL-2.0-or-later. Included only by cpu.cpp in the isolated experiment.
#include "dos_inc.h"
#include <emscripten.h>
#include <string.h>
#include "ed4_trace.h"
// Every JS call is synchronous, bounded, non-throwing, and cannot yield.
EM_JS(void, ed4_event, (int kind, int route, int sequence, int origin,
  int cs_value, int ss_value, unsigned ip, unsigned flags, unsigned cr0,
  int pmode, int psp, int exec_id, int exec_mode, int exec_result,
  int error_code, const char* program, unsigned detail, unsigned extra), {
  try {
    self.postMessage({name:'ed4-reboot-event',props:{version:1,kind:kind,route:route,
      sequence:sequence,originSequence:origin,cs:cs_value,ss:ss_value,eip:ip,
      flags:flags>>>0,cr0:cr0>>>0,protectedMode:!!pmode,psp:psp,
      execId:exec_id,execMode:exec_mode,execResult:exec_result,errorCode:error_code,
      program:UTF8ToString(program),detail:detail>>>0,extra:extra>>>0}});
  } catch (_) {} // Telemetry failure must not change guest execution.
});
bool ed4_trace_pending=false;
Bitu ed4_trace_reset=0xffff0;
static Bitu ed4_stub=0,ed4_post=0,ed4_callback=0,ed4_expected=0;
static int ed4_route=0,ed4_sequence=0,ed4_origin=0;
static bool ed4_fetched_stub=false,ed4_dispatched=false;
static int ed4_exec_id=0,ed4_exec_mode=0,ed4_exec_result=0,ed4_error=-1;
static char ed4_program[65]={0};
// Read lazy condition flags without FillFlags()/CPU_SetFlags or state mutation.
static Bit32u ED4_Flags(void) {
  return (reg_flags & ~FMASK_TEST) | (get_CF()?FLAG_CF:0) |
    (get_PF()?FLAG_PF:0) | (get_AF()?FLAG_AF:0) | (get_ZF()?FLAG_ZF:0) |
    (get_SF()?FLAG_SF:0) | (get_OF()?FLAG_OF:0);
}
static int ED4_Event(int kind,int route,Bitu detail=0,Bitu extra=0) {
  ed4_event(kind,route,++ed4_sequence,ed4_origin,SegValue(cs),SegValue(ss),
    reg_eip,ED4_Flags(),cpu.cr0,cpu.pmode,dos.psp(),ed4_exec_id,ed4_exec_mode,
    ed4_exec_result,ed4_error,ed4_program,detail,extra);
  return ed4_sequence;
}
static void ED4_Clear(void) {
  ed4_trace_pending=false;ed4_route=0;ed4_origin=0;
  ed4_fetched_stub=false;ed4_dispatched=false;
}
void ED4_Configure(Bitu stub,Bitu post,Bitu callback) {
  ed4_stub=stub;ed4_post=post;ed4_callback=callback;ED4_Clear();
}
void ED4_Interrupt(Bitu num,Bitu type,Bitu return_ip) {
  ED4_Clear(); // An intervening interrupt invalidates the direct-path proof.
  if(num!=0x18 && num!=0x19)return;
  ed4_route=num==0x18?1:2;
  ed4_origin=ED4_Event(1,ed4_route,return_ip,type); // BEFORE transfer, AFTER existing FillFlags.
}
void ED4_InterruptTarget(Bitu target) {
  if(ed4_route && target==ed4_stub && cpudecoder==CPU_Core_Normal_Run) {
    ed4_trace_pending=true;ed4_expected=ed4_stub;
  } else ED4_Clear();
}
void ED4_Jump(Bitu selector,Bitu offset,Bitu return_ip) {
  if((selector<<4)+offset!=ed4_trace_reset)return;
  ED4_Clear();ed4_route=3;
  ed4_origin=ED4_Event(2,3,return_ip,(selector<<4)+offset); // BEFORE real/v86 far transfer.
  if(cpudecoder==CPU_Core_Normal_Run){ed4_trace_pending=true;ed4_expected=ed4_trace_reset;}
}
void ED4_Fetch(Bitu linear) {
  // Linear FFFF0 in protected/paged mode is not proof of physical BIOS entry.
  // Do not translate/read guest memory merely to guess a route.
  if(cpu.pmode || (cpu.cr0 & 0x80000000u)){ED4_Clear();return;}
  if(ed4_trace_pending && linear!=ed4_expected)ED4_Clear();
  if(linear==ed4_trace_reset) {
    if(!ed4_trace_pending){ED4_Clear();ed4_route=3;}
    // Entry is proven, but originSequence=0 means pre-transfer state is unavailable.
    ED4_Event(3,3,linear);ed4_trace_pending=true;ed4_expected=ed4_post;
  } else if(ed4_trace_pending && linear==ed4_post && ed4_route==3) {
    ed4_expected=ed4_stub;
  } else if(ed4_trace_pending && linear==ed4_stub) {
    ed4_fetched_stub=true;
  }
}
void ED4_Dispatch(Bitu callback) {
  if(!ed4_trace_pending)return;
  if(ed4_fetched_stub && callback==ed4_callback && cpudecoder==CPU_Core_Normal_Run)ed4_dispatched=true;
  else ED4_Clear();
}
void ED4_Reboot(void) {
  const bool proven=ed4_trace_pending && ed4_fetched_stub && ed4_dispatched;
  if(!proven)ED4_Clear();
  ED4_Event(4,proven?ed4_route:0); // Handler entry AFTER transfer; never call it pre-state.
  ED4_Clear();
}
void ED4_Abort(void) {ED4_Event(5,0);} // Immediately BEFORE the unchanged abort().
void ED4_ExecRequest(const char* name,Bitu mode) {
  // Retain basename only, never arguments, host paths, PSP command tail, or bytes.
  const char* base=name;
  for(const char* p=name;*p;++p)if(*p=='/'||*p=='\\'||*p==':')base=p+1;
  unsigned i=0;
  for(;base[i]&&i<64;++i){const unsigned char c=base[i];ed4_program[i]=(c>=32&&c<127)?c:'?';}
  ed4_program[i]=0;ed4_exec_id++;ed4_exec_mode=mode;ed4_exec_result=0;ed4_error=-1;
  ED4_Event(6,0);
}
void ED4_ExecResult(bool result) {
  ed4_exec_result=result?1:2;ed4_error=result?-1:dos.errorcode;
  ED4_Event(7,0); // true = loader prepared transfer/overlay, NOT program initialization success.
}
