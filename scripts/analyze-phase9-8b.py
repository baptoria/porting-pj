"""Public fixtures only; never reads or exports commercial sound samples."""
import json, statistics
from pathlib import Path
import numpy as np
root=Path('artifacts/phase9-8b'); out={'clock':{},'audioCoupling':{}}
for cycles in ['12000','max']:
 d=json.loads((root/f'clock-{cycles}.json').read_text())
 out['clock'][cycles]={'medianMs':[statistics.median(t['ms']) for t in d['timings']],'ratio':d['ratio'],'wasm':d['wasmSha256']}
for speed in [1,2]:
 for device in ['opl','pcm']:
  d=json.loads((root/f'audio-{speed}-{device}.json').read_text()); rate=d['rate']; x=np.concatenate(d['chunks']);active=np.flatnonzero(abs(x)>max(.001,max(abs(x))*.05));a,b=active[0],active[-1]+1
  n=min(b-a,round(rate*.4));mid=(a+b-n)//2;y=x[mid:mid+n];spec=abs(np.fft.rfft((y-np.mean(y))*np.hanning(n),n=2**19));hz=np.argmax(spec)*rate/2**19
  out['audioCoupling'][f'{speed}-{device}']={'dominantHz':float(hz),'activeSpanSeconds':float((b-a)/rate),'guestProgramWallMs':d['markers'][-1]['at']-d['markers'][0]['at'],'sourceRate':rate}
out['bgmSynthetic']=json.loads((root/'bgm.json').read_text())
out['limits']=['Guest-tick scheduler only, mixer unchanged. Not a BGM-safe game mode.','Raw Worker samples measured, not the stable host stereo adapter or speakers.','Synthetic external BGM commands are not identified ED4 commands.']
(root/'comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
