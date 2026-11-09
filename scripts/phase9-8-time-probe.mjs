// CC0: wait exactly 36 BIOS tick transitions; not an instruction-count loop.
export function timeProbe(){
 const b=[],labels={},refs=[];const emit=(...v)=>b.push(...v),label=n=>labels[n]=b.length;
 const word=n=>{refs.push({at:b.length,n});emit(0,0);};const jump=(op,n)=>{emit(op);refs.push({at:b.length,n,rel:true});emit(0);};
 const print=n=>{emit(0xba);word(n);emit(0xb4,9,0xcd,0x21);};
 label('ready');print('readyText');emit(0x31,0xc0,0xcd,0x16,0x3c,0x71);jump(0x74,'exit');
 print('beginText');emit(0xb8,0x40,0,0x8e,0xc0,0x26,0x8b,0x2e,0x6c,0); // es=40; bp=es:[6c]
 label('wait');emit(0x26,0xa1,0x6c,0,0x29,0xe8,0x83,0xf8,36);jump(0x72,'wait');print('doneText');jump(0xeb,'ready');
 label('exit');emit(0xb8,0,0x4c,0xcd,0x21);
 for(const [key,s]of [['readyText','TIMER_READY'],['beginText','TIMER_BEGIN'],['doneText','TIMER_DONE']]){label(key);emit(...Buffer.from(s+'\r\n$'));}
 for(const r of refs){const v=r.rel?labels[r.n]-r.at-1:256+labels[r.n];if(r.rel){if(v< -128||v>127)throw Error('branch');b[r.at]=v&255;}else{b[r.at]=v&255;b[r.at+1]=v>>8;}}return new Uint8Array(b);
}
