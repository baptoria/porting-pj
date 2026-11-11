// Test-only local server for byte-exact previous release -> candidate -> v4 rollback.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const roots={legacy:resolve('artifacts/phase9-8r/rollback-original'),current:resolve('docs/ed4'),rollback:resolve('artifacts/phase9-8r/rollback-compatible-v4')};let version='legacy';
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');if(req.method==='POST'&&u.pathname==='/__release'){const next=u.searchParams.get('version');if(!roots[next])throw Error();version=next;res.end('ok');return;}
 const prefix='/porting-pj/ed4/';if(!u.pathname.startsWith(prefix)||!['GET','HEAD'].includes(req.method))throw Error();
 const root=roots[version];let path=resolve(root,decodeURIComponent(u.pathname.slice(prefix.length))||'index.html');if(!path.startsWith(root+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');
 const b=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:b);
}catch{res.writeHead(404);res.end('missing');}}).listen(4176,'localhost');
