/** emulators 0.73.8 jsdos-mixer.cpp emits one float per MONO frame.
 * The legacy path is retained exclusively for unchanged engines and A/B testing.
 * RAW preview is a different decoder and must not use this adapter.
 */
export function emulatorAudioBuffer(context:BaseAudioContext,samples:Float32Array,rate:number,mono:boolean):AudioBuffer {
  const buffer=context.createBuffer(mono?1:2,mono?samples.length:Math.floor(samples.length/2),rate);
  if(mono)buffer.getChannelData(0).set(samples);
  else for(let c=0;c<2;c++){
    const data=buffer.getChannelData(c);
    for(let i=0;i<data.length;i++)data[i]=samples[i*2+c];
  }
  return buffer;
}
