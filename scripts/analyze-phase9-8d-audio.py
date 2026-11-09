"""Only the local CC0 test captures; never opens game/RAW/OPFS files."""
from pathlib import Path
import json
import numpy as np

out = {}
for p in Path('artifacts/phase9-8d/validated-run-1').glob('audio-*/capture.json'):
    d = json.loads(p.read_text())
    x = np.concatenate(d['chunks'])
    rate = d['frequency']
    active = np.flatnonzero(abs(x) > max(.001, max(abs(x)) * .05))
    a, b = active[0], active[-1] + 1
    n = min(b - a, round(rate * .4))
    mid = (a + b - n) // 2
    y = x[mid:mid + n]
    hz = np.argmax(abs(np.fft.rfft((y - y.mean()) * np.hanning(n), n=2**19))) * rate / 2**19
    overlaps = [max(0, d['played'][i-1]['at'] + d['played'][i-1]['duration'] - v['at'])
                for i, v in enumerate(d['played']) if i]
    out[p.parent.name] = {'dominantHz': float(hz), 'spanSeconds': float((b-a)/rate),
                          'sampleRate': rate, 'channels': d['played'][0]['channels'],
                          'maxQueueOverlapSeconds': max(overlaps, default=0),
                          'scope': 'public probe; not Galaxy startup or speakers'}
if len(out) != 4:
    raise RuntimeError('Four public audio captures are required')
Path('artifacts/phase9-8d/audio-comparison.json').write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))
