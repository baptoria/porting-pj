import {it,expect} from 'vitest';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {MessageChannel} from 'node:worker_threads';
function fixture(options:{verified?:boolean;idle?:boolean;token?:string;tabs?:number;source?:string}={}){
 const handlers:any={},replies:any[]=[],deleted:string[]=[];let skipped=0,claimed=0;
 const client={id:'one',url:'https://test/ed4/',postMessage:(data:any,ports:any[])=>{ports[0].postMessage({idle:options.idle!==false,requestId:options.token??data.requestId});ports[0].close();}};
 const ctx=vm.createContext({URL,Response,MessageChannel,setTimeout,clearTimeout,
  BUILD:{id:'release-test'},FILES:[],PREFIX:'ed4-shell-public-',CACHE:'ed4-shell-public-new',
  caches:{open:async()=>({match:async()=>options.verified===false?undefined:new Response(JSON.stringify({build:{id:'release-test'},swSha256:'a'.repeat(64)}))}),keys:async()=>['ed4-shell-public-old','ed4-shell-public-new','ed4-shell-dev-old','other-app'],delete:async(n:string)=>{deleted.push(n);return true;}},
  self:{registration:{scope:'https://test/ed4/'},addEventListener:(t:string,f:any)=>handlers[t]=f,clients:{matchAll:async()=>options.tabs===2?[client,{...client,id:'two'}]:[client],claim:async()=>{claimed++;}},skipWaiting:async()=>{skipped++;}},
 });vm.runInContext(readFileSync('scripts/shell-worker.js','utf8'),ctx);
 async function apply(){let pending:Promise<void>|undefined;handlers.message({data:{type:'ED4_APPLY',id:'release-test',requestId:'request-new'},source:{id:options.source??'one'},ports:[{postMessage:(x:any)=>replies.push(x)}],waitUntil:(p:Promise<void>)=>pending=p});await pending;return {skipped,replies};}
 async function activate(){let pending:Promise<void>|undefined;handlers.activate({waitUntil:(p:Promise<void>)=>pending=p});await pending;return {deleted,claimed};}
 return {apply,activate};
}
it('verified one-client lock echoes request identity after requesting activation',async()=>{const r=await fixture().apply();expect(r.skipped).toBe(1);expect(r.replies).toEqual([{accepted:true,id:'release-test',requestId:'request-new'}]);});
for(const options of [{verified:false},{idle:false},{token:'stale-request'},{tabs:2},{source:'other'}])it(`refuses unsafe activation ${JSON.stringify(options)}`,async()=>{const r=await fixture(options).apply();expect(r.skipped).toBe(0);expect(r.replies[0].accepted).toBeUndefined();expect(r.replies[0].error).toBeTruthy();});
it('activation cleans only own versioned shell namespace',async()=>{expect(await fixture().activate()).toEqual({deleted:['ed4-shell-public-old'],claimed:1});});
