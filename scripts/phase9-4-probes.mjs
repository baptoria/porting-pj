// CC0 authored DOS programs. ED4.EXE here is a COM-format synthetic probe,
// selected by basename to exercise the production focus gate; no game bytes.
const w=n=>[n&255,(n>>>8)&255],d=n=>[...w(n),...w(n>>>16)];
const reset=[0xea,0,0,255,255],nops=()=>Array(320).fill(0x90);
export function loader(){
 const code=[0x0e,0x07,0xbb,0,0x10,0xb4,0x4a,0xcd,0x21,0xbb,0x60,1,0xba,0x40,1,0xb8,0,0x4b,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21];
 while(code.length<0x40)code.push(0);code.push(...Buffer.from('ED4.EXE\0'));while(code.length<0x80)code.push(0);return code;
}
function transfer(kind){
 // Change CS by +1 while preserving the intended linear target. Only this CC0
 // probe's immediate operand is patched; no original game is touched.
 if(kind==='retf'||kind==='iret'){
  const a=[0x0e,0x58,0x40,...(kind==='iret'?[0x9c]:[]),0x50,0x68,0,0,kind==='iret'?0xcf:0xcb];
  const t=0x100+a.length-16;const at=a.indexOf(0x68)+1;a[at]=t&255;a[at+1]=t>>>8;return [...a,...nops(),...reset];
 }
 const a=[0x0e,0x58,0x40,0xa3,0,0,kind==='far-call'?0x9a:0xea,0,0,0,0];
 const seg=0x100+9;a[4]=seg&255;a[5]=seg>>>8;
 if(kind==='far-call'){
  const end=[...nops(),...reset],sub=0x100+a.length+end.length-16;a[7]=sub&255;a[8]=sub>>>8;
  return [...a,...end,0xcb]; // subroutine RETF to original CS, then reset
 }
 const target=0x100+a.length-16;a[7]=target&255;a[8]=target>>>8;return [...a,...nops(),...reset];
}
function boundary(corridor){
 // Enable A20 and write only authored instructions into RAM. 67 selects EDI/ECX
 // for data addressing; it does NOT request 32-bit instruction-pointer wrapping.
 const a=[...(corridor?[]:nops()),0xfa,0xe4,0x92,0x0c,2,0xe6,0x92];
 if(corridor)a.push(0xb8,255,255,0x8e,0xc0);else a.push(0x0e,0x07);
 const start=corridor?0xfff0:0xfffe,count=corridor?0x102d:2;
 a.push(0x66,0xbf,...d(start),0x66,0xb9,...d(count),0xb0,0x90,0x67,0xf3,0xaa);
 for(const byte of [corridor?0x9a:0xea,0,0,255,255])a.push(0xb0,byte,0x67,0xaa);
 if(corridor)a.push(0xea,0xf0,0xff,255,255);
 else {const next=0x100+a.length+3;a.push(0xe9,...w(0xfffe-next));}
 return a;
}
export const probes=[
 ...['far-call','far-jmp','retf','iret'].map(name=>({name,code:transfer(name)})),
 {name:'bios-int10',code:[0xb8,0x41,0x0e,0xbb,7,0,0xcd,0x10,...nops(),...reset]},
 {name:'eip-boundary',code:boundary(false)},
 {name:'ffff-corridor',code:boundary(true)},
 {name:'int18',code:[...nops(),0xcd,0x18]},
 {name:'int19',code:[...nops(),0xcd,0x19]},
 {name:'mode-roundtrip',code:[0xfa,0x0f,0x20,0xc0,0x0c,1,0x0f,0x22,0xc0,0x24,0xfe,0x0f,0x22,0xc0,...nops(),...reset]},
 {name:'mz-entry-zero',code:[...nops(),...reset],mz:true},
];
export function mz(code){
 const size=32+code.length;
 const header=[0x5a4d,size%512,Math.ceil(size/512),0,2,0x1000,0xffff,0x100,0xfffe,0,0,0,0x1c,0,0,0];
 return [...header.flatMap(w),...code];
}
export const returning=[0xba,0x0c,1,0xb4,9,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21,...Buffer.from('TARGET_RETURN_OK\r\n$')];

