import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Android update builds always demand the owner persistent keystore',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android.yml',import.meta.url),'utf8');
  const gradle=readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
  const info=readFileSync(new URL('../scripts/android-artifact-info.mjs',import.meta.url),'utf8');
  assert.match(workflow,/if: github\.event_name != 'pull_request' && inputs\.distribution != 'release'/);
  assert.match(workflow,/Build de instalação recusado:[^\n]*chave permanente/);
  assert.match(workflow,/echo "::error::Build de instalação recusado:[^\n]*\n\s*exit 1/);
  assert.match(workflow,/RDV_USE_STABLE_DEBUG_SIGNING=1/);
  assert.match(gradle,/RDV_USE_STABLE_DEBUG_SIGNING'\) == '1'/);
  assert.match(info,/RDV_REQUIRE_STABLE_SIGNING==='1' && !info\.persistentSigning/);
  assert.match(info,/verifyRoleSigningCertificate\(info\.certificateSha256,info\.persistentSigning\)/);
  assert.match(workflow,/RDV_REQUIRE_STABLE_SIGNING: \$\{\{ github\.event_name != 'pull_request'/);
});

test('CI uses disposable certificates only internally and never uploads a preview installable APK',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android.yml',import.meta.url),'utf8');
  const ci=workflow.split('      - name: Validar APK e AAB com chave descartável de teste')[1]
    .split('      - name: Preparar chave privada de release')[0];
  assert.match(ci,/keytool -genkeypair/);
  assert.doesNotMatch(ci,/cp app\/build\/outputs\/apk\/release/);
  assert.doesNotMatch(ci,/cp app\/build\/outputs\/bundle\/release/);
  const preview=workflow.split('      - name: Disponibilizar relatório de validação da PR')[1]
    .split('      - name: Remover chave temporária')[0];
  assert.match(preview,/name: role-android-pr-ci-report/);
  assert.match(preview,/path: android-dist\/apk-info\.json/);
  assert.doesNotMatch(preview,/app-debug\.apk|app-release\.apk|role-android-pr-preview/);
  const distributable=workflow.split('      - name: Disponibilizar pacote conectado ao backend')[1]
    .split('      - name: Disponibilizar relatório de validação da PR')[0];
  assert.match(distributable,/github\.event_name != 'pull_request'/);
  assert.match(distributable,/steps\.signing\.outputs\.persistent == 'true'/);
});
