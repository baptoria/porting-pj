"""Read-only NE metadata. No game execution, byte dump, patch or game hash gate."""
from pathlib import Path
import struct, hashlib, json
p=Path('D:/ed4_rs_cb/ED4/LOGO.EXE'); b=p.read_bytes()
w=lambda o:struct.unpack_from('<H',b,o)[0]
n=struct.unpack_from('<I',b,60)[0]
assert b[n:n+2]==b'NE'
segments=[]
for i in range(w(n+0x1c)):
 o=n+w(n+0x22)+8*i
 segments.append({'id':i+1,'file':w(o)<<w(n+0x32),'length':w(o+2) or 65536,'flags':w(o+4)})
targets=[0xcc96,0xcca3,0xccac,0xcec7,0xced7,0xcee5,0xcef5,0x9e42,0x7bc1,0x7c08,0x7b15,0x7b23,0x7bf2,0x7b63,0x7b8d]
links=[]; digpak_links=[]
for s in segments:
 if not s['file'] or not s['flags']&0x100:continue
 r=s['file']+s['length']
 for i in range(w(r)):
  o=r+2+i*8;kind,flags=b[o:o+2];at=w(o+2);seen=set()
  while at!=65535 and at not in seen and at+2<=s['length']:
   seen.add(at);file=s['file']+at
   ts=b[o+4];to=w(o+6)
   dest=segments[ts-1]['file']+to if flags&3==0 and 1<=ts<=len(segments) else None
   if dest is not None and 0x9440<=dest<0x9800:digpak_links.append({'operandFileOffset':hex(file),'wrapperFileOffset':hex(dest)})
   if any(t<=file<t+5 for t in targets):
    seg=b[o+4];off=w(o+6)
    links.append({'callFileOffset':hex(next(t for t in targets if t<=file<t+5)),'relocationKind':kind,'flags':flags,'targetSegment':seg,'targetOffset':hex(off),'targetFileOffset':hex(segments[seg-1]['file']+off) if flags&3==0 and 1<=seg<=len(segments) else None})
   if flags&4:break
   at=w(file)
s=next(s for s in segments if s['file']<=0xcd4b<s['file']+s['length'])
out={'source':'PC reference only; not Galaxy file identity or runtime address','logoBytes':len(b),'logoSha256':hashlib.sha256(b).hexdigest(),'dispatchCandidate':{'segment':s['id'],'fileBase':hex(s['file']),'cases':{str(i):hex(s['file']+w(0xcd4b+i*2)) for i in range(17)}},'relocations':links,'digpakWrapperCalls':digpak_links,'limits':['Static offsets only, no fixed runtime hooks.','AX9/AX10 at file A0ED/A149 call INT31 wrapper 9E2A; NOT evidence of INT69 semantics.']}
outdir=Path('artifacts/phase9-8f');outdir.mkdir(parents=True,exist_ok=True);(outdir/'reference.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
