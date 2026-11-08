// Original synthetic PCM fixture, dedicated to CC0-1.0. Not game music.
export function syntheticRaw(track=1) {
  const bytes=new Uint8Array(88208),view=new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RAWTEST'+track));
  for(let at=8;at<bytes.length;at+=4){
    const t=(at-8)/4/22050;
    view.setInt16(at,Math.round(Math.sin(t*2*Math.PI*(track===1?440:330))*6000),true);
    view.setInt16(at+2,Math.round(Math.sin(t*2*Math.PI*(track===1?660:550))*6000),true);
  }
  return bytes;
}
