/** H-only request/ack protocol. A timeout never becomes an assumed success. */
export type Speed=1|2;
export class SpeedControl {
 readonly session=crypto.randomUUID();private sequence=0;
 private pending?:{id:number;resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
 rate:Speed=1;verified=false;closed=false;
 readonly events:any[]=[];last:any=null;
 constructor(private send:(message:any)=>void,private changed:()=>void,private timeoutMs=3000){}
 get busy(){return !!this.pending;}
 private record(e:any){if(this.events.length===128)this.events.shift();this.events.push({atMs:performance.now(),...e});}
 request(kind:'set'|'status',rate?:Speed):Promise<any>{
  if(this.closed||this.pending)return Promise.reject(Error('속도 응답 대기 또는 종료 상태입니다.'));
  if(kind==='set'&&rate!==1&&rate!==2)return Promise.reject(Error('1×/2×만 지원합니다.'));
  const id=++this.sequence;this.record({kind:'request',id,operation:kind,rate});
  return new Promise((resolve,reject)=>{
   const fail=(e:Error)=>{this.pending=undefined;this.verified=false;this.record({kind:'failure',id,error:e.message});this.changed();reject(e);};
   const timer=setTimeout(()=>fail(Error('속도 제어 응답시간 초과: 실제 배속을 확인하지 못했습니다.')),this.timeoutMs);
   this.pending={id,resolve,reject:fail,timer};this.changed();
   try{this.send({name:'ed4-speed-request',props:{session:this.session,id,kind,rate}});}catch(e){clearTimeout(timer);fail(e instanceof Error?e:Error(String(e)));}
  });
 }
 accept(p:any){
  if(!this.pending||p?.session!==this.session||p.id!==this.pending.id)return;
  const pending=this.pending;clearTimeout(pending.timer);
  if(!p.ok||p.engine!=='phase9-8h'||![1,2].includes(p.rate)||!['guestTicks','audioFrames','audioUnderflows','audioClamps'].every(k=>Number.isFinite(p[k])&&p[k]>=0)){
   pending.reject(Error('속도 확인 실패: '+(p.error??'잘못된 native 응답')));return;
  }
  this.pending=undefined;this.rate=p.rate;this.verified=true;this.last={...p};this.record({kind:'ack',...p});this.changed();pending.resolve(p);
 }
 cancel(reason:string){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(reason));}}
 close(){this.closed=true;this.cancel('실험 세션 종료');this.verified=false;this.changed();}
 report(){return {session:this.session,rate:this.rate,verified:this.verified,pending:this.busy,closed:this.closed,last:this.last,events:[...this.events],limit:128};}
}
