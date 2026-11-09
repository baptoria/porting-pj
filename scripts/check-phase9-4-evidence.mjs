// Validate the captured public A/B observations independently of UI reporting.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {probes} from './phase9-4-probes.mjs';
const root='artifacts/phase9-4',rows=[];
const manifest=JSON.parse(await readFile(root+'/engine-manifest.json','utf8'));
for(const p of probes){
 const pair=[];
 for(const variant of ['baseline','first-trace']){
  const r=JSON.parse(await readFile(`${root}/browser/first-${variant}-${p.name}/result.json`,'utf8'));
  const h=r.worker.histories[0],route=p.name==='int18'?1:p.name==='int19'?2:3;
  assert.equal(r.worker.events.find(e=>e.kind===4)?.route,route,p.name+' handler route');
  assert(r.worker.events.some(e=>e.kind===5),p.name+' original abort');
  assert.equal(h.reason,route===3?1:2);
  if(route!==3){assert(!h.records.some(e=>e.after.linear===0xffff0));assert(h.records.some(e=>e.interruptNumber===(route===1?24:25)));}
  if(variant==='first-trace')assert.equal(r.engine.wasmSha256,manifest.files['wdosbox.wasm'].sha256);
  const last=h.records.at(-1);pair.push({variant,route,instructions:h.instructions,overwritten:h.overwritten,historyJsonBytes:Buffer.byteLength(JSON.stringify(h)),last:{kind:last.kind,before:{cs:last.before.cs,ip:last.before.ip},after:{cs:last.after.cs,ip:last.after.ip}},anchors:h.first?.anchors.map(a=>({type:a.type,sequence:a.event.sequence,continuity:a.continuity,fetchConfirmed:a.fetchConfirmed,pre:a.before.length,post:a.after.length,occurrences:a.occurrences}))});
 }
 // Each authored deterministic path reaches the same final CPU transfer.
 assert.deepEqual(pair[0].last,pair[1].last,p.name+' A/B final transfer');
 rows.push({probe:p.name,pair});
}
await writeFile(root+'/evidence-summary.json',JSON.stringify(rows,null,2));
console.log(`${rows.length} public A/B routes, original aborts, final transfers, and Phase 9-4 hashes verified.`);
