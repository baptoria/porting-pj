"""Read-only STATIC metadata; no game execution, copy, sample/audio export."""
from pathlib import Path
import re,struct,json,hashlib
root=Path('D:/ed4_rs_cb/ED4')
out={'scope':'PC research installation only; Galaxy contents not supplied','files':{}}
for name in ['SOUNDRV.COM','SBPRO.COM','SB16.COM','LOGO.EXE','DRIVER.EXE']:
 b=(root/name).read_bytes();out['files'][name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
logo=(root/'LOGO.EXE').read_bytes()
refs=[s.decode('ascii') for s in re.findall(rb'[\x20-\x7e]{4,}',logo) if b'.raw' in s.lower()]
raw=list(root.rglob('*.RAW'));headers=[]
for f in raw:
 with f.open('rb') as stream:h=stream.read(8)
 headers.append(struct.unpack('<HHI',h))
out.update(rawReferenceCount=len(refs),firstReference=refs[0],lastReference=refs[-1],
 localRawCount=len(raw),localRawBytes=sum(f.stat().st_size for f in raw),
 headerFirstTwoWords=sorted(set((a,b) for a,b,_ in headers)),
 headerPayloadLengthsMatch=all(h[2]==f.stat().st_size-8 for h,f in zip(headers,raw)),
 referenceBasenameMatches=sum(any(f.name.lower()==s.lower().replace('\\','/').split('/')[-1] for f in raw) for s in refs),
 allLocalBasenamesHaveUnderscore=all(f.name.startswith('_') for f in raw),
 note='Header words are observations, not a decoded format specification; file-name mismatch is local only. No renaming performed.')
target=Path('artifacts/phase9-7/reference-metadata.json');target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
