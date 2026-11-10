/** Sparse metadata only. Never synthesizes lost windows; accepts at most 2/packet. */
export class RateWindows {
 private rows:any[]=[];private last=0;private missing=0;private meta:any;
 accept(p:any){
  if(!p||!Array.isArray(p.windows))return;
  for(const r of p.windows.slice(-2)){
   if(!Number.isSafeInteger(r.sequence)||r.sequence<=this.last||![1,2].includes(r.rate)||!Number.isFinite(r.ms)||r.ms<=0)continue;
   this.missing+=r.sequence-this.last-1;this.last=r.sequence;
   if(this.rows.length===256)this.rows.shift();this.rows.push({...r});
  }
  this.meta={totals:p.totals,clock:p.clock};
 }
 report(){return {...this.meta,windows:[...this.rows],limit:256,lastSequence:this.last,missingWindows:this.missing,retiredWindows:Math.max(0,this.last-this.missing-this.rows.length)};}
}
