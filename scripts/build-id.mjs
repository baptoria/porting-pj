import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
let commit='unknown',dirty=true;
try{commit=execFileSync('git',['rev-parse','--short=12','HEAD'],{encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();}catch{}
const builtAt=new Date().toISOString();
const build={id:`9-8k-${builtAt.replace(/\D/g,'')}-${randomUUID().slice(0,8)}`,commit,dirty,builtAt,revision:'phase9-8k-1'};
await writeFile('src/build-info.json',JSON.stringify(build,null,2)+'\n');
console.log('Launcher build:',build.id);
