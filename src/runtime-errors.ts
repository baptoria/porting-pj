// Metadata only: never serialize an Error's arbitrary properties, rejection
// objects, Worker messages, WASM memory, file buffers or filesystem contents.
export function diagnosticText(value: unknown, limit=8192): string {
  if(typeof value!=='string')return '';
  return value.slice(0,limit*2)
    .replace(/(?:https?|file|blob):\/\/[^\s)]+/gi, url=>{
      if(/^file:/i.test(url))return '[host-path]';
      const clean=url.split(/[?#]/)[0];
      return clean.slice(clean.lastIndexOf('/')+1).replace(/^[^@]*@/,'');
    })
    .replace(/[A-Z]:[\\/](?:Users|home)[\\/][^\s)"']+|\/(?:Users|home|storage|sdcard|data\/user|private|tmp)\/[^\s)"']+/gi,'[host-path]')
    .replace(/\b(?:Bearer\s+\S+|(?:token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;)]+)/gi,'[credential]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16})\b/g,'[credential]')
    .slice(0,limit);
}
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
export class RuntimeErrors {
  private events:Record<string,unknown>[]=[];
  private dropped=0;
  record(source:string, value:unknown) {
    const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
    const stack=diagnosticText(v.stack);
    const event={source,at:new Date().toISOString(),name:diagnosticText(v.name,128),message:diagnosticText(v.message,2048),
      stack:stack||undefined,stackAvailable:!!stack,filename:diagnosticText(v.filename,512),lineno:number(v.lineno),colno:number(v.colno),
      stage:diagnosticText(v.stage,128),wasmHeapBytes:number(v.wasmHeapBytes),
      musicMounted:number(v.musicMounted),musicReads:number(v.musicReads),musicBytes:number(v.musicBytes),
      adapterOperation:diagnosticText(v.adapterOperation,128),
      wasmLocations:[...stack.matchAll(/wasm-function\[(\d+)\]:(0x[0-9a-f]+|\d+)/gi)].slice(0,32).map(m=>({functionIndex:Number(m[1]),offset:m[2]}))};
    // Preserve the first failure; a secondary exception must not erase it.
    if(this.events.length<16)this.events.push(event);else this.dropped++;
    return event;
  }
  report(){return {events:[...this.events],dropped:this.dropped,
    note:'Worker/JS/WASM 실행 환경 예외입니다. DOS 프로그램 오류 코드나 ED4 초기화 성공으로 해석하지 않습니다. stackAvailable=false면 브라우저가 스택을 제공하지 않았습니다. 함수 번호/오프셋은 동일 WASM 해시에서만 비교하세요. 오류 객체의 임의 필드/게임 바이트/메모리 덤프는 수집하지 않습니다.'};}
}
