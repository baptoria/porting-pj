// Included in the content-addressed Phase9-6 common Worker only.
let perfId=0,perfActive=false;
const nativePerf=key=>typeof runtime?._ed4_perf_value==='function'?runtime._ed4_perf_value(key):null;
function perfSample(){
 diagnosticSend({name:'ed4-performance',props:{id:perfId,epochMs:performance.timeOrigin+performance.now(),wasmHeapBytes:runtime?.HEAPU8?.buffer?.byteLength??null,
 cyclesMax:nativePerf(0),cyclesAuto:nativePerf(1),guestTicks:nativePerf(2),sampledDecoderWallMs:nativePerf(3),decoderSlices:nativePerf(4),core:nativePerf(5),decoderTimedSlices:nativePerf(6),decoderSampleStride:nativePerf(7)}});
}
self.addEventListener('message',e=>{
 const name=e.data?.name;if(!['ed4-perf-start','ed4-perf-poll','ed4-perf-stop'].includes(name))return;e.stopImmediatePropagation();
 const id=e.data?.id;if(!Number.isSafeInteger(id)||id<1)return;
 try{
  if(name==='ed4-perf-start'){perfId=id;nativePerf(10);perfActive=true;perfSample();}
  else if(id===perfId&&perfActive){perfSample();if(name==='ed4-perf-stop'){nativePerf(11);perfActive=false;}}
 }catch{nativePerf(11);perfActive=false;}
});
