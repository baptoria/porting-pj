// GPL-2.0-or-later. Observation only; no guest memory payloads.
#ifndef ED4_REBOOT_TRACE_H
#define ED4_REBOOT_TRACE_H
#include "dosbox.h"
extern bool ed4_trace_pending;
extern Bitu ed4_trace_reset;
void ED4_Configure(Bitu stub, Bitu post, Bitu callback);
void ED4_Interrupt(Bitu num, Bitu type, Bitu return_ip);
void ED4_InterruptTarget(Bitu target);
void ED4_Jump(Bitu selector, Bitu offset, Bitu return_ip);
void ED4_Fetch(Bitu linear);
void ED4_Dispatch(Bitu callback);
void ED4_Reboot(void);
void ED4_Abort(void);
void ED4_ExecRequest(const char* name, Bitu mode);
void ED4_ExecResult(bool result);
#endif
