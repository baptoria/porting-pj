"""Analyze only independently authored public tones, never game audio."""
import json, wave, hashlib
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent/'artifacts/phase9-7'
def stats(data,rate):
 x=np.asarray(data,dtype=float); peak=float(np.max(np.abs(x)))
 active=np.flatnonzero(np.abs(x)>max(0.001,peak*0.05))
 if not len(active):return {'error':'silence','rate':rate}
 a,b=int(active[0]),int(active[-1])+1;trim=x[a:b]
 n=min(len(trim),int(rate*0.4));mid=(len(trim)-n)//2;y=trim[mid:mid+n];y=y-np.mean(y)
 spec=np.abs(np.fft.rfft(y*np.hanning(n),n=2**19));i=int(np.argmax(spec))
 # Positive zero crossings with sub-sample interpolation (steady middle).
 z=np.flatnonzero((y[:-1]<=0)&(y[1:]>0));zc=z-y[z]/(y[z+1]-y[z])
 hz=float(rate*(len(zc)-1)/(zc[-1]-zc[0])) if len(zc)>1 else None
 return {'sampleRate':rate,'samples':len(x),'activeSpanSeconds':(b-a)/rate,'peak':peak,'rms':float(np.sqrt(np.mean(y*y))),
         'fftPeakHz':float(i*rate/2**19),'zeroCrossHz':hz,'analysisSamples':n,'firstActive':a,'lastActiveExclusive':b}
out={'note':'PC native mixer WAV vs web Worker mono vs scheduled buffer channel0; no microphone/physical speaker measurement','native':{},'web':{}}
series={}
for dev,file in [('opl','audio_000.wav'),('pcm','audio_001.wav')]:
 p=root/'native/captures'/file
 with wave.open(str(p)) as w:
  rate=w.getframerate();channels=w.getnchannels();x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,channels)/32768
 out['native'][dev]={'channels':channels,**stats(np.mean(x,axis=1),rate),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 series['pc-'+dev]=np.mean(x,axis=1)
for p in root.glob('phase9-*-*.json'):
 if not any(p.stem.endswith('-'+d) for d in ['opl','pcm']):continue
 d=json.loads(p.read_text());raw=np.concatenate(d['chunks']);played=np.concatenate([b['samples'] for b in d['played']]);r=d['frequency']
 out['web'][p.stem]={'worker':stats(raw,r),'buffersChannel0':stats(played,r),'contextRate':d['contextRate'],
 'bufferChannels':sorted(set(b['channels'] for b in d['played'])),'rawFrames':len(raw),'scheduledFrames':len(played),
 'scheduledDuration':sum(b['duration'] for b in d['played']), 'workerDuration':len(raw)/r,
 'scheduleGaps':sum(d['played'][i]['at']>d['played'][i-1]['at']+d['played'][i-1]['duration']+0.001 for i in range(1,len(d['played'])))}
 series[p.stem]=played
def aligned(x):
 a=int(np.flatnonzero(np.abs(x)>0.01)[0])+4410
 crossings=np.flatnonzero((x[a:-1]<=0)&(x[a+1:]>0));k=a+int(crossings[0]);start=k-x[k]/(x[k+1]-x[k])
 y=np.interp(start+np.arange(265),np.arange(len(x)),x)
 return y/max(abs(y))
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="540" viewBox="0 0 1000 540"><rect width="1000" height="540" fill="white"/><g font-family="sans-serif" font-size="16"><text x="40" y="28">Public tones: phase-aligned, amplitude-normalized 12 ms (not game audio)</text>']
out['waveformComparison']={}
for row,dev in enumerate(['opl','pcm']):
 center=155+row*235;ys={key:aligned(series[key+'-'+dev]) for key in ['pc','phase9-6','phase9-7']}
 out['waveformComparison'][dev]={'normalized12msPcVsMonoCorrelation':float(np.corrcoef(ys['pc'],ys['phase9-7'])[0,1]),
 'workerToPcRmsRatio':out['web']['phase9-7-'+dev]['worker']['rms']/out['native'][dev]['rms'],
 'method':'first positive crossing >=200ms after active onset; 265 samples; phase/amplitude normalized, not bit-identical synthesis claim'}
 svg.append(f'<text x="40" y="{center-94}">{dev.upper()}</text><path d="M40 {center} H960" stroke="#ccc"/>')
 for key,color in [('pc','#111827'),('phase9-6','#dc2626'),('phase9-7','#0284c7')]:
  points=' '.join(f'{40+i*920/264:.2f},{center-v*75:.2f}' for i,v in enumerate(ys[key]))
  svg.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="1.7"/>')
svg.append('<text x="40" y="518">Black: PC mixer | Red: legacy web buffer | Blue: mono correction | X: 0–12 ms</text></g></svg>')
(root/'waveforms.svg').write_text(''.join(svg),encoding='utf8')
out['resampling']=[json.loads(p.read_text()) for p in (root/'browser').glob('*/resampling.json')]
(root/'measurements.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
