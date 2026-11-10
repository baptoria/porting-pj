// GPL-2.0-or-later. Bounded INT69 request/IRET matching; no memory reads or writes.
struct BgmPending {Bit32u seq,ax,bx,tick,cs,ip,ss,sp,mode;bool active;};
static BgmPending bgm_pending[16]={};
static Bit32u bgm_return_count=0,bgm_pending_overflow=0,bgm_unmatched=0;
static void BgmPendingStart(Bit32u sequence,Bitu oldip) {
 if(reg_ax!=9&&reg_ax!=10)return;
 for(unsigned i=0;i<16;i++)if(!bgm_pending[i].active){BgmPending& p=bgm_pending[i];p.seq=sequence;p.ax=reg_ax;p.bx=reg_bx;p.tick=PIC_Ticks;p.cs=SegValue(cs);p.ip=oldip;p.ss=SegValue(ss);p.sp=reg_esp;p.mode=cpu.pmode?1:0;p.active=true;return;}
 ++bgm_pending_overflow;
}
void ED4_BgmAfterIret() {
 int best=-1;
 for(unsigned i=0;i<16;i++){const BgmPending& p=bgm_pending[i];if(p.active&&p.cs==SegValue(cs)&&p.ip==reg_eip&&p.ss==SegValue(ss)&&p.sp==reg_esp&&p.mode==(cpu.pmode?1u:0u)&&(best<0||p.seq>bgm_pending[best].seq))best=i;}
 if(best<0)return;
 BgmPending& p=bgm_pending[best];Bit32u r[BGM_COLS]={};BgmBase(r,5);
 r[16]=p.seq;r[17]=p.ax;r[18]=p.bx;r[19]=p.tick;r[20]=reg_flags;r[21]=SegValue(ss);r[22]=reg_esp;
 BgmStore(r);p.active=false;++bgm_return_count;
}
static double BgmReturnInfo(int col){if(col==0)return bgm_return_count;if(col==1)return bgm_pending_overflow;if(col==2){unsigned n=0;for(unsigned i=0;i<16;i++)if(bgm_pending[i].active)++n;return n;}return -1;}
