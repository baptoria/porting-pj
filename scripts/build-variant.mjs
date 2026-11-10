import {spawnSync} from 'node:child_process';
// The normal npm build is public. Explicit developer command compiles capabilities in.
const result=spawnSync(process.execPath,[process.env.npm_execpath,'run','build'],{
 stdio:'inherit',env:{...process.env,ED4_DEVELOPER_BUILD:'1'},
});
process.exit(result.status??1);
