"""Independent public timing/audio evidence, never reads commercial files."""
import json,statistics
from pathlib import Path
import numpy as np
root=Path('artifacts/phase9-8');out={'cpuAndBios':{},'publicAudio':{}}
for p in root.glob('time-*.json'):
 d=json.loads(p.read_text());samples=d['nativeSamples'];first,last=samples[0],samples[-1]
 out['cpuAndBios'][d['mode']]={'cpuMedianMs':statistics.median(d['cpuMs']),'bios36MedianMs':statistics.median(d['bios36TicksMs']),
 'cpuTrialsMs':d['cpuMs'],'biosTrialsMs':d['bios36TicksMs'],'cyclesAutoValues':sorted(set(s['cyclesAuto'] for s in samples)),
 'nativeCyclesRange':[min(s['cyclesMax'] for s in samples),max(s['cyclesMax'] for s in samples)],
 'guestTicksPerWallSecond':(last['guestTicks']-first['guestTicks'])*1000/(last['epochMs']-first['epochMs'])}
for cycles in ['12000','24000']:
 for device in ['opl','pcm']:
  d=json.loads((root/f'{cycles}-{device}.json').read_text());rate=d['frequency'];x=np.concatenate(d['chunks']);active=np.flatnonzero(abs(x)>max(.001,max(abs(x))*.05));a,b=active[0],active[-1]+1
  n=min(b-a,round(rate*.4));mid=(a+b-n)//2;y=x[mid:mid+n];spec=abs(np.fft.rfft((y-np.mean(y))*np.hanning(n),n=2**19));hz=np.argmax(spec)*rate/2**19
  expected=440 if device=='opl' else 1000
  if abs(hz-expected)>4:raise RuntimeError(f'Unexpected public tone: {cycles}/{device} {hz}')
  if len(np.concatenate([p['samples'] for p in d['played']]))!=len(x):raise RuntimeError('Mono frame loss')
  out['publicAudio'][f'{cycles}-{device}']={'dominantHz':float(hz),'activeSpanSeconds':float((b-a)/rate),'sourceRate':rate,'contextRate':d['contextRate'],'monoFramesPreserved':True}
out['limitations']=['cycles budget trials are not game 2x modes','BIOS wait is a public timing proxy, not an ED4 movement measurement','OPL/PCM public tones are not real game BGM or proof of independent RAW playback','No global virtual-time modification']
(root/'comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
