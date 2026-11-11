// This template receives BUILD/FILES/CACHE at build time. No user storage APIs.
let verified=false;
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const fresh=path=>fetch(new URL(path,self.registration.scope),{cache:'no-store'});
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{
  const response=await fresh('build-manifest.json');if(!response.ok)throw Error('Release manifest HTTP '+response.status);
  const manifest=await response.json();
  if(manifest.build?.id!==BUILD.id||JSON.stringify(manifest.files)!==JSON.stringify(FILES))throw Error('Mixed release manifest');
  const cache=await caches.open(CACHE);
  for(const file of FILES){
   const r=await fresh(file.path);if(!r.ok)throw Error('Release asset HTTP '+r.status+': '+file.path);
   const bytes=await r.arrayBuffer();if(bytes.byteLength!==file.bytes||await hex(bytes)!==file.sha256)throw Error('Release hash mismatch: '+file.path);
   await cache.put(new URL(file.path,self.registration.scope),new Response(bytes,{headers:r.headers}));
  }
  await cache.put(new URL('build-manifest.json',self.registration.scope),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
  verified=true;
 }catch(error){
  await caches.delete(CACHE);
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(client.url.startsWith(self.registration.scope))client.postMessage({type:'ED4_INSTALL_ERROR',id:BUILD.id,message:String(error).slice(0,400)});
  throw error;
 }
})()));
async function info(){const r=await (await caches.open(CACHE)).match(new URL('build-manifest.json',self.registration.scope));const manifest=r?await r.json():null;return {build:BUILD,verified:verified||manifest?.build?.id===BUILD.id,swSha256:manifest?.swSha256,cache:CACHE,protocol:2,transition};}
let applying=false,transition='idle';
self.addEventListener('message',event=>{
 const port=event.ports[0];if(!port)return;
 event.waitUntil((async()=>{
  if(event.data?.type==='ED4_VERSION'){port.postMessage(await info());return;}
  if(event.data?.type!=='ED4_APPLY')return;
  const requestId=event.data.requestId;
  const refuse=error=>port.postMessage({error,id:BUILD.id,requestId});
  if(applying){refuse('업데이트 전환 확인 중입니다.');return;}
  const state=await info();
  if(!state.verified||event.data.id!==BUILD.id){refuse('배포 파일 검증이 완료되지 않았습니다.');return;}
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));
  if(windows.length!==1||windows[0].id!==event.source?.id){refuse('다른 실행기 창이 있어 적용을 보류합니다. 데이터는 삭제하지 않습니다.');return;}
  applying=true;transition='locking-client';
  const client=windows[0],channel=new MessageChannel();
  // Missing token is accepted only for the existing HF1 manual-upgrade client.
  const idle=await new Promise(resolve=>{const timer=setTimeout(()=>{channel.port1.close();resolve(false);},3000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.idle===true&&(requestId===undefined||e.data.requestId===requestId));};client.postMessage({type:'ED4_UPDATE_LOCK',id:BUILD.id,requestId},[channel.port2]);});
  const remaining=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));
  if(!idle||remaining.length!==1||remaining[0].id!==client.id){applying=false;refuse('다른 창 또는 진행 중인 작업 때문에 적용을 보류합니다.');return;}
  transition='requesting-activation';
  await self.skipWaiting();transition='activation-requested';
  port.postMessage({accepted:true,id:BUILD.id,requestId});
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const path=url.pathname.slice(scope.pathname.length);
 if(path==='build-manifest.json'||path==='sw.js'||path.startsWith('sources/'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=(!path||path==='index.html')?'index.html':path;
  const response=await cache.match(new URL(key,self.registration.scope));
  if(response)return response;
  return new Response('This file is not in the verified launcher build. Use update.html after ending the game.',{status:503});
 })());
});
