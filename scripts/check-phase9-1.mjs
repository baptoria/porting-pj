import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/phase9-1',before=JSON.parse(await readFile(`${root}/preserved-before.json`,'utf8')),after={};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())await walk(path);else if(entry.isFile())after[path]=createHash('sha256').update(await readFile(path)).digest('hex');}}
for(const dir of ['docs','public','src','tests/e2e'])await walk(dir);
const differences=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(path=>before[path]!==after[path]);
const result={checkedFiles:Object.keys(before).length,differences,preserved:differences.length===0};
await writeFile(`${root}/preservation-result.json`,JSON.stringify(result,null,2));console.log(result);
if(differences.length)process.exitCode=1;
