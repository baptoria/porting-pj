// GPL-2.0-or-later. Bounded observation only, no instruction replacement.
#ifndef ED4_CPU_HISTORY_H
#define ED4_CPU_HISTORY_H
#include "dosbox.h"
class ED4_InstructionScope {
  bool owned;
public:
  ED4_InstructionScope(Bitu linear);
  ~ED4_InstructionScope();
};
class ED4_ControlScope {
  bool owned;
public:
  ED4_ControlScope(Bitu mask,Bitu number=0xffffffffu,Bitu type=0);
  ~ED4_ControlScope();
};
Bitu ED4_CPU_Opcode(Bitu opcode);
void ED4_CPU_ModRM(Bitu modrm);
void ED4_CPU_Defer(void);
void ED4_CPU_End(void);
void ED4_CPU_Boundary(Bitu kind,Bitu detail=0);
void ED4_CPU_CoreBoundary(bool before);
void ED4_CPU_Flush(Bitu reason,Bitu reboot_sequence);
void ED4_CPU_Prepared(Bitu cs,Bitu ip,Bitu ss,Bitu sp,Bitu psp,Bitu mode);
void ED4_CPU_ExecResult(bool success);
#endif
