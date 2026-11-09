import hashlib,json
from pathlib import Path
root=Path('artifacts/phase9-5b')
m=json.loads((root/'native-old-03/manifest.json').read_text(encoding='utf-8'))
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=[];trial=[]
for f in m['files']:
 if h(Path(m['source'])/f['path'])!=f['sha256']:original.append(f['path'])
 if h(Path(m['trial'])/'game'/f['path'])!=f['sha256']:trial.append(f['path'])
result={'verifiedSourceFiles':len(m['files']),'sourceChanges':original,'privateTrialChanges':trial,'confSha256':h(root/'native-old-03/dosbox.conf'),'debugExeSha256':h(Path(m['exe']))}
(root/'native-preservation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2));assert not original
