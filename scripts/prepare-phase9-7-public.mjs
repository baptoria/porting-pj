// CC0 public probe only. No installation, game files or browser data access.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=Buffer.from((await readFile('tests/fixtures/phase9-7-audio.b64','utf8')).trim(),'base64');
if(createHash('sha256').update(bytes).digest('hex')!=='61fea5a955e87bae6822e56418e14c2de50d790774d00060f13691276698ae6c')throw Error('Public probe mismatch');
const root='artifacts/phase9-7/native';await mkdir(root+'/captures',{recursive:true});
for(const [file,data]of [['AUDIO.COM',bytes],['dosbox.conf',await readFile('tests/fixtures/phase9-7-native.conf')]]){
 try{if(!(await readFile(root+'/'+file)).equals(data))throw Error('Refusing to overwrite different trial file '+file);}
 catch(e){if(e.code!=='ENOENT')throw e;await writeFile(root+'/'+file,data);}
}
console.log('Prepared isolated CC0 OPL/PCM probe; source: scripts/phase9-7-audio.S');
