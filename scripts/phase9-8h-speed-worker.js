// GPL-2.0-only. Only the explicitly selected, pinned H Worker enables this protocol.
let speedSession=null,speedSequence=0;
self.addEventListener('message',event=>{
 const m=event.data;if(m?.name!=='ed4-speed-request')return;event.stopImmediatePropagation();
 const p=m.props;if(!p||typeof p.session!=='string'||p.session.length>80||!Number.isSafeInteger(p.id)||p.id<1)return;
 let result={session:p.session,id:p.id,engine:'phase9-8h',ok:false};
 try{
  if(self.ed4DiagnosticEngine!=='phase9-8h'||runtimeStage!=='running')throw Error('Speed backend not running');
  if(typeof runtime?._ed4_speed_value!=='function'||typeof runtime?._ed4_audio_value!=='function')throw Error('Native speed/audio exports unavailable');
  if(speedSession===null){if(p.kind!=='set'||p.rate!==1)throw Error('Initialize speed at 1x');speedSession=p.session;}
  if(p.session!==speedSession||p.id<=speedSequence)throw Error('Stale speed request');
  speedSequence=p.id;
  if(p.kind==='set'){
   if(p.rate!==1&&p.rate!==2)throw Error('Only 1x/2x supported');
   if(runtime._ed4_test_set_speed(p.rate)!==p.rate)throw Error('Native speed refused');
  }else if(p.kind!=='status')throw Error('Unknown speed operation');
  result={...result,ok:true,rate:runtime._ed4_speed_value(),guestTicks:runtime._ed4_perf_value(2),cycles:runtime._ed4_perf_value(0),cyclesAuto:runtime._ed4_perf_value(1),
   audioFrames:runtime._ed4_audio_value(0),audioUnderflows:runtime._ed4_audio_value(1),audioClamps:runtime._ed4_audio_value(2),workerTime:performance.now()};
 }catch(e){result.error=String(e.message).slice(0,240);}
 self.postMessage({name:'ed4-speed-response',props:result});
});
