// CC0. Fixed amount of integer work; no commercial bytes or persistent writes.
export function cpuBenchmark(){
 const b=[],labels={},refs=[];const emit=(...v)=>b.push(...v),label=n=>labels[n]=b.length;
 const word=n=>{refs.push({at:b.length,n});emit(0,0);};const jump=(op,n)=>{emit(op);refs.push({at:b.length,n,rel:true});emit(0);};
 const print=n=>{emit(0xba);word(n);emit(0xb4,9,0xcd,0x21);};
 label('ready');print('readyText');emit(0x31,0xc0,0xcd,0x16,0x3c,0x71);jump(0x74,'exit');
 print('beginText');emit(0x31,0xc0,0xba,100,0);label('outer');emit(0xb9,0xff,0xff);label('inner');emit(0x40);jump(0xe2,'inner');emit(0x4a);jump(0x75,'outer');
 emit(0x3d,0x9c,0xff);jump(0x75,'fail');print('doneText');jump(0xeb,'ready');
 label('fail');print('failText');label('exit');emit(0xb8,0,0x4c,0xcd,0x21);
 for(const [key,s]of [['readyText','BENCH_READY'],['beginText','BENCH_BEGIN'],['doneText','BENCH_DONE_CHECKSUM_OK'],['failText','BENCH_CHECKSUM_FAILED']]){label(key);emit(...Buffer.from(s+'\r\n$'));}
 for(const r of refs){const v=r.rel?labels[r.n]-r.at-1:256+labels[r.n];if(r.rel){if(v< -128||v>127)throw Error('branch');b[r.at]=v&255;}else{b[r.at]=v&255;b[r.at+1]=v>>8;}}return new Uint8Array(b);
}
