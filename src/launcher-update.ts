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
 host.innerHTML='<details id="launcher-version"><summary>실행기 버전 · 업데이트</summary><pre id="launcher-build"></pre><p id="update-status" role="status"></p><button id="update-check">새 버전 확인</button><button id="update-apply" disabled>업데이트 적용</button><p>게임 종료 후 다른 실행기 창을 닫고 적용하세요. 게임·음악·세이브·조작 설정은 유지됩니다. <a href="./update.html">안전한 업데이트 페이지</a></p></details>';
 if(bootstrap)(host.querySelector('details') as HTMLDetailsElement).open=true;
 const q=(s:string)=>host.querySelector<HTMLElement>(s)!;
 const apply=q('#update-apply') as HTMLButtonElement;
 let registration:ServiceWorkerRegistration|undefined,latest:Release|undefined,active:any=null,waiting:any=null,message='버전 확인 대기',locked=false,consent=false,applying=false,installFailure='';
 let postUpdate:{expected:string;actual:string;matches:boolean}|null=null;
 const report=()=>({loadedFrontend:{...BUILD},activeServiceWorker:active,waitingServiceWorker:waiting,latestDeployment:latest?.build??null,postUpdate,status:message});
 const draw=()=>{q('#launcher-build').textContent=`현재 코드: ${BUILD.id}\nGit: ${BUILD.commit}${BUILD.dirty?' + 미커밋 변경':''}\n빌드: ${BUILD.builtAt}\n서비스 워커: ${active?.build?.id??'미확인 (구버전 포함)'}\n온라인 배포: ${latest?.build.id??'미확인'}\n대기 중: ${waiting?.build?.id??'없음/미확인'}`;q('#update-status').textContent=message;apply.disabled=busy()||locked||!waiting?.verified||waiting.build.id!==latest?.build.id;};
 async function refresh(){
  active=await workerMessage(navigator.serviceWorker.controller??registration?.active,{type:'ED4_VERSION'}).catch(()=>null);
  waiting=await workerMessage(registration?.waiting,{type:'ED4_VERSION'}).catch(()=>null);
  if(waiting?.verified)message='검증된 새 실행기가 준비되었습니다. 게임 종료 후 업데이트 적용을 누르세요.';
  else if(latest?.build.id===BUILD.id)message='온라인 배포와 현재 코드의 빌드 ID가 같습니다.';
  else if(latest)message='다른 배포 버전 감지 · 서비스 워커 파일 검증 중 또는 설치 대기';
  if(active?.build.id&&active.build.id!==BUILD.id&&!bootstrap)message='현재 코드와 서비스 워커 버전이 다릅니다. 게임 종료 후 업데이트를 확인하세요.';
  if(installFailure){message=installFailure;waiting=null;}
  draw();
 }
 const watch=(worker:ServiceWorker|null)=>worker?.addEventListener('statechange',()=>{if(worker.state==='installed')void refresh();if(worker.state==='redundant'){installFailure||='새 배포 설치/해시 검증 실패. 기존 실행기와 사용자 데이터는 유지됩니다. 배포 완료 후 다시 확인하세요.';message=installFailure;waiting=null;draw();}});
 async function check(){
  try{
   latest=undefined;waiting=null;installFailure='';message='온라인 배포 및 서비스 워커 확인 중…';draw();
   const base=import.meta.env.BASE_URL,nonce=Date.now();
   const response=await fetch(`${base}build-manifest.json?check=${nonce}`,{cache:'no-store'});if(!response.ok)throw Error(`배포 manifest HTTP ${response.status}. Pages 배포 성공 여부를 확인하세요.`);
   const release=await response.json();if(!validateRelease(release))throw Error('배포 manifest 형식 오류');
   const sw=await fetch(`${base}sw.js?check=${nonce}`,{cache:'no-store'});if(!sw.ok)throw Error('서비스 워커 파일 읽기 실패');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await sw.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==release.swSha256)throw Error('온라인 manifest와 서비스 워커 해시 불일치. 새 버전으로 전환하지 않습니다.');
   latest=release;
   registration=await navigator.serviceWorker.register(`${base}sw.js`,{updateViaCache:'none'});
   registration.addEventListener('updatefound',()=>watch(registration!.installing));watch(registration.installing);
   await registration.update();await refresh();
  }catch(e){message=String(e)+' · 현재 실행기는 계속 사용할 수 있습니다.';draw();}
 }
 navigator.serviceWorker?.addEventListener('message',e=>{
  if(e.data?.type==='ED4_INSTALL_ERROR'&&e.data.id===latest?.build.id){installFailure='배포 검증 실패: '+String(e.data.message).slice(0,400)+' · 기존 실행기와 사용자 데이터 유지';message=installFailure;waiting=null;draw();return;}
  if(e.data?.type!=='ED4_UPDATE_LOCK')return;
  const idle=consent&&!busy()&&e.data.id===latest?.build.id;
  if(idle){locked=true;draw();}e.ports[0]?.postMessage({idle});
 });
 navigator.serviceWorker?.addEventListener('controllerchange',()=>{
  if(applying&&locked&&!busy())location.replace(import.meta.env.BASE_URL);
  else void refresh();
 });
 apply.onclick=async()=>{
  if(busy()){message='게임 종료 후 적용하세요.';draw();return;}
  consent=true;applying=true;
  try{
   if(!latest||!registration?.waiting)throw Error('대기 중인 검증된 업데이트가 없습니다.');
   sessionStorage.setItem('ed4-expected-build',latest.build.id);
   const reply=await workerMessage(registration.waiting,{type:'ED4_APPLY',id:latest.build.id},7000);
   if(!reply?.accepted)throw Error(reply?.error??'업데이트 활성화 실패');
   message='검증된 실행기로 전환 중…';draw();
   setTimeout(()=>{if(applying){message='서비스 워커 전환 응답이 지연됩니다. 안전한 업데이트 페이지를 열어 다시 확인하세요. 사용자 데이터는 유지되며 혼합 실행을 막기 위해 새 게임 시작은 잠겨 있습니다.';draw();}},12000);
  }catch(e){locked=false;consent=false;applying=false;sessionStorage.removeItem('ed4-expected-build');message=String(e);draw();}
 };
 q('#update-check').onclick=()=>void check();
 try{const expected=sessionStorage.getItem('ed4-expected-build');if(expected){postUpdate={expected,actual:BUILD.id,matches:expected===BUILD.id};message=expected===BUILD.id?'업데이트 후 실제 빌드 ID 재검증 완료':'업데이트 후 빌드 ID 불일치. 게임 시작 전 새 버전을 다시 확인하세요.';if(expected===BUILD.id)sessionStorage.removeItem('ed4-expected-build');}}catch{}
 draw();new MutationObserver(draw).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Active SW identity remains observable offline; do not gate it on network success.
 if('serviceWorker' in navigator&&import.meta.env.PROD){void refresh();void check();}
 return {check,report,get locked(){return locked;},get incompatible(){return !!active?.build.id&&active.build.id!==BUILD.id;}};
}
