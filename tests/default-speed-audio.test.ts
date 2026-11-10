import {it,expect} from 'vitest';
import {preferredPlayEngine,rememberPlayEngine,PLAY_PREFERENCE_KEY} from '../src/play-preference';
import {SceneSession} from '../src/scene-diagnostics';
import {MENU_AUDIO_SCENES} from '../src/menu-audio-comparison';
it('new and legacy users get speed without overwriting legacy preferences',()=>{
 for(const legacy of [undefined,'stable','phase9-7','phase9-8k']){
  const values=new Map<string,string>();if(legacy)values.set('ed4-play-engine-v1',legacy);
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)};
  expect(preferredPlayEngine(storage)).toBe('phase9-8k');expect(values.get('ed4-play-engine-v1')).toBe(legacy);expect(values.has(PLAY_PREFERENCE_KEY)).toBe(false);
  rememberPlayEngine(storage,'phase9-7');expect(preferredPlayEngine(storage)).toBe('phase9-7');expect(values.get('ed4-play-engine-v1')).toBe(legacy);
 }
});
it('explicit fallback selection survives while invalid data defaults safely',()=>{
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)};
 for(const choice of ['stable','phase9-7','phase9-8k']){rememberPlayEngine(storage,choice);expect(preferredPlayEngine(storage)).toBe(choice);}
 rememberPlayEngine(storage,'phase9-8i');expect(preferredPlayEngine(storage)).toBe('phase9-8k');
 values.set(PLAY_PREFERENCE_KEY,'garbage');expect(preferredPlayEngine(storage)).toBe('phase9-8k');
 expect(preferredPlayEngine({getItem:()=>{throw Error('blocked');}})).toBe('phase9-8k');
});
const d=(n:number,source='live-worker-query')=>({identity:{actualEngine:'phase9-8k',status:'verified'},audioState:'running',audioOutput:{inputFrames:n*22050,blocks:n},bgmCommands:{source,int69Calls:n,rawReads:n,events:[{kind:4,sequence:n,command:9,bx:9}],commands:{'688':n},overwritten:0},samples:'must not export',files:'must not export'});
it('two-point comparison uses one session and does not invent slot or playback success',()=>{
 const session=new SceneSession('phase9-8k');session.capture(MENU_AUDIO_SCENES[0],d(1));expect(session.report().menuAudio.status).toBe('awaiting-two-observations');session.capture(MENU_AUDIO_SCENES[1],d(3));
 const r=session.report().menuAudio;expect(r.status).toBe('two-observations');expect(r.delta).toEqual({pcmFrames:44100,pcmBlocks:2,int69:2,rawReads:2});expect(r.menu?.slotState).toBe('unobserved');expect(r.load?.audibleBgm).toBe('requires-user-observation');expect(session.serialize()).not.toContain('must not export');
});
it('missing/stale observations and reversed menu/load order are not evidence of no music command',()=>{
 const s=new SceneSession('phase9-8k');s.capture(MENU_AUDIO_SCENES[1],d(1));s.capture(MENU_AUDIO_SCENES[0],d(2));expect(s.report().menuAudio.status).toBe('awaiting-two-observations');
 s.capture(MENU_AUDIO_SCENES[1],d(4,'query-timeout-not-current'));expect(s.report().menuAudio.delta?.int69).toBeNull();expect(s.report().menuAudio.load?.selectionRequests).toEqual([]);expect(s.report().menuAudio.load?.freshness).toBe('unavailable-or-stale');
});
