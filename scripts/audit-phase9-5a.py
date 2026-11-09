"""Read-only local evidence inventory. Never execute/copy commercial files."""
import argparse, hashlib, json, struct
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--game', action='append', default=[])
p.add_argument('--file', action='append', default=[])
p.add_argument('--out', required=True)
a = p.parse_args()
names = ['ED4.EXE','DRIVER.EXE','LOADER.COM','LOGO.EXE','RTM.EXE','DPMI16BI.OVL','GAME.BAT','NOSOUND.BAT','SOUNDRV.COM']
def metadata(path):
    path = Path(path)
    if not path.is_file(): return {'path':str(path),'present':False}
    b = path.read_bytes()
    item = {'path':str(path),'present':True,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
    if path.name.upper() == 'ED4.EXE' and b[:2] == b'MZ' and len(b) >= 28:
        h = struct.unpack_from('<14H',b)
        item['mz'] = dict(zip(['signature','lastPage','pages','relocations','headerParagraphs','minAlloc','maxAlloc','ss','sp','checksum','ip','cs','relocationOffset','overlay'],h))
        # Only numeric header/relocation metadata, no code or memory dump.
        item['relocations'] = [struct.unpack_from('<HH',b,h[12]+i*4) for i in range(min(h[3],16)) if h[12]+i*4+4 <= len(b)]
    return item
result={'commercialProgramsExecuted':False,'files':[metadata(f) for f in a.file], 'games':[[metadata(Path(g)/n) for n in names] for g in a.game]}
Path(a.out).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('Read-only metadata written:',a.out)
