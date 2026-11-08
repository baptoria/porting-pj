// Local Pages-path verification only. Never serves project source/user files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root=resolve('docs'),prefix='/ed4-mobile/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try {
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/ed4-mobile'){res.writeHead(301,{Location:prefix});res.end();return;}
  if(!path.startsWith(prefix)||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('not found');return;}
  const target=resolve(root,path.slice(prefix.length)||'index.html');
  if(!target.startsWith(root+sep)||(await stat(target)).isDirectory())throw Error('not a public file');
  const body=await readFile(target);
  res.writeHead(200,{'Content-Type':mime[extname(target)]??'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch {res.writeHead(404);res.end('not found');}
});
server.listen(4173,'localhost',()=>console.log('Strict Pages preview: http://localhost:4173/ed4-mobile/ (outside prefix = 404)'));
