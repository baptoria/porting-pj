import {describe,it,expect} from 'vitest';
import {emulatorAudioBuffer} from '../src/emulator-audio';
import {AUDIO_ENGINE,PERFORMANCE_ENGINE} from '../src/experimental-engine';
const context={createBuffer(channels:number,length:number,sampleRate:number){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:(c:number)=>data[c]};}} as BaseAudioContext;
describe('emulators mono protocol preservation',()=>{
 it('preserves odd chunk boundaries, every signed sample, duration and energy',()=>{
  const input=Float32Array.from({length:22051},(_,i)=>Math.sin(i*2*Math.PI*440/22050));
  const chunks=[input.slice(0,513),input.slice(513,2048),input.slice(2048)];
  const result=chunks.map(c=>emulatorAudioBuffer(context,c,22050,true));
  expect(result.flatMap(b=>Array.from(b.getChannelData(0)))).toEqual(Array.from(input));
  expect(result.reduce((a,b)=>a+b.duration,0)).toBeCloseTo(input.length/22050,12);
 });
 it('retains the legacy A/B path without changing the stable engine',()=>{
  const b=emulatorAudioBuffer(context,new Float32Array([1,2,3,4,5]),22050,false);
  expect(Array.from(b.getChannelData(0))).toEqual([1,3]);expect(Array.from(b.getChannelData(1))).toEqual([2,4]);
 });
 it('uses the identical VGA-compatible trace-free WASM, not a rebuilt CPU',()=>{
  expect(AUDIO_ENGINE.id).toBe('phase9-7');expect(AUDIO_ENGINE.wasmSha256).toBe(PERFORMANCE_ENGINE.wasmSha256);expect(AUDIO_ENGINE.directory).toBe(PERFORMANCE_ENGINE.directory);
 });
});
