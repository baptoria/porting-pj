// Bounded manual measurement; no game bytes, filenames, or unbounded frame log.
export class PerformanceWindow {
 active=false; private startMs=0;private endMs=0;
 private frames=0;private paints=0;private drawMs=0;private audioMs=0;private audioCallbacks=0;private audioSamples=0;
 private delayCount=0;private delaySum=0;private delayMax=0;
 private invalid=new Set<string>();private samples:Record<string,number|null>[]=[];
 start(now:number){this.startMs=now;this.active=true;}
 invalidate(reason:'hidden'|'paused'|'stopped'|'runtime-error'){if(this.active)this.invalid.add(reason);}
 frame(drawMs:number,delay?:number){if(!this.active)return;this.frames++;this.drawMs+=Math.max(0,drawMs);if(delay!==undefined&&Number.isFinite(delay)&&delay>=0&&delay<60000){this.delayCount++;this.delaySum+=delay;this.delayMax=Math.max(this.delayMax,delay);}}
 paint(){if(this.active)this.paints++;}
 audio(ms:number,samples:number){if(this.active){this.audioMs+=Math.max(0,ms);this.audioCallbacks++;this.audioSamples+=samples;}}
 sample(value:unknown){
  if(!value||typeof value!=='object'||this.samples.length>=40)return;
  const src=value as Record<string,unknown>,out:Record<string,number|null>={};
  for(const key of ['epochMs','wasmHeapBytes','cyclesMax','cyclesAuto','guestTicks','sampledDecoderWallMs','decoderSlices','decoderTimedSlices','decoderSampleStride','core']){const n=src[key];out[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}
  if(out.epochMs!==null)this.samples.push(out);
 }
 finish(now:number){if(this.active){this.endMs=now;this.active=false;}}
 report(now=performance.now()){
  const elapsedMs=Math.max(0,(this.active?now:this.endMs)-this.startMs),seconds=elapsedMs/1000;
  const first=this.samples[0],last=this.samples.at(-1);
  const nativeMs=first&&last?Number(last.epochMs)-Number(first.epochMs):0;
  const delta=(key:string)=>first?.[key]!=null&&last?.[key]!=null&&last[key]>=first[key]?last[key]-first[key]:null;
  const ticks=delta('guestTicks');
  return {active:this.active,elapsedMs,valid:!this.active&&elapsedMs>=29000&&!this.invalid.size,invalidReasons:[...this.invalid],
   frameCallbacks:this.frames,frameCallbacksPerSecond:seconds?this.frames/seconds:0,
   canvasPaintOpportunities:this.paints,canvasPaintOpportunitiesPerSecond:seconds?this.paints/seconds:0,
   canvasSubmitMs:this.drawMs,workerToCanvasMs:this.delayCount?{mean:this.delaySum/this.delayCount,max:this.delayMax,count:this.delayCount}:null,
   audioCallbacks:this.audioCallbacks,audioSamples:this.audioSamples,audioCallbackMs:this.audioMs,
   nativeSampleMs:nativeMs,guestTicksPerWallSecond:ticks!==null&&nativeMs>0?ticks*1000/nativeMs:null,
   sampledDecoderWallMs:delta('sampledDecoderWallMs'),decoderSlices:delta('decoderSlices'),decoderTimedSlices:delta('decoderTimedSlices'),workerOsCpuMs:null,samples:this.samples.map(s=>({...s})),
   definitions:'Manual post-loading window. Paint opportunities are rAF observations after canvas submission, NOT physical display FPS. Worker-to-canvas is postMessage-to-submit latency, NOT full frame generation latency. Sampled decoder wall time is the sum for 1/1024 decoder calls only, not extrapolated; it is NOT OS thread CPU time and may include Asyncify/nested waits. PIC ticks are emulator milliseconds, NOT instructions or game simulation steps. Heap is WASM linear memory, NOT total process RAM. Legacy engines may have no native/Worker telemetry.'};
 }
}
