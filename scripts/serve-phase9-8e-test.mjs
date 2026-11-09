// Local synthetic deployment changes only. Never writes or publishes docs or user files.
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),prefix='/porting-pj/ed4/';
const current=new Map();
async function walk(dir,path=''){for(const e of await readdir(dir,{withFileTypes:true}))if(e.isDirectory())await walk(dir+'/'+e.name,path+e.name+'/');else current.set(path+e.name,await readFile(dir+'/'+e.name));}await walk('docs/ed4');
const original=JSON.parse(current.get('build-manifest.json'));
const previous=new Map(current),oldId=original.build.id+'-prior';
for(const [path,bytes] of previous)if(/\.(js|html|json)$/.test(path)&&!path.startsWith('vendor/'))previous.set(path,Buffer.from(bytes.toString().replaceAll(original.build.id,oldId)));
const priorManifest=JSON.parse(previous.get('build-manifest.json'));for(const f of priorManifest.files){const b=previous.get(f.path);f.bytes=b.length;f.sha256=hash(b);}
let sw=previous.get('sw.js').toString().replace(/^const FILES=.*;$/m,'const FILES='+JSON.stringify(priorManifest.files)+';').replace(/const CACHE=PREFIX\+'[a-f0-9]+';/,"const CACHE=PREFIX+'0011223344556677';");
previous.set('sw.js',Buffer.from(sw));priorManifest.swSha256=hash(sw);previous.set('build-manifest.json',Buffer.from(JSON.stringify(priorManifest)));
let release='b';
const legacyHtml='<h1>Legacy launcher</h1><select id="boot-engine"><option>phase9-7</option></select><script>navigator.serviceWorker.register("./sw.js")</script>';
const legacySw=`const C='ed4-shell-%2Fporting-pj%2Fed4%2F-legacy-test';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html']))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open(C).then(async c=>(await c.match(e.request))||fetch(e.request))));`;
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(req.method==='POST'&&url.pathname==='/__release'){release=url.searchParams.get('id');res.end('ok');return;}
 if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 const path=url.pathname.slice(prefix.length)||'index.html',map=release==='a'?previous:current;
 let body=map.get(path);
 if(release==='legacy'&&path==='index.html')body=Buffer.from(legacyHtml);
 if(release==='legacy'&&path==='sw.js')body=Buffer.from(legacySw);
 if(release==='legacy'&&path==='build-manifest.json')body=undefined;
 if(release==='broken'&&path==='vendor/experimental/phase9-8d/wdosbox.wasm')body=Buffer.from('deliberate incomplete deployment');
 if(release==='bad-sw'&&path==='sw.js')body=Buffer.from('deliberate wrong worker');
 if(!body){res.writeHead(404);res.end('missing');return;}
 const type=path.endsWith('.js')?'text/javascript':path.endsWith('.html')?'text/html':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':path.endsWith('.wasm')?'application/wasm':path.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream';
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(500);res.end();}}).listen(4174,'localhost');
