// GPL-2.0-or-later. Event-only observation; no CPU instruction tracing.
#include "inout.h"
#include "pic.h"
#include "dma.h"
#include "dos_inc.h"
#include <emscripten.h>
static const unsigned BGM_COLS=32, BGM_FIRST=32, BGM_TAIL=256;
static Bit32u bgm_first[BGM_FIRST][BGM_COLS]={},bgm_tail[BGM_TAIL][BGM_COLS]={};
static Bit32u bgm_seq=0,bgm_ints=0,bgm_raw=0,bgm_efc=0,bgm_cmd[24]={},bgm_other=0;
struct BgmReadRange {Bit32u seq,begin,end,hash,psp;};
static BgmReadRange bgm_reads[32]={};static unsigned bgm_read_next=0;
static void BgmDma(Bit32u* r) {
 for(unsigned i=0;i<2;i++){DmaChannel* d=GetDMAChannel(i?5:1);unsigned at=26+i*3;
  r[at]=d?d->pagebase+(d->curraddr<<d->DMA16):0;r[at+1]=d?d->currcnt:0;r[at+2]=d?(d->masked?1:0):2;}
}
static void BgmBase(Bit32u* r,unsigned kind) {
 r[0]=++bgm_seq;r[1]=PIC_Ticks;r[2]=kind;r[3]=reg_ax;r[4]=SegValue(cs);r[5]=reg_eip;r[6]=dos.psp();r[7]=cpu.cr0;r[8]=cpu.pmode?1:0;
 r[9]=SegValue(ds);r[10]=reg_si;r[11]=SegValue(es);r[12]=reg_di;r[13]=reg_bx;r[14]=reg_cx;r[15]=reg_dx;BgmDma(r);
}
static void BgmStore(const Bit32u* r) {
 if(r[0]<=BGM_FIRST)memcpy(bgm_first[r[0]-1],r,BGM_COLS*sizeof(Bit32u));
 else memcpy(bgm_tail[(r[0]-BGM_FIRST-1)%BGM_TAIL],r,BGM_COLS*sizeof(Bit32u));
}
// Only physical conventional RAM. Never page-walk/read MMIO or protected pointers.
static bool BgmRam(Bit32u p,Bit32u n){return p>=0x500 && n>0 && p<0xa0000 && n<=0xa0000-p;}
void ED4_BgmInterrupt(Bitu num,Bitu oldip) {
 if(num!=0x66)return;
 ++bgm_ints;unsigned ax=reg_ax;if(ax<0x688||ax>0x69f){++bgm_other;return;}
 unsigned count=++bgm_cmd[ax-0x688];
 if(count>1 && ax!=0x688&&ax!=0x68b&&ax!=0x694&&ax!=0x695&&ax!=0x68f&&ax!=0x698&&ax!=0x69c)return;
 Bit32u r[BGM_COLS]={};BgmBase(r,1);r[5]=oldip;
 if(!cpu.pmode && !(cpu.cr0&0x80000000u)) {
  Bit32u vector=(mem_readw(0x66*4+2)<<4)+mem_readw(0x66*4);
  // Signature is supporting evidence, NOT proof of driver identity/version.
  if(vector>=6 && BgmRam(vector-6,4) && mem_readd(vector-6)==0x4e52454b)r[16]=1;
  Bit32u p=SegPhys(ds)+reg_si;
  if(r[16] && (ax==0x688||ax==0x68b||ax==0x694||ax==0x695) && BgmRam(p,12)) {
   Bit32u start=(mem_readw(p+2)<<4)+mem_readw(p),len=mem_readw(p+4),status=(mem_readw(p+8)<<4)+mem_readw(p+6),freq=mem_readw(p+10);
   if(BgmRam(start,len)&&BgmRam(status,2)&&freq>=4000&&freq<=48000){r[17]=1;r[18]=start;r[19]=len;r[20]=freq;r[21]=status;
    for(unsigned i=0;i<32;i++){const BgmReadRange& b=bgm_reads[i];if(b.psp==r[6]&&b.seq>r[22]&&start>=b.begin&&start+len<=b.end){r[22]=b.seq;r[23]=b.hash;}}
   }
  }
 }
 BgmStore(r);
}
void ED4_BgmRead(Bit16u entry,Bit32u destination,Bit16u length) {
 // Invalidate a candidate even if overwritten by a non-audio DOS read.
 for(unsigned i=0;i<32;i++)if(destination<bgm_reads[i].end && destination+length>bgm_reads[i].begin)bgm_reads[i].seq=0;
 Bit32u h=RealHandle(entry);if(h>=DOS_FILES||!Files[h]||!Files[h]->GetName())return;
 const char* name=Files[h]->GetName(),*base=name;for(const char* p=name;*p;p++)if(*p=='/'||*p=='\\')base=p+1;
 unsigned n=strlen(base);if(n<4)return;
 const char* ext=base+n-4;unsigned kind=!strcasecmp(ext,".RAW")?2:!strcasecmp(ext,".EFC")?3:0;if(!kind)return;
 Bit32u hash=2166136261u;for(const char* p=base;*p;p++){unsigned c=(unsigned char)*p;if(c>='a'&&c<='z')c-=32;hash=(hash^c)*16777619u;}
 Bit32u r[BGM_COLS]={};BgmBase(r,kind);r[23]=hash;r[24]=destination;r[25]=length;if(kind==2)++bgm_raw;else ++bgm_efc;BgmStore(r);
 if(length){BgmReadRange& b=bgm_reads[bgm_read_next++%32];b.seq=r[0];b.begin=destination;b.end=destination+length;b.hash=hash;b.psp=r[6];}
}
extern "C" EMSCRIPTEN_KEEPALIVE double ed4_bgm_value(int row,int col) {
 if(row==-1){switch(col){case 0:return bgm_seq;case 1:return bgm_seq<288?bgm_seq:288;case 2:return bgm_seq>288?bgm_seq-288:0;case 3:return bgm_ints;case 4:return bgm_raw;case 5:return bgm_efc;case 6:return sizeof(bgm_first)+sizeof(bgm_tail)+sizeof(bgm_reads)+sizeof(bgm_cmd);case 32:return bgm_other;}if(col>=8&&col<32)return bgm_cmd[col-8];return -1;}
 if(row<0||col<0||col>=32||row>=int(bgm_seq<288?bgm_seq:288))return -1;
 if(row<32)return bgm_first[row][col];unsigned count=bgm_seq-32,tail=count<256?count:256,oldest=count-tail;return bgm_tail[(oldest+row-32)%256][col];
}
