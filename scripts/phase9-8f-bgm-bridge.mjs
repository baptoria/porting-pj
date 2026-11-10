// Local experiment only. The missing production adapter must prove exclusive
// pre-mix BGM suppression; a raw-read correlation is never such a capability.
import {RealtimeBgm} from './phase9-8b-bgm.mjs';
export class BgmBridge {
 constructor(context,destination,adapter){this.adapter=adapter;this.session=adapter.session;this.lease=null;this.sequence=0;this.rate=1;this.queue=Promise.resolve();this.player=new RealtimeBgm(context,destination,c=>c.lease===this.lease&&this.validLease(this.lease));}
 validLease(lease){return lease?.session===this.session&&lease?.exclusiveBgm===true&&lease?.preservesSeIrqDma===true&&this.adapter.isCurrent(lease);}
 dispatch(command){const job=this.queue.then(()=>this.apply(command));this.queue=job.catch(()=>{});return job;}
 async apply(c){
  if(c.session!==this.session||!Number.isSafeInteger(c.sequence)||c.sequence<=this.sequence)throw Error('Wrong session or stale command');
  if(!['play','stop','pause','resume','speed'].includes(c.type))throw Error('Unknown command semantics');
  if(c.type==='speed'){
   if(c.rate!==1&&c.rate!==2)throw Error('Only 1x/2x');
   if(c.rate===2&&!this.validLease(this.lease))throw Error('Exclusive BGM suppression unverified');
   try{const applied=await this.adapter.setSpeed(c.rate);if(applied!==c.rate)throw Error('Guest speed acknowledgement mismatch');this.rate=applied;this.sequence=c.sequence;return;}catch(error){await this.fallback();throw error;}
  }
  if(c.type==='play'){
   // Verified semantics include loop/end policy, format and exact runtime path.
   const previous=this.lease;let lease;
   try{
    if(!this.adapter.commandVerified(c))throw Error('Play/loop/file ownership unverified');
    const file=await this.adapter.open(c.path);lease=await this.adapter.acquire(c);
    if(!this.validLease(lease))throw Error('Selective native BGM suppression unavailable');
    this.lease=lease;await this.player.command({...c,file,lease});if(previous&&previous!==lease)await this.adapter.release(previous);
   }catch(error){
    const active=this.lease;try{await this.fallback();}finally{if(lease&&lease!==active)await this.adapter.release(lease);if(previous&&previous!==active)await this.adapter.release(previous);}throw error;
   }
  }else{
   if(!this.adapter.commandVerified(c)||!this.validLease(this.lease))throw Error('Stop/pause semantics or ownership unverified');
   await this.player.command(c);
   if(c.type==='stop')await this.fallback();
  }
  this.sequence=c.sequence;
 }
 async fallback(){this.player.dispose();const lease=this.lease;this.lease=null;this.rate=null;try{const applied=await this.adapter.setSpeed(1);this.rate=applied===1?1:null;if(applied!==1)throw Error('Could not confirm safe 1x fallback');}finally{if(lease)await this.adapter.release(lease);}}
 async pump(){try{if(!this.validLease(this.lease))throw Error('Native BGM ownership lost');return await this.player.pump();}catch(e){await this.fallback();throw e;}}
 async dispose(){await this.queue;await this.fallback();}
}
