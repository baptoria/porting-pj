// Read an explicitly supplied diagnostic export, never game files/memory.
import {readFile} from 'node:fs/promises';
if(!process.argv[2])throw Error('Usage: node scripts/analyze-phase9-8d.mjs <diagnostics.json>');
const d=JSON.parse(await readFile(process.argv[2],'utf8')),engine=d.engine,b=engine?.bgmCommands;
const manifest=JSON.parse(await readFile('licenses/phase9-8d-engine.json'));
if(engine?.artifact?.id!=='phase9-8d'||engine.artifact.wasmSha256!==manifest.files['wdosbox.wasm'].sha256)throw Error('Not the reviewed Phase9-8D engine');
if(b?.source!=='live-worker-query')throw Error('No current command snapshot; retry during a running diagnostic');
const events=b.events??[],links=events.filter(e=>e.kind===1&&e.bufferMetadataValid===1).map(e=>{
 const read=events.find(r=>r.sequence===e.addressCandidateReadSequence);
 const candidates=(b.tracks??[]).filter(t=>t.hash===e.fileBasenameHash).map(t=>t.path);
 return {sequence:e.sequence,command:e.command.toString(16),guestTick:e.guestTick,metadataOnly:true,
  relation:!e.addressCandidateReadSequence?'unknown':!read?'read-event-not-retained':read.kind===2?'same-address-after-raw-read':read.kind===3?'same-address-after-efc-read':'unknown',
  fileCandidates:candidates,ambiguousFilename:candidates.length!==1,ownershipConfirmed:false};
});
console.log(JSON.stringify({engine:engine.artifact.id,wasmSha256:engine.artifact.wasmSha256,commands:b.commands,
 requestsObserved:Object.fromEntries(['688','68f','695','698','69c'].map(k=>[k,(b.commands?.[k]??0)>0])),
 int69Calls:b.int69Calls,int69Requests:events.filter(e=>e.kind===4).map(e=>({sequence:e.sequence,guestTick:e.guestTick,ax:e.command,bx:e.bx,cs:e.cs,returnIp:e.ip,psp:e.psp,meaning:'unverified runtime command; not a track mapping'})),
 totalRecorded:b.totalRecorded,overwritten:b.overwritten,rawReads:b.rawReads,efcReads:b.efcReads,
 validBufferEvents:links.length,protectedInt66Events:events.filter(e=>e.kind===1&&e.protectedMode).length,links,
 verdict:'Requests/address candidates only. No inferred BGM start, stop, loop, track ownership or permission to mute.'},null,2));
