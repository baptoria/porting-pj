// Read-only source/deployment audit. The imported audit writes local evidence,
// never Git/browser data. No network or game payload handling.
import './check-phase9-6.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',['-c','core.safecrlf=false',...a],{encoding:'utf8'}).trim();
const unchanged=['src/music.ts','src/raw-audio.ts','src/archive.ts','src/storage.ts','src/style.css','tests/phase9-6','tests/phase9-6-ui','tests/phase9-6-cache','tests/phase9-6-bench','scripts/prepare-phase9-6.mjs','scripts/build-phase9-6.sh','scripts/phase9-6-common.mjs'];
if(git('diff','HEAD','--name-only','--',...unchanged))throw Error('Protected Phase 9-6/storage/RAW file changed');
const z=unzipSync(await readFile('docs/ed4/sources/ed4-mobile-source.zip'));
for(const path of ['src/emulator-audio.ts','src/engine.ts','src/main.ts','src/experimental-engine.ts','src/generated/phase9-7-worker.ts','scripts/prepare-phase9-7-worker.mjs','PHASE9_7_AUDIO_PITCH_REPORT.md']){
 if(hash(z['ed4-mobile/'+path])!==hash(await readFile(path)))throw Error('Stale corresponding source: '+path);
}
const publicProbe=Buffer.from((await readFile('tests/fixtures/phase9-7-audio.b64','utf8')).trim(),'base64');
if(hash(publicProbe)!=='61fea5a955e87bae6822e56418e14c2de50d790774d00060f13691276698ae6c')throw Error('Unknown public probe bytes');
const manifest=JSON.parse(await readFile('docs/ed4/phase9-7-worker.json','utf8'));
if(hash(await readFile('docs/ed4/'+manifest.entry))!==manifest.entrySha256||hash(await readFile('docs/ed4/'+manifest.common))!==manifest.sha256)throw Error('Worker hash mismatch');
if(!z['ed4-mobile/public/'+manifest.entry])throw Error('Worker source omission');
const audit=JSON.parse(await readFile('artifacts/phase9-6/deployment-audit.json','utf8'));
if(audit.staged)throw Error('Unexpected staged changes');
await writeFile('artifacts/phase9-7/deployment-audit.json',JSON.stringify({...audit,audioWorker:manifest,phase96AndStorageUnchanged:true,sourceMatches:true},null,2));
console.log('Phase 9-7: unchanged WASM/RAW/storage, public-only payload, current GPL source, Worker hashes verified.');
