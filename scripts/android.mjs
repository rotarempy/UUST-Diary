import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&command.endsWith('.bat')});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
const cap=path.join(root,'node_modules/@capacitor/cli/bin/capacitor');
if(!existsSync(path.join(root,'android')))run(process.execPath,[cap,'add','android']);
run(process.execPath,[cap,'sync','android']);
if(process.argv[2]==='apk') {
 if(process.platform==='win32')run('gradlew.bat',['assembleDebug'],path.join(root,'android'));
 else run('bash',['gradlew','assembleDebug'],path.join(root,'android'));
}
