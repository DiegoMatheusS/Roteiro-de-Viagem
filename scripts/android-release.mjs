import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {apiOrigin} from './android-config.mjs';
apiOrigin(process.env.RDV_API_URL);
for(const name of ['RDV_KEYSTORE_FILE','RDV_STORE_PASSWORD','RDV_KEY_ALIAS','RDV_KEY_PASSWORD','RDV_VERSION_CODE','RDV_VERSION_NAME'])if(!process.env[name])throw new Error(`Defina ${name} antes de gerar o release.`);
if(!existsSync(process.env.RDV_KEYSTORE_FILE))throw new Error('O arquivo de assinatura informado não existe.');
if(!/^[1-9]\d{0,8}$/.test(process.env.RDV_VERSION_CODE))throw new Error('RDV_VERSION_CODE deve ser um inteiro positivo.');
for(const [cmd,args,cwd] of [['node',['scripts/android-sync.mjs'],process.cwd()],[process.platform==='win32'?'gradlew.bat':'./gradlew',[':app:assembleRelease',':app:bundleRelease'],'android']]){
 const result=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32',env:process.env});if(result.status!==0)process.exit(result.status||1);
}
