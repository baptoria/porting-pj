import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Build scripts intentionally use the same generator/checker as these tests.
// @ts-expect-error Node build helper has no declaration file.
import {workerBundle,checkWorkerBundle} from '../scripts/phase9-3-worker-bundle.mjs';
const common=readFileSync('public/dos-worker.js');
describe('Phase 9-3 immutable Worker bundle',()=>{
 it('copies the common source exactly and pins both URL paths',()=>{const b=workerBundle(common);expect(b.manifest.common).toMatch(/^dos-worker-common-phase9-3-[a-f0-9]{16}\.js$/);expect(b.code).not.toContain("importScripts('./dos-worker.js')");expect(()=>checkWorkerBundle(common,b.code,common,b.manifest)).not.toThrow();});
 it('changes both paths when the common source changes',()=>{const a=workerBundle(common),b=workerBundle(Buffer.concat([common,Buffer.from('\n// new build\n')]));expect(a.manifest.entry).not.toBe(b.manifest.entry);expect(a.manifest.common).not.toBe(b.manifest.common);});
 it.each(['entry','common','manifest'])('rejects stale %s before deployment',which=>{const b=workerBundle(common);expect(()=>checkWorkerBundle(common,which==='entry'?b.code+' ':b.code,which==='common'?Buffer.from('old'):common,which==='manifest'?{...b.manifest,sha256:'wrong'}:b.manifest)).toThrow(/mismatch/);});
 it('refuses a source without a compatible marker',()=>expect(()=>workerBundle(Buffer.from('old Worker'))).toThrow(/marker/));
 it.each(['import failure','missing marker'])('reports %s and closes without a stable fallback',which=>{
  const b=workerBundle(common),messages:any[]=[],imports:string[]=[];let closed=false;
  const self:any={postMessage:(v:unknown)=>messages.push(v),close:()=>{closed=true;}};
  runInNewContext(b.code,{self,importScripts:(url:string)=>{imports.push(url);if(which==='import failure')throw Error('Unknown diagnostic engine');}});
  expect(imports).toEqual(['./'+b.manifest.common]);expect(closed).toBe(true);expect(messages).toHaveLength(1);expect(messages[0]).toMatchObject({name:'ed4-runtime-error',props:{source:'worker-bootstrap',stage:which==='import failure'?'import-common-worker':'check-common-worker'}});expect(messages[0].props.message).toContain('안정 엔진으로 자동 대체하지 않았습니다');
 });
 it('announces the expected bundle only after a successful compatibility check',()=>{const b=workerBundle(common),messages:any[]=[];const self:any={postMessage:(v:unknown)=>messages.push(v),close:()=>{throw Error('unexpected close');}};runInNewContext(b.code,{self,importScripts:()=>{self.ed4CommonWorkerRevision=b.manifest.revision;}});expect(messages).toEqual([{name:'ed4-worker-bootstrap',props:{revision:b.manifest.revision,common:b.manifest.common,sha256:b.manifest.sha256}}]);});
});
