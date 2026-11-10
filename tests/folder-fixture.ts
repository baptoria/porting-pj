import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
/** Real directory input; no ZIP transport in public registration tests. */
export async function folderFixture(files:Record<string,Uint8Array>,name='public') {
 const folder=resolve('artifacts/phase9-8m-folder/fixtures',randomUUID(),name.replace(/\.zip$/i,''));
 for(const [path,data] of Object.entries(files)){const dest=resolve(folder,path);if(!dest.startsWith(folder+'\\'))throw Error('fixture outside folder');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);}
 return folder;
}
