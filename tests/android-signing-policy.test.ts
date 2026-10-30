import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_SIGNING_SHA256,verifyRoleSigningCertificate} from '../scripts/android-signing-policy.mjs';

test('updates accept the existing APK certificate and reject another private key',()=>{
  assert.doesNotThrow(()=>verifyRoleSigningCertificate(ROLE_SIGNING_SHA256,true));
  assert.doesNotThrow(()=>verifyRoleSigningCertificate(ROLE_SIGNING_SHA256.replaceAll(':','').toLowerCase(),true));
  const discardedDebug='F4:1F:E2:7A:DA:AD:8E:64:A4:2E:66:91:A9:C4:55:41:60:36:59:8F:9A:7E:54:4C:44:F2:F3:23:A8:3B:6B:7E';
  assert.throws(()=>verifyRoleSigningCertificate(discardedDebug,true),/certificado difere/);
  assert.doesNotThrow(()=>verifyRoleSigningCertificate(discardedDebug,false),'isolated PR validation may use a temporary key');
  assert.throws(()=>verifyRoleSigningCertificate('',true),/inválido/);
});
