import {readFile,readdir,writeFile} from 'node:fs/promises';
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(dir+'/'+e.name):dir+'/'+e.name))).flat();}
const rows=[];
for(const p of await walk(process.argv[2]??'artifacts/phase9-8i/browser'))if(p.endsWith('comparison.json')){
 const d=JSON.parse(await readFile(p)),b=d.before.integratedSpeed,a=d.after.integratedSpeed,f=d.after.performanceWindow,s=d.after.audioSupply;
 const seconds=d.after.frames/d.after.averageFps-d.before.frames/d.before.averageFps;
 rows.push({engine:d.id,cycles:d.cycles,seconds:d.seconds,tones:d.tones,finalRate:a.rate,fault:a.fault,guestTicksPerSecond:f.guestTicksPerWallSecond,
 pcmFramesPerSecond:(d.after.audioOutput.inputFrames-d.before.audioOutput.inputFrames)/seconds,frameCallbacksPerSecond:f.frameCallbacksPerSecond,
 gapMs:a.audio.gapSeconds*1000,episodes:a.audio.underruns,maxQueueMs:a.audio.maxQueueMs??a.audio.maxAheadMs,
 nativeCountersAtLastAck:true,nativeUnderflows:a.control.last.audioUnderflows,nativeClamps:a.control.last.audioClamps,overlaps:a.audio.overlaps,droppedFrames:a.audio.droppedFrames,
 mainArrivalMeanMs:d.mainPcmArrival?.sum/Math.max(1,d.mainPcmArrival?.count),mainArrivalMaxMs:d.mainPcmArrival?.max,
 workerProducerMeanMs:s?.workerIntervalMeanMs,workerProducerMaxMs:s?.workerIntervalMaxMs,workerProcessingMeanMs:s?.workerProcessingMeanMs,workerProcessingMaxMs:s?.workerProcessingMaxMs,
 workletArrivalMeanMs:a.audio.transport?.arrivalMeanMs,workletArrivalMaxMs:a.audio.transport?.arrivalMaxMs,
 metadataDelayMeanMs:s?.metadataDelayMeanMs,metadataDelayMaxMs:s?.metadataDelayMaxMs,
 sampledDecoderWallMs:f.sampledDecoderWallMs,decoderTimedSlices:f.decoderTimedSlices,workerOsCpuMs:f.workerOsCpuMs,
 workerToCanvasMs:f.workerToCanvasMs,wasmHeapBytes:f.samples.at(-1)?.wasmHeapBytes,
 localYield:a.control.last.yield,cyclesObserved:f.samples.map(x=>x.cyclesMax),runtimeErrors:d.after.runtimeErrors.events.length});
}
rows.sort((a,b)=>a.engine.localeCompare(b.engine)||(['12000','16000','24000','max'].indexOf(a.cycles)-['12000','16000','24000','max'].indexOf(b.cycles)));
await writeFile('artifacts/phase9-8i/measurements-final.json',JSON.stringify({notes:'H gap is arrival-after-queue-end; I gap is actual missing rendered samples. Not interchangeable. Fixed source PCM22050 mono. Public test, not Galaxy.',rows},null,2));
console.log(rows.map(r=>({engine:r.engine,cycles:r.cycles,ticks:r.guestTicksPerSecond,rate:r.finalRate,gapMs:r.gapMs})));
