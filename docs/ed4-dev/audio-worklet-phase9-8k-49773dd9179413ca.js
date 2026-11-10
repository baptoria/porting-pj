// GPL-2.0-only. Bounded mono PCM ring. No sample export, pitch correction or file access.
class PcmRing {
  constructor(outputRate) {
    this.outputRate = outputRate;
    this.rateWindows=[];this.rateSequence=0;this.rateBase=null;this.rateTotals={1:{ms:0,consumed:0,gapFrames:0},2:{ms:0,consumed:0,gapFrames:0}};
    this.sourceRate = 22050;
    this.rate = 1;
    this.data = new Float32Array(65536);
    this.read = 0;
    this.write = 0;
    this.count = 0;
    this.fraction = 0;
    this.started = false;
    this.inGap = false;
    this.lastSignal = false;
    this.time = 0;
    this.window = [];
    this.stats = {
      receivedFrames: 0,
      consumedFrames: 0,
      outputFrames: 0,
      underflowFrames: 0,
      audibleGapFrames: 0,
      episodes: 0,
      overflows: 0,
      droppedFrames: 0,
      maxQueueMs: 0,
    };
  }
  push(samples, sourceRate) {
    if (!Number.isFinite(sourceRate) || sourceRate < 8000 || sourceRate > 96000)
      throw Error("Invalid source rate");
    this.sourceRate = sourceRate;
    if (samples.length > this.data.length - this.count) {
      this.stats.overflows++;
      this.stats.droppedFrames += samples.length;
      return false;
    }
    for (let i = 0; i < samples.length; i++) {
      this.data[this.write] = samples[i];
      this.write = (this.write + 1) % this.data.length;
    }
    this.count += samples.length;
    this.stats.receivedFrames += samples.length;
    this.stats.maxQueueMs = Math.max(this.stats.maxQueueMs, this.queueMs());
    return true;
  }
  setRate(rate) {
    if (rate !== 1 && rate !== 2) throw Error("Only 1x/2x");
    if(rate!==this.rate){this.sealWindow();this.rate=rate;this.rateBase=this.rateSample();}
  }
  queueMs() {
    return (this.count / this.sourceRate / this.rate) * 1000;
  }
  render(out) {
    out.fill(0);
    if(!this.rateBase)this.rateBase=this.rateSample();
    this.time += out.length / this.outputRate;
    this.window = this.window.filter((e) => this.time - e.time < 2);
    if (!this.started) {
      if (this.count < this.sourceRate * this.rate * 0.06) {if(this.time-this.rateBase.time>=0.5)this.sealWindow();return;}
      this.started = true;
    }
    const step = (this.sourceRate * this.rate) / this.outputRate;
    let missing = 0,
      signal = false,
      produced = 0;
    for (let i = 0; i < out.length; i++) {
      if (this.count < Math.max(2, Math.floor(this.fraction + step) + 1)) {
        missing++;
        continue;
      }
      const a = this.data[this.read],
        b = this.data[(this.read + 1) % this.data.length];
      out[i] = a + (b - a) * this.fraction;
      signal ||= Math.abs(out[i]) > 0.0001;
      produced++;
      this.fraction += step;
      const n = Math.min(this.count - 1, Math.floor(this.fraction));
      this.fraction -= n;
      this.read = (this.read + n) % this.data.length;
      this.count -= n;
      this.stats.consumedFrames += n;
    }
    this.stats.outputFrames += out.length;
    if (missing) {
      if (!this.inGap) this.stats.episodes++;
      this.inGap = true;
      this.stats.underflowFrames += missing;
      if (this.lastSignal || signal) this.stats.audibleGapFrames += missing;
      this.window.push({
        time: this.time,
        ms: (missing / this.outputRate) * 1000,
      });
    } else {
      this.inGap = false;
    }
    if (produced) this.lastSignal = signal;
    if(this.time-this.rateBase.time>=0.5)this.sealWindow();
  }
  rateSample(){return {time:this.time,rate:this.rate,consumed:this.stats.consumedFrames,received:this.stats.receivedFrames,gap:this.stats.underflowFrames,queue:this.queueMs()};}
  sealWindow(){const n=this.rateSample(),b=this.rateBase;this.rateBase=n;if(!b||n.time<=b.time)return;
    const ms=(n.time-b.time)*1000,consumed=n.consumed-b.consumed,gapFrames=n.gap-b.gap,t=this.rateTotals[b.rate];t.ms+=ms;t.consumed+=consumed;t.gapFrames+=gapFrames;
    if(this.rateWindows.length===256)this.rateWindows.shift();
    this.rateWindows.push({sequence:++this.rateSequence,rate:b.rate,ms,consumed,received:n.received-b.received,gapFrames,gapMs:gapFrames*1000/this.outputRate,consumedFramesPerSecond:consumed*1000/ms,targetFramesPerSecond:this.sourceRate*b.rate,queueStartMs:b.queue,queueEndMs:n.queue,queueSlopeMsPerSecond:(n.queue-b.queue)*1000/ms});
  }
  report() {
    return {
      ...this.stats,
      rateWindows:{windows:this.rateWindows,totals:this.rateTotals,limit:256,overwritten:Math.max(0,this.rateSequence-256),clock:"AudioContext render time; 60ms preroll included; speed transitions sealed"},
      rate: this.rate,
      sourceRate: this.sourceRate,
      outputRate: this.outputRate,
      queueAheadMs: this.queueMs(),
      queuedBuffers: 0,
      overlaps: 0,
      underruns: this.stats.episodes,
      audibleUnderruns: this.stats.audibleGapFrames ? this.stats.episodes : 0,
      gapSeconds: this.stats.underflowFrames / this.outputRate,
      windowGapMs: this.window.reduce((n, e) => n + e.ms, 0),
      ringCapacityFrames: this.data.length,
      started: this.started,
      policy:
        "actual render consumption; 60ms initial preroll; no repreroll on gap; no dropped queued samples",
      samplesExported: false,
    };
  }
}

function compact(r){const s=r.report();return {...s,rateWindows:{...s.rateWindows,windows:s.rateWindows.windows.slice(-2)}};}
class Ed4PcmProcessor extends AudioWorkletProcessor {
 constructor(){super();this.ring=new PcmRing(sampleRate);this.frames=0;this.supply={packets:0,arrivalMaxMs:0,arrivalSumMs:0,last:0};this.receive=p=>{try{
  if(p.kind==='pcm'){const now=currentTime*1000;if(this.supply.last){const dt=now-this.supply.last;this.supply.arrivalSumMs+=dt;this.supply.arrivalMaxMs=Math.max(this.supply.arrivalMaxMs,dt);}this.supply.last=now;this.supply.packets++;this.ring.push(p.samples,p.sourceRate);}
  else if(p.kind==='attach'){this.input=p.port;this.input.onmessage=e=>this.receive(e.data);this.input.start();}
  else if(p.kind==='speed'){
    if(p.rate!==1&&p.rate!==2)throw Error('Only 1x/2x');
    this.pendingSpeed=p;this.applySpeed();
  }
  else if(p.kind==='status')this.port.postMessage({kind:'stats',stats:{...compact(this.ring),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},pendingSpeed:this.pendingSpeed?.rate??null,transitionPolicy:"60ms real-time reserve before 2x ACK; no rebuffer on underrun",mainPcmMessages:0}});
 }catch(error){this.port.postMessage({kind:'error',message:String(error.message)});}};this.port.onmessage=e=>this.receive(e.data);}
 applySpeed(){
  const p=this.pendingSpeed;if(!p)return;
  // Keep playing old queued PCM at 1x until a 60ms *real* 2x reserve exists.
  // No dropped/repeated samples. Host timeout restores native 1x if supply cannot fill it.
  if(p.rate===2&&this.ring.rate===1&&this.ring.started&&this.ring.count<this.ring.sourceRate*2*0.06)return;
  this.pendingSpeed=null;this.ring.setRate(p.rate);this.port.postMessage({kind:'ack',id:p.id,rate:this.ring.rate});
 }
 process(_inputs,outputs){this.applySpeed();const out=outputs[0]?.[0];if(!out)return true;this.ring.render(out);this.frames+=out.length;if(this.frames>=sampleRate/4){this.frames=0;this.port.postMessage({kind:'stats',stats:{...compact(this.ring),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},pendingSpeed:this.pendingSpeed?.rate??null,transitionPolicy:"60ms real-time reserve before 2x ACK; no rebuffer on underrun",mainPcmMessages:0}});}return true;}
}
registerProcessor('ed4-pcm-k',Ed4PcmProcessor);
