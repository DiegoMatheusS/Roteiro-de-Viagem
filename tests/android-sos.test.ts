import test from 'node:test';
import assert from 'node:assert/strict';
import {apiOrigin} from '../scripts/android-config.mjs';
import {normalizeContactPhone,isFreshSosLocation,sosMessage,whatsAppSosUrl} from '../src/services/sos';
test('native backend configuration accepts HTTPS origins and rejects paths, credentials and fragments',()=>{
 assert.equal(apiOrigin('https://backend.example/'),'https://backend.example');assert.equal(apiOrigin('',false),'');
 for(const value of ['', 'http://backend.example','https://user:pass@backend.example','https://backend.example/api','https://backend.example/#token','https://backend.example/?key=value'])assert.throws(()=>apiOrigin(value));
});
test('SOS contacts normalize Brazilian and international numbers without repeating country codes',()=>{
 assert.equal(normalizeContactPhone('(11) 99999-9999'),'+5511999999999');assert.equal(normalizeContactPhone('+55 (11) 99999-9999'),'+5511999999999');assert.equal(normalizeContactPhone('5511999999999'),'+5511999999999');assert.equal(normalizeContactPhone('+1 415 555 0100'),'+14155550100');assert.throws(()=>normalizeContactPhone('123'));
});
test('SOS cannot compose a fabricated, expired or future location',()=>{
 const position={coords:[-23.55,-46.63] as [number,number],timestamp:Date.now(),accuracyMeters:5,speedMetersPerSecond:null};
 assert.equal(isFreshSosLocation(position),true);assert.equal(isFreshSosLocation(null),false);assert.equal(isFreshSosLocation({...position,timestamp:Date.now()-61000}),false);assert.equal(isFreshSosLocation({...position,timestamp:Date.now()+10000}),false);
 assert.throws(()=>sosMessage({...position,timestamp:Date.now()-61000}));const url=new URL(whatsAppSosUrl(position,'+5511999999999'));assert.equal(url.searchParams.get('phone'),'5511999999999');assert.match(url.searchParams.get('text')!,/maps.google.com\/\?q=-23.55,-46.63/);assert.match(url.searchParams.get('text')!,/Precisão aproximada: 5 m/);assert.doesNotMatch(url.searchParams.get('text')!,/Mensagem enviada/);
});
