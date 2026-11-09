// CC0 public probe, authored independently of commercial programs.
// Explicit text mode 3; test two sentinel writes in the VGA aperture only.
// This proves the selected mapping's behavior, not the game's actual VGA mode.
export function apertureProbe(){
 const code=[0xb8,3,0,0xcd,0x10, // MOV AX,3; INT 10h
  0xb8,0x3b,0xa6,0x8e,0xc0]; // MOV AX,A63B; MOV ES,AX
 const jumps=[];
 for(const [offset,value]of [[0x1ca,0x1234],[0x1cc,0x5678]]){
  code.push(0x26,0xc7,0x06,offset&255,offset>>>8,value&255,value>>>8);
  code.push(0x26,0x81,0x3e,offset&255,offset>>>8,255,255,0x75,0);
  jumps.push(code.length-1);
 }
 const print=(s)=>{const at=code.length;code.push(0xba,0,0,0xb4,9,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21);const ptr=0x100+code.length;code[at+1]=ptr&255;code[at+2]=ptr>>>8;code.push(...Buffer.from(s+'\r\n$'));};
 print('PUBLIC_TEXT_VGA_SENTINELS_READ_FFFF');const fail=code.length;
 print('PUBLIC_TEXT_VGA_OTHER_MAPPING');
 for(const at of jumps){const offset=fail-at-1;if(offset>127)throw Error('short branch range');code[at]=offset;}
 return new Uint8Array(code);
}
