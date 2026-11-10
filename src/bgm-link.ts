/** Runtime order/filename evidence only. Never authorizes audio suppression or playback. */
export function analyzeBgmLinks(events:any[],tracks:{hash:number;path:string}[]=[]){
 const sorted=[...new Map(events.filter(e=>Number.isSafeInteger(e?.sequence)&&e.sequence>0).map(e=>[e.sequence,e])).values()].sort((a,b)=>a.sequence-b.sequence);
 const links:any[]=[];let current:any,previous=0,precedingStop:any;
 for(const event of sorted){
  const gap=previous>0&&event.sequence!==previous+1;previous=event.sequence;if(gap&&current)current.historyGap=true;
  if(event.kind===4&&event.command===10){precedingStop={sequence:event.sequence,guestTick:event.guestTick,role:'stop-candidate-static-PC-only'};current=undefined;}
  if(event.kind===4&&event.command===9){
   current={sequence:event.sequence,guestTick:event.guestTick,selection:event.bx,caller:{cs:event.cs,returnIp:event.ip},precedingStop,historyGap:false,rawCandidates:[],returned:false,ownershipConfirmed:false};
   links.push(current);precedingStop=undefined;if(links.length>128)links.shift();
  }
  if(event.kind===2&&current){
   const paths=tracks.filter(t=>t.hash===event.fileBasenameHash).map(t=>t.path);
   if(current.rawCandidates.length<16&&!current.rawCandidates.some((r:any)=>r.hash===event.fileBasenameHash))current.rawCandidates.push({hash:event.fileBasenameHash,paths,sequence:event.sequence,guestTick:event.guestTick,uniquePath:paths.length===1});
  }
  if(event.kind===5){const request=links.find(x=>x.sequence===event.requestSequence);if(request){request.returned=true;request.return={sequence:event.sequence,ax:event.command,bx:event.bx,flags:event.returnFlags,guestTick:event.guestTick,meaning:'matched IRET, not driver success'};}}
 }
 const groups:Record<string,any[]>={};for(const link of links)(groups[String(link.selection)]??=[]).push(link);
 const mapping=Object.entries(groups).map(([selection,rows])=>{
  const paths=[...new Set(rows!.flatMap(l=>l.rawCandidates.flatMap((r:any)=>r.paths)))];
  return {selection:Number(selection),paths,observations:rows!.length,consistentSingleCandidate:paths.length===1&&rows!.every(l=>!l.historyGap&&l.rawCandidates.length===1&&l.rawCandidates[0].uniquePath),permissionToPlay:false};
 });
 return {source:'native ordered events + mounted path metadata',links,mapping,ax000a:'stop candidate supported by local PC static dispatch; Galaxy return and audio effect must be checked',productSpeedEnabled:false,nativeBgmSuppression:'unavailable',limitations:['Chronology is not exclusive sample ownership.','RAW reads do not prove play/loop/end. Hash here identifies a basename, not original file content.','No fixed CS/IP hooks, track number filenames, gain changes or audio commands are generated.']};
}
