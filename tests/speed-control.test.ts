import {it,expect,vi} from 'vitest';
import {SpeedControl} from '../src/speed-control';
import {SpeedAudio} from '../src/speed-audio';
function reply(c:SpeedControl,m:any,rate=1){c.accept({session:c.session,id:m.props.id,engine:'phase9-8h',ok:true,rate,guestTicks:10,audioFrames:512,audioUnderflows:0,audioClamps:0});}
it('a set request cannot be verified by a different valid native rate',async()=>{const messages:any[]=[],c=new SpeedControl(m=>messages.push(m),()=>{});const p=c.request('set',2);reply(c,messages[0],1);await expect(p).rejects.toThrow('속도 확인 실패');expect(c.verified).toBe(false);c.close();});
it('only acknowledges this session/request and never permits duplicate requests',async()=>{
 const messages:any[]=[],c=new SpeedControl(m=>messages.push(m),()=>{});const p=c.request('set',2);
 expect(c.rate).toBe(1);expect(c.verified).toBe(false);await expect(c.request('set',1)).rejects.toThrow();
 c.accept({session:'old',id:1,ok:true,rate:2});expect(c.busy).toBe(true);reply(c,messages[0],2);await p;expect(c.rate).toBe(2);expect(c.verified).toBe(true);c.close();
});
it('timeout is unknown, fresh 1x native ack can recover, late 2x cannot overwrite it',async()=>{
 vi.useFakeTimers();try{const messages:any[]=[],c=new SpeedControl(m=>messages.push(m),()=>{},20);const p=c.request('set',2);const assertion=expect(p).rejects.toThrow('응답시간');await vi.advanceTimersByTimeAsync(21);await assertion;expect(c.verified).toBe(false);
 const recovery=c.request('set',1);reply(c,messages[0],2);expect(c.busy).toBe(true);reply(c,messages[1]);await recovery;expect(c.rate).toBe(1);c.close();}finally{vi.useRealTimers();}
});
it('rejects other speeds and wrong actual engine; diagnostics bounded',async()=>{
 const messages:any[]=[],c=new SpeedControl(m=>messages.push(m),()=>{});await expect(c.request('set',1.5 as any)).rejects.toThrow();
 const bad=c.request('set',1);c.accept({session:c.session,id:1,ok:true,rate:1,engine:'phase9-8f'});await expect(bad).rejects.toThrow();
 for(let i=0;i<100;i++){const p=c.request('status');reply(c,messages.at(-1));await p;}expect(c.report().events).toHaveLength(128);c.close();await expect(c.request('set',1)).rejects.toThrow();
});
function context(){const nodes:any[]=[],ctx:any={currentTime:1,createBufferSource(){const n:any={playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};nodes.push(n);return n;}};return {ctx,nodes};}
it('audio consumes unplayed samples once, reschedules contiguous queue at both speeds',()=>{
 const {ctx,nodes}=context(),a=new SpeedAudio(ctx,{} as any),buffer:any={duration:.2,length:4410};a.push(buffer);a.push(buffer);ctx.currentTime=1.16;a.setRate(2);
 expect(nodes[0].stop).toHaveBeenCalledWith(1.16);expect(nodes[1].stop).toHaveBeenCalledWith(1.16);
 expect(nodes[2].start.mock.calls[0][0]).toBeCloseTo(1.16);expect(nodes[2].start.mock.calls[0][1]).toBeCloseTo(.1);expect(nodes[3].start.mock.calls[0][0]).toBeCloseTo(1.21);
 ctx.currentTime=1.18;a.setRate(1);expect(nodes[4].start.mock.calls[0][1]).toBeCloseTo(.14);expect(nodes[5].start.mock.calls[0][0]).toBeCloseTo(1.24);expect(a.report().droppedFrames).toBe(0);a.dispose();
});
it('audio flags backlog and repeated starvation without dropping or muting queued data',()=>{
 const {ctx}=context(),a=new SpeedAudio(ctx,{} as any),b:any={duration:.1,length:2205};for(let i=0;i<6;i++)a.push(b);expect(a.problem()).toContain('큐');expect(a.report().droppedFrames).toBe(0);a.dispose();
 for(let i=0;i<7;i++){ctx.currentTime+=.25;a.push(b);}expect(a.problem()).toContain('지연');a.resetHealth();expect(a.problem()).toBeNull();a.dispose();
});

it('distinguishes a gap adjacent to audible PCM from an idle silent queue without dropping samples',()=>{
 const {ctx}=context(),a=new SpeedAudio(ctx,{} as any),silent:any={duration:.02,length:441,getChannelData:()=>new Float32Array(441)},tone:any={...silent,getChannelData:()=>new Float32Array(441).fill(.2)};
 a.push(silent);ctx.currentTime=1.2;expect(a.push(silent).audibleStarved).toBe(false);
 ctx.currentTime=1.4;expect(a.push(tone).audibleStarved).toBe(true);
 expect(a.report().audibleUnderruns).toBe(1);expect(a.report().underruns).toBe(2);expect(a.report().droppedFrames).toBe(0);a.dispose();
});
