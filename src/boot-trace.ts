import { validateExecutable } from './archive';
import { inspectGame } from './file-analysis';
import type { Files } from './model';

export interface BootStep {
  id: number; batch: string; line: number; command: string; program?: string;
  category: 'sound'|'game'|'korean-candidate'|'cd-drive'|'batch'|'initialization';
  afterExpected: boolean;
}
export interface BootPlan {
  entry: string; executable: string; steps: BootStep[]; issues: string[];
  generated: Files; evidence: { koreanCandidates:string[]; cdImages:string[]; driveCommands:BootStep[] };
}
const dir=(p:string)=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
function resolve(cwd:string,value:string) {
  let p=value.replace(/\\/g,'/').toUpperCase();
  if(/^[A-Z]:/.test(p)){if(!p.startsWith('C:/'))throw Error('C: 이외 드라이브 또는 드라이브 상대 경로');p=p.slice(2);}
  const parts=p.startsWith('/')?[]:cwd.split('/').filter(Boolean);
  for(const item of p.split('/')){if(!item||item==='.')continue;if(item==='..'){if(!parts.length)throw Error('루트 밖 경로');parts.pop();}else parts.push(item);}
  return parts.join('/');
}
const category=(line:string,program?:string):BootStep['category']=>
  /\b(?:MSCDEX|IMGMOUNT|MOUNT)\b|\b[D-Z]:/i.test(line)?'cd-drive':
  /(?:SOUND|DIGPAK|BLASTER|SB16|NOSOUND)/i.test(program??line)?'sound':
  /(?:HANGUL|KOREAN|HGC|(?:^|\/)HAN\.)/i.test(program??line)?'korean-candidate':
  /(?:^|\/)ED4\.EXE$/i.test(program??'')?'game':program?.endsWith('.BAT')?'batch':'initialization';

/** Linear, explicit DOS commands only. Refuse transformations whose control-flow
 * or ERRORLEVEL/arguments could be changed by instrumentation. Preserve BAT bytes.
 * A BEFORE with no AFTER proves entry, not a crash: games normally do not return.
 */
export function bootPlan(files:Files, entry:string, prelude=''):BootPlan {
  const plan:BootPlan={entry,executable:'',steps:[],issues:[],generated:{},evidence:{
    koreanCandidates:Object.keys(files).filter(p=>/(?:HANGUL|KOREAN|HGC|(?:^|\/)HAN\.)/i.test(p)),
    cdImages:Object.keys(files).filter(p=>/\.(ISO|CUE|BIN|MDF|MDS)$/i.test(p)),driveCommands:[]}};
  const reserved=new Set(Object.keys(files));let counter=0;
  const windows=new Set(inspectGame(files).windowsExecutables);
  const allocate=(cwd:string)=>{
    let p:string; do {p=(cwd?cwd+'/':'')+`ET${String(++counter).padStart(6,'0')}.BAT`;}while(reserved.has(p));reserved.add(p);return p;
  };
  const issue=(batch:string,line:number,msg:string)=>plan.issues.push(`${batch}:${line} ${msg}`);
  const walk=(batch:string,cwd:string,stack:string[],synthetic?:string):{temp:string;cwd:string}=>{
    const temp=allocate(dir(entry));
    if(stack.includes(batch)||stack.length>=8){issue(batch,0,'순환 호출/깊이 제한');return{temp,cwd};}
    const b=files[batch];
    if(!synthetic && (!b||b.length>16384)){issue(batch,0,'BAT 누락 또는 16 KiB 초과');return{temp,cwd};}
    // A byte-preserving decoder keeps CP949 echo/comment bytes unchanged.
    const source=synthetic ?? Array.from(b,x=>String.fromCharCode(x)).join('');
    const out:string[]=['@echo off'];
    let transferred=false;
    for(const [index,original]of source.split(/\r\n|\n|\r/).entries()){
      const line=original.trim().replace(/^@/,'');
      if(!line||/^(REM(?:\s|$)|::)/i.test(line)){out.push(original);continue;}
      if(transferred){issue(batch,index+1,'CALL 없는 BAT 연결 뒤 도달하지 않는 명령');continue;}
      const [head,...args]=line.split(/\s+/),command=head.toUpperCase();
      const step:BootStep={id:plan.steps.length+1,batch,line:index+1,command:line,category:category(line),afterExpected:true};
      plan.steps.push(step);
      const marker=(phase:string)=>`@echo E4TRACE ${phase} ${step.id} END`;
      out.push(marker('BEFORE'));
      let actual=original;
      if(/^ECHO[.:]?$/.test(command)) {
        // Output only: retain original OEM bytes; never interpret Korean as paths.
        if(/[%!&|^]/.test(line))issue(batch,index+1,'변수/복합 ECHO는 자동 추적하지 않음');
      }else if(/[%!&|<>^"\x80-\xff]/.test(line)||/^(IF|GOTO|FOR|SHIFT|EXIT|PATH|LH|LOADHIGH)$/.test(command)||command.startsWith(':')){
        issue(batch,index+1,'분기·변수·PATH·확장 문법은 추적 변환하지 않음');
      }else if(['CLS','PAUSE','SET'].includes(command)) {
        if(command==='SET' && !/^[A-Z_][A-Z0-9_]*=.+$/i.test(args.join(' ')))issue(batch,index+1,'SET 문법 확인 필요');
      }else if(['CD','CHDIR'].includes(command)){
        try {if(args.length!==1)throw Error('CD 인수');cwd=resolve(cwd,args[0]);if(cwd&&!Object.keys(files).some(p=>p.startsWith(cwd+'/')))throw Error('폴더 누락');}
        catch(e){issue(batch,index+1,String(e));}
      }else {
        const call=command==='CALL',target=call?args[0]:head;
        try{
          if(!target)throw Error('명령 누락');
          const name=resolve(cwd,target),matches=(/\.(COM|EXE|BAT)$/i.test(name)?[name]:[name+'.COM',name+'.EXE',name+'.BAT']).filter(p=>files[p]);
          if(matches.length!==1)throw Error('실행 파일 누락/중복 또는 지원하지 않는 내부 명령: '+target);
          const program=matches[0];validateExecutable(program,files);
          if(windows.has(program))throw Error('PE/NE 프로그램');
          step.program=program;step.category=category(line,program);
          if(program.endsWith('.BAT')){
            if((call?args.slice(1):args).length)throw Error('BAT 인수는 자동 변환하지 않음');
            const child=walk(program,cwd,[...stack,batch]);cwd=child.cwd;
            actual=(call?'CALL ':'')+'C:\\'+child.temp.replace(/\//g,'\\');
            if(!call){step.afterExpected=false;transferred=true;}
          }
        }catch(e){issue(batch,index+1,String(e));}
      }
      out.push(actual);
      if(step.afterExpected)out.push(marker('AFTER'));
    }
    plan.generated[temp]=Uint8Array.from(out.join('\r\n')+'\r\n',c=>c.charCodeAt(0));
    return{temp,cwd};
  };
  try{validateExecutable(entry,files);}catch(e){issue(entry,0,String(e));}
  if(prelude.trim() || !entry.endsWith('.BAT')) {
    // DOSBox already changes to entry's directory before this disposable wrapper.
    const script=(prelude.trim()?prelude+'\r\n':'')+entry.split('/').pop();
    plan.executable=walk('(AUTOEXEC)',dir(entry),[],script).temp;
  }else plan.executable=walk(entry,dir(entry),[]).temp;
  plan.evidence.driveCommands=plan.steps.filter(s=>s.category==='cd-drive');
  return plan;
}
export class BootTrace {
  events:{id:number;phase:'BEFORE'|'AFTER';at:string}[]=[];
  private tail='';
  private seen=new Set<string>(); // Engine stdout can also be forwarded as a message.
  constructor(readonly plan:BootPlan){}
  accept(text:string){
    this.tail=(this.tail+text).slice(-8192);
    const regex=/E4TRACE (BEFORE|AFTER) (\d+) END/g;
    let consumed=0;
    for(const m of this.tail.matchAll(regex)){
      const id=Number(m[2]),key=m[1]+':'+id;
      if(!this.seen.has(key) && this.plan.steps.some(s=>s.id===id)){
        this.events.push({id,phase:m[1] as 'BEFORE'|'AFTER',at:new Date().toISOString()});this.seen.add(key);
      }
      consumed=m.index!+m[0].length;
    }
    this.tail=this.tail.slice(consumed);
    if(this.events.length>1000)this.events.splice(0,this.events.length-1000);
  }
  report(){
    const before=[...this.events].reverse().find(e=>e.phase==='BEFORE');
    const step=this.plan.steps.find(s=>s.id===before?.id);
    const after=before && this.events.some(e=>e.id===before.id&&e.phase==='AFTER');
    return{entry:this.plan.entry,steps:this.plan.steps,issues:this.plan.issues,evidence:this.plan.evidence,events:this.events,
      lastEntered:step,returned:!!after,
      interpretation:step?after?'마지막 명령 반환 확인':'마지막 진입 명령입니다. 게임 실행 중·입력 대기·정지 가능성을 구분해야 하며 중단 원인 확정이 아닙니다.':'아직 마커 수신 없음',
      koreanNote:'한글 출력과 실행 중단은 별도 조사. 후보 이름/이미지 존재는 필수 요구를 입증하지 않습니다.'};
  }
}
