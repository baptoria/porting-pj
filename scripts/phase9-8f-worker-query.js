// GPL-2.0-only. Bounded metadata query; no sample/guest-memory export.
const bgmReadFirst=[],bgmReadTail=[];let bgmReadCount=0;
function bgmNameHash(path){let n=2166136261;for(const c of path.replace(/\\/g,'/').split('/').pop().toUpperCase())n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;}
function bgmRead(path,position,length){const e={sequence:++bgmReadCount,hash:bgmNameHash(path),position,length};if(bgmReadFirst.length<32)bgmReadFirst.push(e);else{if(bgmReadTail.length===256)bgmReadTail.shift();bgmReadTail.push(e);}}
function bgmSnapshot(){
 const get=runtime?._ed4_bgm_value;if(typeof get!=='function')throw Error('Missing BGM metadata export');
 const rows=get(-1,1),header=Array.from({length:33},(_,i)=>get(-1,i));
 if(!Number.isInteger(rows)||rows<0||rows>288)throw Error('BGM ring bounds');
 return {version:2,int69Returns:{matched:get(-2,0),overflow:get(-2,1),pending:get(-2,2)},header,rows:Array.from({length:rows},(_,r)=>Array.from({length:32},(_,c)=>get(r,c))),
 fileReads:{total:bgmReadCount,overwritten:Math.max(0,bgmReadCount-288),events:[...bgmReadFirst,...bgmReadTail]},
 tracks:music.map(m=>({hash:bgmNameHash(m.path),path:m.path}))};
}
self.addEventListener('message',event=>{
 if(event.data?.name!=='ed4-audio-status')return;event.stopImmediatePropagation();
 const id=event.data.id;if(!Number.isSafeInteger(id)||id<1)return;
 try{self.postMessage({name:'ed4-audio-status',props:{id,reads:musicStats.reads,bytes:musicStats.bytes,largestRead:musicStats.largestRead,mounted:music.length,bgm:bgmSnapshot()}});}
 catch {self.postMessage({name:'ed4-audio-status',props:{id,reads:musicStats.reads,bytes:musicStats.bytes,largestRead:musicStats.largestRead,mounted:music.length,bgm:{unavailable:true}}});}
});
