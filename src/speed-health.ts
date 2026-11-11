/** K host policy only. Does not alter PCM, guest timing, IRQ/DMA or counters. */
export type SpeedPhase='normal-1x'|'normal-2x'|'transient-warning'|'recovering-1x'|'stabilizing'|'ready-to-retry'|'fatal-fault';
type Sample={at:number;gap:number;episodes:number;underflows:number;clamps:number;overflows:number;dropped:number;received:number;consumed:number;output:number};
export class SpeedHealth {
 phase:SpeedPhase='normal-1x';notice='';
 readonly events:any[]=[];
 private previous?:Sample;
 private incidents:{at:number;gap:number;episodes:number;native:number}[]=[];
 private stableSince:number|null=null;
 private stabilizingSince=0;
 private healthyPolls=0;
 private missing=0;
 private recoveries:number[]=[];
 private record(at:number,kind:string,detail:any={}){if(this.events.length===128)this.events.shift();this.events.push({at,kind,...detail});}
 get blocked(){return ['recovering-1x','stabilizing','fatal-fault'].includes(this.phase);}
 baseline(at:number,n:any,w:any){this.previous=this.sample(at,n,w);}
 private sample(at:number,n:any,w:any):Sample{return {at,gap:w.underflowFrames??0,episodes:w.underruns??0,underflows:n.audioUnderflows,clamps:n.audioClamps,overflows:w.overflows??0,dropped:w.droppedFrames??0,received:w.receivedFrames??0,consumed:w.consumedFrames??0,output:w.outputFrames??0};}
 switched(rate:1|2,at:number){this.phase=rate===2?'normal-2x':'normal-1x';this.notice='';this.record(at,'user-rate', {rate});}
 recovering(reason:string,at:number){this.phase='recovering-1x';this.notice=reason;this.recoveries=this.recoveries.filter(t=>at-t<60000);this.recoveries.push(at);this.record(at,'recovery-request',{reason});}
 recovered(at:number,n:any,w:any){
  this.baseline(at,n,w);this.incidents=[];this.missing=0;
  if(this.recoveries.length>=3){this.fatal('최근 60초에 복구가 3회 반복되었습니다. 1×를 유지하며 출력 상태를 확인하세요.',at);return;}
  this.phase='stabilizing';this.notice='native·Worklet 1× 확인. 출력 안정성을 확인하고 있습니다.';
  this.stableSince=null;this.healthyPolls=0;this.stabilizingSince=at;this.record(at,'both-1x-confirmed');
 }
 paused(at:number){this.stableSince=null;this.healthyPolls=0;this.stabilizingSince=at;this.missing=0;this.record(at,'observation-paused');}
 fatal(reason:string,at:number){this.phase='fatal-fault';this.notice=reason;this.record(at,'fatal',{reason});}
 observe(at:number,n:any,w:any,context:string):{action:'none'|'recover'|'fatal';reason?:string}{
  if(this.phase==='fatal-fault'||this.phase==='recovering-1x')return {action:'none'};
  const fail=(reason:string)=>({action:'fatal' as const,reason});
  if(n.rate!==w.rate)return fail('native/Worklet 확인 배속이 일치하지 않습니다.');
  const fresh=Number.isFinite(w.observedAtMs)&&at-w.observedAtMs<1500;
  if(!fresh||context!=='running'){
   this.stableSince=null;this.healthyPolls=0;this.missing++;
   this.notice=context!=='running'?'AudioContext가 실행 중이 아닙니다. 오디오 재개 상태를 확인하세요.':'Worklet 출력 관측이 지연되었습니다.';
   if(this.missing>=3)return fail(this.notice+' 연속 3회 확인 실패.');
   return {action:'none'};
  }
  this.missing=0;const s=this.sample(at,n,w),p=this.previous;this.previous=s;
  if(!p)return {action:'none'};
  const keys=['gap','episodes','underflows','clamps','overflows','dropped','received','consumed','output'] as const;
  if(keys.some(k=>!Number.isFinite(s[k])||s[k]<p[k]))return fail('오디오 누적 계측이 역행하거나 유효하지 않습니다.');
  const gap=(s.gap-p.gap)*1000/w.outputRate,episodes=s.episodes-p.episodes,underflows=s.underflows-p.underflows,clamps=s.clamps-p.clamps;
  if(!Number.isFinite(gap))return fail('Worklet 출력 샘플레이트를 확인할 수 없습니다.');
  if(!Number.isFinite(w.queueAheadMs)||w.queueAheadMs<0||s.overflows>p.overflows||s.dropped>p.dropped||w.queueAheadMs>500)return fail('Worklet 큐 초과/손상 또는 샘플 유실을 관측했습니다.');
  const bad=gap>0||underflows>0||clamps>0;
  this.incidents=this.incidents.filter(e=>at-e.at<4000);
  if(bad){this.incidents.push({at,gap,episodes,native:underflows+clamps});this.record(at,'new-audio-incident',{gapMs:gap,episodes,underflows,clamps,queueAheadMs:w.queueAheadMs});}
  const total=this.incidents.reduce((t,e)=>t+e.gap,0),count=this.incidents.reduce((t,e)=>t+e.episodes,0);
  const severe=gap>=120||underflows>=3||clamps>0;
  const repeated=(total>24&&(this.incidents.length>=2||count>=3))||this.incidents.reduce((t,e)=>t+e.native,0)>=3;
  if(this.phase==='stabilizing'){
   const progressing=s.received>p.received&&s.consumed>p.consumed&&s.output>p.output;
   if(bad||!progressing){this.stableSince=null;this.healthyPolls=0;this.notice='1× 확인됨 · 새로운 공백 또는 출력 공급 대기 중';}
   else{if(at-p.at>1750){this.stableSince=at;this.healthyPolls=0;}this.stableSince??=Math.max(p.at,this.stabilizingSince);this.healthyPolls++;}
   if(this.stableSince!==null&&at-this.stableSince>=8000&&this.healthyPolls>=6){this.phase='ready-to-retry';this.notice='1× 출력 안정성 확인 완료. 원하면 2×를 다시 켤 수 있습니다.';this.record(at,'ready-to-retry');}
   else if(at-this.stabilizingSince>=15000)return fail('1× 확인 후에도 15초 동안 연속 출력 안정성을 확인하지 못했습니다. 배속 재시도를 제한합니다.');
   return {action:'none'};
  }
  if(severe||repeated)return {action:'recover',reason:severe?'심각한 새 오디오 공급 부족/네이티브 상한 증가':'최근 4초 동안 오디오 공급 공백이 반복되었습니다.'};
  if(bad){this.phase='transient-warning';this.notice=`새 오디오 공백 ${gap.toFixed(1)}ms 관측 · 현재 ${n.rate}× 유지`;}
  else if(!this.incidents.length&&this.phase==='transient-warning'){this.phase=n.rate===2?'normal-2x':'normal-1x';this.notice='';}
  return {action:'none'};
 }
 report(){return {phase:this.phase,notice:this.notice,events:[...this.events],limit:128,policy:{recentWindowMs:4000,repeatedGapMs:24,severeSingleGapMs:120,stableMs:8000,stabilizationLimitMs:15000,recoveryLimit:'3 per 60s; manual retry only'}};}
}
