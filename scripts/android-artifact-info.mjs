import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Only public APK/build data belongs in the artifact or the Actions summary.
const distribution=process.env.RDV_DISTRIBUTION||'debug';
if(!['debug','release'].includes(distribution))throw new Error('Tipo de APK inválido.');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk)throw new Error('Android SDK não configurado.');
const tools=join(sdk,'build-tools','36.0.0');
const apk=`android/app/build/outputs/apk/${distribution}/app-${distribution}.apk`;
const verification=execFileSync('java',['-jar',join(tools,'lib','apksigner.jar'),
  'verify','--verbose','--print-certs',apk],{encoding:'utf8'});
const fingerprint=algorithm=>{
  const digest=verification.split('\n').find(line=>line.startsWith(`Signer #1 certificate ${algorithm} digest:`))?.split(':').slice(1).join(':').trim();
  const length=algorithm==='SHA-1'?40:64;
  if(!digest||!new RegExp(`^[0-9a-f]{${length}}$`,'i').test(digest))
    throw new Error('Não foi possível identificar o certificado do APK.');
  return digest.toUpperCase().match(/../g).join(':');
};
const badging=execFileSync(join(tools,'aapt2'),['dump','badging',apk],{encoding:'utf8'});
const identity=badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m);
const expectedPackage='br.com.roteirodeviagem.app'+(distribution==='debug'?'.debug':'');
if(!identity||identity[1]!==expectedPackage)throw new Error('Pacote Android inesperado.');
const config=JSON.parse(readFileSync('android/app/src/main/assets/capacitor.config.json','utf8'));
const info={
  package:identity[1],versionCode:Number(identity[2]),versionName:identity[3],
  distribution,persistentSigning:distribution==='release'||process.env.RDV_USE_STABLE_DEBUG_SIGNING==='1',
  certificateSha1:fingerprint('SHA-1'),certificateSha256:fingerprint('SHA-256'),
  apkSha256:createHash('sha256').update(readFileSync(apk)).digest('hex'),
  apiOrigin:config.plugins?.TravelNative?.apiOrigin||null,
  sourceCommit:process.env.GITHUB_SHA||null,
  workflowRun:Number(process.env.GITHUB_RUN_NUMBER)||null,
  workflowRunId:process.env.GITHUB_RUN_ID||null,
};
mkdirSync('android-dist',{recursive:true});
writeFileSync('android-dist/apk-info.json',JSON.stringify(info,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY){
  const signing=info.persistentSigning?'Persistente':'Temporária de teste (PR/sem chave configurada)';
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n## APK gerado\n\nAssinatura: **${signing}**\n\n`+
    '```json\n'+JSON.stringify(info,null,2)+'\n```\n'+
    '\nO login Google exige um cliente OAuth Android com o pacote e o SHA-1 acima, no projeto do Client ID Web.\n');
}
console.log(`APK verificado: ${info.package}, versão ${info.versionName} (${info.versionCode}), assinatura ${info.persistentSigning?'persistente':'temporária'}.`);
