"""Read-only NE relocation/call metadata. No game bytes copied or runtime hooks.
Run on Windows with the existing Ubuntu-24.04 objdump. --range prints a bounded
disassembly to the investigator only; the saved JSON contains call metadata.
"""
from pathlib import Path
import argparse, hashlib, json, re, struct, subprocess

def inspect(path):
    b=Path(path).read_bytes()
    w=lambda o:struct.unpack_from('<H',b,o)[0]
    ne=struct.unpack_from('<I',b,60)[0]
    if b[ne:ne+2]!=b'NE': raise ValueError('Not NE')
    segs=[]
    for i in range(w(ne+28)):
        at=ne+w(ne+34)+8*i
        segs.append(dict(id=i+1,file=w(at)<<w(ne+50),length=w(at+2) or 65536,flags=w(at+4)))
    relocs={}
    for s in segs:
        if not s['file'] or not s['flags']&0x100: continue
        at=s['file']+s['length']
        for i in range(w(at)):
            r=at+2+i*8; kind,flags=b[r:r+2]; off=w(r+2); seen=set()
            while off!=65535 and off not in seen and off+2<=s['length']:
                seen.add(off); source=s['file']+off; target=b[r+4]; dest=w(r+6)
                relocs[source]={'kind':kind,'flags':flags,'segment':target,'offset':dest,
                    'file':segs[target-1]['file']+dest if flags&3==0 and 1<=target<=len(segs) else None}
                if flags&4: break
                off=w(source)
    return b,segs,relocs

def listing(path,start,end):
    p=Path(path).resolve().as_posix(); drive=p[0].lower(); wsl='/mnt/'+drive+p[2:]
    out=subprocess.check_output(['wsl','-d','Ubuntu-24.04','--','objdump','-D','-b','binary','-mi386','-Maddr16,data16,intel','--no-show-raw-insn',f'--start-address={start}',f'--stop-address={end}',wsl],encoding='utf-8')
    return [(int(m[1],16),m[2].strip()) for l in out.splitlines() if (m:=re.match(r'\s*([0-9a-f]+):\s+(.+)',l))]

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--file',default='D:/ed4_rs_cb/ED4/LOGO.EXE');p.add_argument('--range');a=p.parse_args()
    b,segs,relocs=inspect(a.file)
    if a.range:
        lo,hi=[int(x,0) for x in a.range.split(':')]
        if hi-lo>0x1000:raise ValueError('Use bounded ranges')
        for addr,op in listing(a.file,lo,hi):
            r=relocs.get(addr+1)
            suffix=f" ; NE -> {r['segment']}:{r['offset']:04x} file={r['file']:#x}" if r and r['file'] is not None and op.startswith('call') else ''
            print(f'{addr:05x} {op}{suffix}')
    else:
        calls=[];slotrefs={}; sums=[]
        for seg in segs:
            if seg['flags']&1:continue
            for addr,op in listing(a.file,seg['file'],seg['file']+seg['length']):
                if op.startswith('call'):
                    r=relocs.get(addr+1)
                    if r and r['file'] is not None:target=r['file'];kind='NE-relocated'
                    elif (m:=re.fullmatch(r'call\s+(0x[0-9a-f]+)',op)):target=int(m[1],16);kind='near'
                    else:continue
                    calls.append({'from':addr,'to':target,'kind':kind,'segment':seg['id']})
                for m in re.finditer(r'\[bx\+0x(44[e-f][0-9a-f]|45[01][0-9a-f])\]',op):
                    slotrefs.setdefault(m[1],[]).append(addr)
                if 0xaa37<=addr<0xb281 and (op.startswith('add    WORD PTR es:[bx],ax') or op.startswith('adc    WORD PTR es:[bx+0x2],dx')):sums.append(addr)
        out={'referenceBytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'scope':'Static file offsets only; never a game hash gate or runtime hook','segments':segs,'calls':calls,'slotReferences':slotrefs,'accumulatorInstructions':sums}
        dest=Path('artifacts/phase9-8g/call-metadata.json');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(out,indent=2))
        print('Wrote metadata:',len(calls),'calls;',len(sums),'accumulator instructions; no game bytes')
