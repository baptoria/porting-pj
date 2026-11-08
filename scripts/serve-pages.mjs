// Local Pages-path verification only. Never serves project source/user files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root=resolve('docs'),prefix='/porting-pj/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try {
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path===prefix.slice(0,-1)){res.writeHead(301,{Location:prefix});res.end();return;}
  if(!path.startsWith(prefix)||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('not found');return;}
  let target=resolve(root,path.slice(prefix.length));
  if(target!==root&&!target.startsWith(root+sep))throw Error('not a public file');
  if((await stat(target)).isDirectory()){
   if(!path.endsWith('/')){res.writeHead(301,{Location:path+'/'});res.end();return;}
   target=resolve(target,'index.html');
  }
  const body=await readFile(target);
  res.writeHead(200,{'Content-Type':mime[extname(target)]??'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch {res.writeHead(404);res.end('not found');}
});
server.listen(4173,'localhost',()=>console.log('Strict Pages preview: http://localhost:4173/porting-pj/ed4/ (outside /porting-pj/ = 404)'));
