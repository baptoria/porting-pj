"""Read-only local binary metadata. No execution, copying, sample export or patch.
Offsets are static file offsets, NOT Galaxy runtime addresses or proof of use.
"""
from pathlib import Path
import hashlib,json,re,struct
root=Path('D:/ed4_rs_cb/ED4');out={'scope':'read-only PC reference; not Galaxy binary identity proof','files':{}}
for name in ['ED4.EXE','DRIVER.EXE','LOGO.EXE','SOUNDRV.COM']:
 b=(root/name).read_bytes();out['files'][name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
b=(root/'LOGO.EXE').read_bytes()
out['rawLiteralOffsets']=[{'track':int(m[1]),'fileOffset':hex(m.start())} for m in re.finditer(rb'ed4-(\d\d)\.raw',b,re.I)]
out['directInt66ImmediateAxCandidates']=[{'fileOffset':hex(i),'ax':hex(struct.unpack_from('<H',b,i+1)[0])} for i in range(len(b)-5) if b[i]==0xb8 and b[i+3:i+5]==bytes([0xcd,0x66])]
# Constants in stack-local AX fields, independently checked by bounded objdump.
out['stackAxConstantCandidates']=[{'fileOffset':hex(i),'ax':hex(struct.unpack_from('<H',b,i+3)[0])} for i in range(len(b)-5) if b[i:i+2]==bytes([0xc7,0x46]) and 0x688<=struct.unpack_from('<H',b,i+3)[0]<=0x69f]
headers=[]
for p in sorted(root.rglob('*.RAW')):
 with p.open('rb') as f: a,rate,n=struct.unpack('<HHI',f.read(8))
 headers.append({'formatWord':a,'rateWord':rate,'payloadLengthMatches':n==p.stat().st_size-8})
out['localRaw']={'count':len(headers),'formats':sorted({h['formatWord'] for h in headers}),'rates':sorted({h['rateWord'] for h in headers}),'allLengthWordsMatch':all(h['payloadLengthMatches'] for h in headers)}
out['limits']=['Static patterns may be data/unreached code. No runtime command or buffer ownership captured.','DIGPAK format3 agrees with PCM16 stereo hypothesis, not proof the header is consumed this way.','No filename paths or sound samples exported.']
target=Path('artifacts/phase9-8b/reference.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(out,indent=2));print(json.dumps({**out,'rawLiteralOffsets':{'count':len(out['rawLiteralOffsets']),'first':out['rawLiteralOffsets'][0]}},indent=2))
