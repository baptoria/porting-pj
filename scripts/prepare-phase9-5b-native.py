"""Prepare a PRIVATE, ignored native Debug trial. Never run or modify the source.
Archives and RAW are excluded. SAVE is privately copied only with --copy-save-data.
Never overwrites a trial; copies are never packaged or uploaded.
"""
import argparse, hashlib, json, shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--trial',required=True);p.add_argument('--debug-gate',action='store_true');p.add_argument('--copy-save-data',action='store_true');a=p.parse_args()
src=Path(a.source).resolve();dst=Path(a.trial).resolve()
private=(Path(__file__).resolve().parent.parent/'artifacts'/'phase9-5b').resolve()
if private not in dst.parents or dst.exists():raise SystemExit('New trial under artifacts/phase9-5b required')
expected={'ED4.EXE':(516,'20ac1206364f2bc83f3309b650094aba27f19b4956ef6e781335c50fedd27e9d'),
'DRIVER.EXE':(16556,'0aacd13177882ae96b5f81b912ff08fc3f43462c5b97af13bf3fe91091535b3a'),
'LOGO.EXE':(409850,'fa3db4b431e157be80d7110006a4c6fc854c0e02ee396b3591b76a45702412d1'),
'SOUNDRV.COM':(4704,'3c7d00b022e9b24267ad9692e901e690dec156b901523ac7bafa448c28019e77'),
'GAME.BAT':(84,'d2fb9327484e121b725285a60ec5d5017addc722d7d3f72e2e617af2e8291420')}
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for name,(size,sha) in expected.items():
 f=src/name
 if f.stat().st_size!=size or digest(f)!=sha:raise SystemExit('Not the reviewed research installation: '+name)
files=[]
for f in src.rglob('*'):
 if not f.is_file():continue
 rel=f.relative_to(src)
 if (not a.copy_save_data and 'SAVE' in [s.upper() for s in rel.parts]) or f.suffix.lower() in ['.zip','.raw','.sav','.sve']:continue
 if f.is_symlink():raise SystemExit('Symlink not allowed')
 files.append((f,rel,digest(f)))
(dst/'game').mkdir(parents=True);(dst/'game'/'SAVE').mkdir();(dst/'captures').mkdir()
for f,rel,sha in files:
 out=dst/'game'/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,out)
 if digest(out)!=sha:raise SystemExit('Copy hash mismatch: '+str(rel))
conf='''[sdl]
fullscreen=false
output=surface
autolock=false
waitonerror=true
priority=normal,normal
[dosbox]
machine=svga_s3
memsize=16
captures=captures
[cpu]
core=normal
cputype=auto
cycles=12000
[mixer]
nosound=true
rate=22050
prebuffer=30
[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5
oplemu=default
oplrate=22050
[midi]
mpu401=none
mididevice=none
[dos]
xms=true
ems=true
umb=true
[log]
logfile=debug.log
exec=true
dosmisc=true
files=true
[autoexec]
@echo off
mount c game
c:
pause
GAME.BAT
'''
if a.debug_gate:
 gate=dst/'game'/'PDGATE.COM'
 if gate.exists():raise SystemExit('Public gate name collision')
 gate.write_bytes(bytes([0xb8,0,0x4c,0xcd,0x21])) # CC0: MOV AX,4C00; INT 21h
 conf=conf.replace('pause\nGAME.BAT','debug PDGATE.COM\nGAME.BAT')
(dst/'dosbox.conf').write_text(conf,encoding='ascii')
(dst/'manifest.json').write_text(json.dumps({'source':str(src),'trial':str(dst),'files':[{'path':str(rel),'sha256':sha,'bytes':f.stat().st_size} for f,rel,sha in files], 'saveDirectoryCopied':a.copy_save_data,'rawCopied':False,'exe':r'C:\Program Files (x86)\DOSBox-0.74-3\dosbox-74-3-debug.exe','arguments':['-conf','dosbox.conf'],'cwd':str(dst),'confSha256':digest(dst/'dosbox.conf')},indent=2),encoding='utf-8')
print('Prepared private trial:',dst,'files:',len(files),'bytes:',sum(f.stat().st_size for f,_,_ in files))
