// Test-only server. Never copied into the Pages runtime. Old Worker fixtures are
// exact Git sources; the SW keeps the production cache-first fetch algorithm.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('docs'),prefix='/porting-pj/',app=prefix+'ed4/';
const old=await readFile('tests/fixtures/phase9-3-hotfix/dos-worker-phase9-2.js','utf8');
const entry=await readFile('tests/fixtures/phase9-3-hotfix/entry-before-hotfix.js','utf8');
const manifest=JSON.parse(await readFile('docs/ed4/phase9-4-worker.json','utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip'};
async function fixture(mode){
 let sw=await readFile('docs/ed4/sw.js','utf8');
 sw=sw.replace(/const CACHE=.*;/,"const CACHE='ed4-hotfix-fixture-"+mode+"';");
 if(mode==='network')sw=sw.replace(/const URLS=(.*);/,(_,json)=>'const URLS='+JSON.stringify(JSON.parse(json).filter(p=>![manifest.entry,manifest.common].some(f=>p==='./'+f)))+';');
 const response=s=>`new Response(${JSON.stringify(s)},{headers:{'Content-Type':'text/javascript'}})`;
 sw=sw.replace('c=>c.addAll(URLS)',`async c=>{await c.addAll(URLS);await c.put(new URL('./dos-worker.js',self.registration.scope),${response(old)});await c.put(new URL('./dos-worker-phase9-3.js',self.registration.scope),${response(entry)});}`);
 // Playwright offline emulation alone need not cut off an already-running SW
 // target. Block its network transport explicitly; cached responses still work.
 sw="let fixtureOffline=false;self.addEventListener('message',e=>{if(e.data==='fixture-offline'){fixtureOffline=true;e.ports[0].postMessage('ok');}});\n"+sw;
 sw=sw.replace('||fetch(e.request).catch','||(fixtureOffline?Promise.reject(Error("fixture offline")):fetch(e.request)).catch');
 return sw;
}
createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let b,type;
  if(path===app+'test-sw-network.js'||path===app+'test-sw-warm.js'){b=Buffer.from(await fixture(path.includes('network')?'network':'warm'));type=mime['.js'];}
  else if(path===app+'dos-worker-phase9-3-before-hotfix.js'){b=Buffer.from(entry);type=mime['.js'];}
  else{
   if(!path.startsWith(prefix))throw Error('outside public directory');
   let p=resolve(root,path.slice(prefix.length));if(p!==root&&!p.startsWith(root+sep))throw Error('outside public directory');
   if((await stat(p)).isDirectory())p=resolve(p,'index.html');b=await readFile(p);type=mime[extname(p)]??'text/plain';
  }
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(b);
 }catch{res.writeHead(404);res.end('not found');}
}).listen(4173,'localhost',()=>console.log('Phase 9-4 mixed-cache test server'));
