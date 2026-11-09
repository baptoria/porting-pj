import {describe,it,expect} from 'vitest';
import {joystickKeys,KeyOwners} from '../src/play-input';
import {normalizePlayUi,DEFAULT_PLAY_UI,controlLayout,SPEED_CAPABILITY} from '../src/play-ui';
describe('ED4 overlay',()=>{
 it.each([[1,0,[262]],[1,1,[262,264]],[0,1,[264]],[-1,1,[263,264]],[-1,0,[263]],[-1,-1,[263,265]],[0,-1,[265]],[1,-1,[262,265]]] as [number,number,number[]][])('direction %s,%s', (x,y,keys)=>expect(joystickKeys(x,y)).toEqual(keys));
 it('deadzone and invalid coordinates release arrows',()=>{for(const [x,y]of [[0,0],[.1,-.1],[NaN,1]])expect(joystickKeys(x,y)).toEqual([]);});
 it('shared keyboard/touch ownership has no duplicate downs or premature ups',()=>{
  const events:unknown[]=[];const held=new KeyOwners((k,d)=>events.push([k,d]));
  held.set('keyboard',[265]);held.set('joystick',[265,262]);held.set('enter1',[257]);held.set('enter2',[257]);held.set('joystick',[263,264]);held.set('enter1',[]);held.set('enter2',[]);held.clear();held.clear();
  expect(events).toEqual([[265,true],[262,true],[257,true],[262,false],[263,true],[264,true],[257,false],[265,false],[263,false],[264,false]]);
 });
 it('clamps corrupted preferences without touching legacy stores',()=>{expect(normalizePlayUi({joystickSize:999,opacity:-4,buttonY:NaN,fit:'crop',swap:'yes'})).toEqual({...DEFAULT_PLAY_UI,joystickSize:240,opacity:15});});
 it('all layout extremes stay inside safe content box and do not overlap',()=>{
  for(const [w,h]of [[800,350],[350,800],[240,140]])for(const x of [0,100])for(const y of [0,100]){
   const p=controlLayout(w,h,{...DEFAULT_PLAY_UI,joystickSize:240,buttonSize:120,joystickX:x,buttonX:x,joystickY:y,buttonY:y});
   expect(p.joyX).toBeGreaterThanOrEqual(0);expect(p.joyX+p.joy).toBeLessThanOrEqual(w/2);expect(p.joyY+p.joy).toBeLessThanOrEqual(h);
   expect(p.actionX+p.button*2+p.gap).toBeLessThanOrEqual(w+.0001);expect(p.actionY+p.button).toBeLessThanOrEqual(h);
  }
 });
 it('does not advertise unverified double speed',()=>{expect(SPEED_CAPABILITY.supported).toBe(false);expect(SPEED_CAPABILITY.rate).toBe(1);});
});
