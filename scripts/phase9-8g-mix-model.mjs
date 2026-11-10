// GPL-2.0-only. Public semantic experiment, NOT an ED4 runtime adapter.
// Reflects pre-accumulator exclusion and independent cursor advancement.
// Does not emulate guest file buffering, DPMI, interrupts or device timing.
export class PublicSlotMixer {
 constructor(slots,{rate=8000,format=0}={}) {
  if(!Number.isInteger(rate)||rate<1000||rate>96000||![0,1,2,3].includes(format))throw Error('Output contract');
  this.rate=rate;this.format=format;this.frames=0;
  this.slots=slots.map(s=>{
   const bytesPerFrame=(s.format&1?2:1)*(s.format&2?2:1);
   if(![0,1,2,3].includes(s.format)||!Number.isInteger(s.rate)||s.rate<1000||s.rate>96000||!s.bytes?.length||s.bytes.length%bytesPerFrame||![s.left,s.right].every(Number.isInteger))throw Error('Slot contract');
   return {...s,bytesPerFrame,total:s.bytes.length/bytesPerFrame,cursor:0,phase:rate,active:true,loops:0,consumed:0};
  });
 }
 state(){return {frames:this.frames,slots:this.slots.map(s=>({cursor:s.cursor,phase:s.phase,active:s.active,loops:s.loops,consumed:s.consumed}))};}
 stop(index){if(!this.slots[index])throw Error('Slot');this.slots[index].active=false;}
 mix(frames,suppress=new Set()){
  if(!Number.isInteger(frames)||frames<0||frames>96000)throw Error('Frame bound');
  const channels=this.format&1?2:1,bits=this.format&2?16:8;
  const out=new Uint8Array(frames*channels*(bits/8)),v=new DataView(out.buffer);
  for(let f=0;f<frames;f++){
   let left=0,right=0;
   for(let i=0;i<this.slots.length;i++){
    const s=this.slots[i];if(!s.active)continue;
    const pos=s.cursor*s.bytesPerFrame,stereo=s.format&1,wide=s.format&2;
    const read=p=>wide?(s.bytes[p]|s.bytes[p+1]<<8)<<16>>16:(s.bytes[p]-128)*256;
    const l=read(pos),r=stereo?read(pos+(wide?2:1)):l;
    // ONLY the accumulator contribution is excluded, never slot advancement.
    if(!suppress.has(i)){left=(left+Math.imul(l,s.left))|0;right=(right+Math.imul(r,s.right))|0;}
    let step=Math.floor(s.rate/this.rate);s.phase-=s.rate%this.rate;
    if(s.phase<=0){step++;s.phase+=this.rate;}
    s.consumed+=step;s.cursor+=step;
    if(s.cursor>=s.total){if(s.loop){s.loops+=Math.floor(s.cursor/s.total);s.cursor%=s.total;}else{s.cursor=s.total;s.active=false;}}
   }
   const values=channels===2?[left,right]:[((left>>1)+(right>>1))|0];
   for(let c=0;c<channels;c++){
    const offset=(f*channels+c)*(bits/8);
    if(bits===16)v.setInt16(offset,values[c]>>16,true);else out[offset]=((values[c]>>24)+128)&255;
   }
  }
  this.frames+=frames;return out;
 }
}

// A report contract, not an authorization mechanism. A future verified native
// adapter must provide the evidence; this module cannot discover/issue it.
export function separationStatus(e={}) {
 const same=e.session&&e.session===e.observationSession&&e.live===true&&e.gaps===0;
 const bgmOwnershipVerified=!!(same&&e.evidence==='runtime-premix-ownership'&&e.exclusiveBgm===true&&e.controlSemantics===true);
 const bgmSuppressionActive=bgmOwnershipVerified&&e.selectiveSuppressionAcknowledged===true;
 const effectsPreserved=bgmSuppressionActive&&e.effectsCompared===true;
 const dmaIrqPreserved=bgmSuppressionActive&&e.deviceProgressCompared===true;
 const independentBgmReady=bgmOwnershipVerified&&e.exactPathVerified===true&&e.formatVerified===true&&e.playerReady===true;
 return {bgmOwnershipVerified,bgmSuppressionActive,effectsPreserved,dmaIrqPreserved,independentBgmReady,
  speed2xAllowed:!!(bgmSuppressionActive&&effectsPreserved&&dmaIrqPreserved&&independentBgmReady&&e.speedAcknowledged===true),normal1xAllowed:true};
}
