import {storageKey} from './app-storage';
import BUILD from './build-info.json';
export {BUILD};
type Release={format:string;version:number;build:typeof BUILD;files:{path:string;bytes:number;sha256:string}[];swSha256:string};
export function validateRelease(value:any):value is Release{
 return value?.format==='ed4-shell-release'&&value.version===1&&typeof value.build?.id==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(value.build.id)&&/^[a-f0-9]{64}$/.test(value.swSha256)&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=1000&&new Set(value.files.map((f:any)=>f.path)).size===value.files.length&&value.files.every((f:any)=>typeof f.path==='string'&&/^[a-zA-Z0-9_./-]+$/.test(f.path)&&!f.path.startsWith('/')&&!f.path.split('/').some((p:string)=>!p||p==='.'||p==='..')&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256));
}
export async function workerMessage(worker:ServiceWorker|undefined|null,data:unknown,timeout=4000):Promise<any>{
 if(!worker)return null;
 return new Promise((resolve,reject)=>{const c=new MessageChannel();const timer=setTimeout(()=>{c.port1.close();reject(Error('서비스 워커가 버전 응답을 제공하지 않습니다 (구버전 또는 응답 지연).'));},timeout);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data);};worker.postMessage(data,[c.port2]);});
}
export function installLauncherUpdate(host:HTMLElement,busy:()=>boolean,bootstrap=false){
 host.innerHTML='<details id="launcher-version"><summary>실행기 버전 · 업데이트</summary><pre id="launcher-build"></pre><p id="update-status" role="status"></p><button id="update-check">새 버전 확인</button><button id="update-apply" disabled>업데이트 적용</button><p>새 버전은 작업 종료 후 자동 적용됩니다. 다른 실행기 창이 열려 있으면 보류합니다. 게임·음악·세이브·조작 설정은 유지됩니다. <a href="./update.html">안전한 업데이트 페이지</a></p></details>';
 if(bootstrap)(host.querySelector('details') as HTMLDetailsElement).open=true;
 const q=(s:string)=>host.querySelector<HTMLElement>(s)!,button=q('#update-apply') as HTMLButtonElement,base=import.meta.env.BASE_URL;
 const expectedKey=storageKey('ed4-expected-build'),attemptKey=storageKey('ed4-update-attempt');
 let registration:ServiceWorkerRegistration|undefined,latest:Release|undefined,active:any=null,waiting:any=null;
 let message='',locked=false,applying=false,checking:Promise<void>|undefined,refreshing:Promise<void>|undefined;
 let checkedAt=0,lastCheck=0,retryAt=0,installFailure='',autoBlocked=false,reloaded=false;
 let target:ServiceWorker|null=null,requestId='',targetId='';
 let postUpdate:{expected:string;actual:string;matches:boolean;verified?:boolean}|null=null;
 const events:{at:number;kind:string;id?:string}[]=[];
 const record=(kind:string,id?:string)=>{if(events.length===64)events.shift();events.push({at:Date.now(),kind,id});};
 const report=()=>({loadedFrontend:{...BUILD},activeServiceWorker:active,waitingServiceWorker:waiting,latestDeployment:latest?.build??null,postUpdate,status:message,automatic:{locked,applying,autoBlocked,events:[...events]}});
 function draw(){
  q('#launcher-build').textContent=`현재 코드: ${BUILD.id}\nGit: ${BUILD.commit}${BUILD.dirty?' + 미커밋 변경':''}\n빌드: ${BUILD.builtAt}\n서비스 워커: ${active?.build?.id??'미확인 (구버전 포함)'}\n온라인 배포: ${latest?.build.id??'미확인'}\n대기 중: ${waiting?.build?.id??'없음/미확인'}`;
  q('#update-status').textContent=message;
  button.disabled=busy()||locked||applying||!navigator.onLine||!waiting?.verified||waiting.build.id!==latest?.build.id||!!installFailure;
 }
 function matching(info:any){return !!latest&&info?.verified&&info.build?.id===latest.build.id&&info.swSha256===latest.swSha256;}
 function refreshed(){
  if(postUpdate?.matches&&matching(active)&&active.build.id===BUILD.id){postUpdate.verified=true;message='업데이트 완료';try{sessionStorage.removeItem(expectedKey);sessionStorage.removeItem(attemptKey);}catch{}}
  else if(installFailure)message=installFailure;
  else if(matching(waiting))message=busy()?'새 버전 준비 완료 · 현재 작업 종료 후 자동 적용합니다.':'검증된 새 실행기 준비 완료 · 안전한 전환 확인 중';
  else if(latest?.build.id===BUILD.id&&!autoBlocked)message='';
  if(autoBlocked)message='자동 전환 확인이 완료되지 않았습니다. 현재 버전을 유지합니다. 고급 메뉴에서 다시 확인·적용할 수 있습니다.';
  draw();
 }
 async function refresh(){
  if(refreshing){await refreshing;return refresh();}
  refreshing=(async()=>{
   const controller=navigator.serviceWorker.controller??registration?.active,worker=registration?.waiting;
   const [a,w]=await Promise.all([workerMessage(controller,{type:'ED4_VERSION'}).catch(()=>null),workerMessage(worker,{type:'ED4_VERSION'}).catch(()=>null)]);
   if(controller===(navigator.serviceWorker.controller??registration?.active))active=a;
   if(worker===registration?.waiting)waiting=w;
   refreshed();
  })();try{await refreshing;}finally{refreshing=undefined;}
 }
 const watched=new WeakSet<ServiceWorker>(),registrations=new WeakSet<ServiceWorkerRegistration>();let installEpoch=0;
 function watch(worker:ServiceWorker|null){if(!worker||watched.has(worker))return;watched.add(worker);installEpoch++;worker.addEventListener('statechange',()=>{
  if(worker.state==='installed')void refresh().then(()=>maybeApply());
  if(worker.state==='redundant'&&registration?.active!==worker&&!applying){installFailure='새 배포 설치/검증 실패 · 현재 실행기와 데이터는 유지됩니다. 온라인에서 다시 확인합니다.';waiting=null;record('install-failed');draw();}
 });}
 async function check(force=true){
  if(checking)return checking;
  if(applying||!navigator.onLine||(!force&&Date.now()-lastCheck<60000))return;
  lastCheck=Date.now();
  checking=(async()=>{try{
   const initialInstall=installEpoch;installFailure='';message=busy()?'':'새 실행기 확인 중…';draw();
   const nonce=Date.now(),response=await fetch(`${base}build-manifest.json?check=${nonce}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(`배포 manifest HTTP ${response.status}`);
   const release=await response.json();if(!validateRelease(release)||release.build.audience!==BUILD.audience)throw Error('배포 manifest 형식/공개·개발 구분 오류');
   const sw=await fetch(`${base}sw.js?check=${nonce}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!sw.ok)throw Error('서비스 워커 파일 읽기 실패');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await sw.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==release.swSha256)throw Error('온라인 manifest와 서비스 워커 해시 불일치');
   latest=release;checkedAt=Date.now();
   registration=await navigator.serviceWorker.getRegistration(base);
   if(registration?.scope!==new URL(base,location.href).href)registration=undefined;
   if(!registration)registration=await navigator.serviceWorker.register(`${base}sw.js`,{scope:base,updateViaCache:'none'});
   if(!registrations.has(registration)){registrations.add(registration);registration.addEventListener('updatefound',()=>watch(registration!.installing));}
   watch(registration.installing);await refresh();
   if(initialInstall===installEpoch&&!installFailure&&!matching(active)&&!matching(waiting)&&!registration.installing){await registration.update();watch(registration.installing);await refresh();}
   record('checked',latest.build.id);
  }catch(e){latest=undefined;waiting=null;checkedAt=0;message=String(e)+' · 현재 버전 계속 사용. 온라인 복귀 또는 새 버전 확인으로 재시도할 수 있습니다.';record('check-failed');draw();}})();
  try{await checking;}finally{checking=undefined;}
  await maybeApply();
 }
 async function finishTransition(){
  if(!applying||!locked||busy()||reloaded)return;
  const controller=navigator.serviceWorker.controller,info=await workerMessage(navigator.serviceWorker.controller,{type:'ED4_VERSION'}).catch(()=>null);
  if(!applying||!locked||busy()||reloaded||controller!==navigator.serviceWorker.controller)return;
  if(!matching(info)||info.build.id!==targetId){message='전환된 서비스 워커 확인 실패 · 새로고침하지 않고 새 실행을 보호합니다.';draw();return;}
  try{const attempt=JSON.parse(sessionStorage.getItem(attemptKey)??'null');if(attempt?.reloaded){autoBlocked=true;message='중복 자동 갱신을 차단했습니다. 수동 업데이트를 확인하세요.';draw();return;}sessionStorage.setItem(attemptKey,JSON.stringify({target:targetId,from:BUILD.id,reloaded:true}));}catch{autoBlocked=true;message='안전한 갱신 기록을 보관할 수 없어 자동 갱신을 보류합니다.';draw();return;}
  reloaded=true;record('reload',targetId);location.replace(base);
 }
 async function apply(manual=false){
  if(applying||busy()||!navigator.onLine||!latest||!matching(waiting)||installFailure)return;
  if(!manual&&(autoBlocked||Date.now()<retryAt))return;
  if(Date.now()-checkedAt>60000){await check();return;}
  target=registration?.waiting??null;if(!target)return;
  requestId=crypto.randomUUID();targetId=latest.build.id;applying=true;
  try{
   // Synchronous lock closes idle -> new registration/start race before any await.
   locked=true;sessionStorage.setItem(expectedKey,targetId);sessionStorage.setItem(attemptKey,JSON.stringify({target:targetId,from:BUILD.id,reloaded:false}));
   record('apply-request',targetId);draw();
   const reply=await workerMessage(target,{type:'ED4_APPLY',id:targetId,requestId},7000);
   if(reply?.id!==targetId||reply?.requestId!==requestId||!reply.accepted)throw Error(reply?.error??'활성화 확인 응답 불일치');
   message='검증된 실행기로 전환 중…';draw();await finishTransition();
   setTimeout(()=>{if(applying&&!reloaded){autoBlocked=true;message='서비스 워커 전환 확인 지연 · 코드 혼합을 막기 위해 새 작업은 잠겨 있습니다. 안전한 업데이트 페이지에서 확인하세요.';draw();}},12000);
  }catch(e){
   const info=await workerMessage(navigator.serviceWorker.controller,{type:'ED4_VERSION'}).catch(()=>null);
   if(info?.build?.id===targetId&&matching(info)){await finishTransition();return;}
   if(target?.state==='activating'||target?.state==='activated'){autoBlocked=true;message='활성화 응답 확인 실패 · 새 작업을 보호합니다. 수동 업데이트를 확인하세요.';draw();return;}
   locked=false;applying=false;autoBlocked=false;retryAt=Date.now()+15000;
   sessionStorage.removeItem(expectedKey);sessionStorage.removeItem(attemptKey);
   message=String(e)+' · 자동 적용을 보류하고 다시 확인합니다.';record('apply-deferred',targetId);draw();
  }
 }
 async function maybeApply(){if(!applying&&!checking&&!busy()&&!autoBlocked&&navigator.onLine&&matching(waiting)&&Date.now()>=retryAt)await apply();}
 navigator.serviceWorker?.addEventListener('message',e=>{
  if(e.data?.type==='ED4_INSTALL_ERROR'&&e.data.id===latest?.build.id){installFailure='배포 검증 실패: '+String(e.data.message).slice(0,400)+' · 기존 실행기와 사용자 데이터 유지';waiting=null;message=installFailure;record('install-failed',e.data.id);draw();return;}
  if(e.data?.type!=='ED4_UPDATE_LOCK')return;
  const idle=applying&&locked&&!busy()&&e.source===target&&e.data.id===targetId&&e.data.requestId===requestId;
  e.ports[0]?.postMessage({idle,requestId:e.data.requestId});
 });
 navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(applying)void finishTransition();else void refresh();});
 button.onclick=()=>{autoBlocked=false;retryAt=0;void apply(true);};q('#update-check').onclick=()=>void check();
 try{const expected=sessionStorage.getItem(expectedKey);if(expected){postUpdate={expected,actual:BUILD.id,matches:expected===BUILD.id};if(expected!==BUILD.id){autoBlocked=true;record('frontend-mismatch',expected);}}}catch{autoBlocked=true;}
 let wasBusy=busy();
 const reevaluate=()=>{const ended=wasBusy&&!busy();wasBusy=busy();draw();if(ended&&!applying&&(registration?.waiting||Date.now()-lastCheck>=60000))void check();else void maybeApply();};
 new MutationObserver(reevaluate).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open']});
 const wake=()=>{if(document.visibilityState==='visible'&&navigator.onLine){void check(false);void maybeApply();}};
 window.addEventListener('online',()=>{lastCheck=0;wake();});window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('ed4-update-idle',reevaluate);
 setInterval(()=>{if(document.visibilityState!=='visible')return;if(!busy()&&(Date.now()-lastCheck>=300000||(registration?.waiting&&waiting?.build?.id!==latest?.build.id&&Date.now()-lastCheck>=60000)))void check(false);void maybeApply();},1000);
 draw();
 if('serviceWorker' in navigator&&import.meta.env.PROD){void navigator.serviceWorker.getRegistration(base).then(r=>{registration=r;return refresh();});void check();}
 return {check,report,get locked(){return locked;},get incompatible(){return !!active?.build.id&&active.build.id!==BUILD.id;}};
}
