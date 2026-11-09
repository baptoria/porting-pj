// CC0. Independently authored DOS COM, no commercial code/data.
// Copy/compare all 468 synthetic bytes at A63B:0000 in explicit mode 3.
// Execute a four-byte authored stub there only if every byte read back matches.
export function memoryProbe(videoMode=3){
 const b=[],labels={},fix=[];const e=(...x)=>b.push(...x),w=n=>[n&255,n>>>8&255];
 const label=n=>labels[n]=b.length;
 const ref=n=>{fix.push({at:b.length,name:n});e(0,0);};
 const branch=(op,n)=>{e(op);fix.push({at:b.length,name:n,rel:true});e(0);};
 const print=n=>{e(0xba);ref(n);e(0xb4,9,0xcd,0x21);};
 e(0xb8,videoMode,0,0xcd,0x10,0x0e,0x1f,0xb8,0x3b,0xa6,0x8e,0xc0,0xfc);
 e(0xbe);ref('payload');e(0x31,0xff,0xb9,...w(468),0xf3,0xa4);
 e(0xbe);ref('payload');e(0x31,0xff,0xb9,...w(468),0xf3,0xa6);branch(0x75,'mismatch');
 // Two RETFs: transfer to authored aperture stub, then return to this COM.
 e(0x0e,0x68);ref('returned');e(0x06,0x6a,0,0xcb);
 label('returned');e(0x3d,0xef,0xbe);branch(0x75,'mismatch');
 print('pass');e(0xb8,0,0x4c,0xcd,0x21);
 label('mismatch');print('fail');e(0xb8,1,0x4c,0xcd,0x21);
 label('pass');e(...Buffer.from('PUBLIC_468_COPY_AND_RETF_OK\r\n$'));
 label('fail');e(...Buffer.from('PUBLIC_APERTURE_READBACK_MISMATCH\r\n$'));
 label('payload');const payload=Array.from({length:468},(_,i)=>(i*13+7)&255);payload.splice(0,4,0xb8,0xef,0xbe,0xcb);e(...payload);
 for(const f of fix){const value=f.rel?labels[f.name]-f.at-1:0x100+labels[f.name];if(f.rel){if(value< -128||value>127)throw Error('Branch range');b[f.at]=value&255;}else{b[f.at]=value&255;b[f.at+1]=value>>>8;}}
 return new Uint8Array(b);
}
