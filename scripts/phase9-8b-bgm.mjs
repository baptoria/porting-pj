// GPL-2.0-only. Local proof of concept, NOT imported by the production launcher.
// The caller must supply verified play/stop/loop semantics and exclusive native
// BGM suppression. A RAW file open/read/close is deliberately NOT a command.
export class RealtimeBgm {
  constructor(context, destination, authorize) {
    this.context=context;this.destination=destination;this.authorize=authorize;
    this.epoch=0;this.sequence=0;this.nodes=new Set();this.state='stopped';
    this.cursor=0;this.at=0;this.pending=false;this.underruns=0;this.maxRead=0;
  }
  cancel() {
    this.epoch++;
    for(const node of this.nodes){node.onended=null;try{node.stop();}catch{}node.disconnect();}
    this.nodes.clear();
  }
  async command(command) {
    // This authorization is a required external capability, not an inferred mute.
    if(!Number.isSafeInteger(command.sequence)||command.sequence<=this.sequence)return false;
    if(!['play','pause','resume','stop'].includes(command.type))throw Error('Unknown BGM command');
    if(command.type==='play') {
      if(!this.authorize(command))throw Error('Native BGM suppression / command provenance unverified');
      const {format,file}=command;
      if(format?.encoding!=='pcm16le'||format.channels!==2||format.rate!==22050||format.offset!==8||!file||file.size<=8||(file.size-8)%4)throw Error('Unsupported verified PCM contract');
      this.cancel();this.file=file;this.format={...format};this.loop=command.loop===true;this.cursor=0;
      this.total=(file.size-8)/4;this.startedFrame=0;this.at=this.context.currentTime+.03;this.startedAt=this.at;this.state='playing';
    } else if(command.type==='pause' && this.state==='playing') {
      const elapsed=Math.max(0,this.context.currentTime-this.startedAt)*this.format.rate;
      this.pausedFrame=Math.floor(this.startedFrame+elapsed);
      this.pausedFrame=this.loop?this.pausedFrame%this.total:Math.min(this.total,this.pausedFrame);
      this.cancel();this.state='paused';
    } else if(command.type==='resume' && this.state==='paused') {
      this.cursor=this.pausedFrame;this.startedFrame=this.cursor;this.at=this.context.currentTime+.03;this.startedAt=this.at;this.state='playing';
    } else if(command.type==='stop') {this.cancel();this.state='stopped';this.file=undefined;}
    this.sequence=command.sequence;
    await this.pump();return true;
  }
  async pump() {
    if(this.pending||this.state!=='playing')return;
    this.pending=true;const epoch=this.epoch;
    try {
      // At most 0.5 s per read and about 0.75 s queued, independent of guest time.
      while(this.state==='playing'&&epoch===this.epoch&&this.at<this.context.currentTime+.25) {
        if(this.cursor>=this.total) {
          if(this.loop)this.cursor=0;
          else {if(this.context.currentTime>=this.at)this.state='ended';break;}
        }
        const frames=Math.min(Math.floor(this.format.rate/2),this.total-this.cursor),offset=8+this.cursor*4;
        const bytes=await this.file.slice(offset,offset+frames*4).arrayBuffer();
        if(epoch!==this.epoch||this.state!=='playing')return;
        if(bytes.byteLength!==frames*4)throw Error('Short BGM read');
        this.maxRead=Math.max(this.maxRead,bytes.byteLength);
        const data=new DataView(bytes),buffer=this.context.createBuffer(2,frames,this.format.rate);
        for(let c=0;c<2;c++){const channel=buffer.getChannelData(c);for(let i=0;i<frames;i++)channel[i]=data.getInt16(i*4+c*2,true)/32768;}
        const node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.destination);
        // No playbackRate, detune, guest-cycle count, or guest timestamp is used.
        if(this.at<this.context.currentTime){this.underruns++;this.at=this.context.currentTime+.01;this.startedAt=this.at;this.startedFrame=this.cursor;}
        this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);node.disconnect();};node.start(this.at);
        this.at+=frames/this.format.rate;this.cursor+=frames;
      }
    } catch(error){if(epoch===this.epoch){this.cancel();this.state='error';}throw error;}
    finally{this.pending=false;}
  }
  dispose(){this.cancel();this.state='stopped';this.file=undefined;}
}
