import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMapIconDensity} from '../src/services/mapIconDensity';

const text=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const settings=text('src/components/ProfileSettingsHub.tsx');
const profile=text('src/components/ProfileAndSettingsTab.tsx');
const voiceControl=text('src/components/VoiceGuidanceControl.tsx');
const voiceHook=text('src/hooks/useVoicePreference.ts');

test('settings are grouped into six distinct categories without losing profile features',()=>{
  for(const section of ['mapa','navegacao','alertas','aparencia','conta','privacidade']){
    assert.match(settings,new RegExp("id:'"+section+"'"));
  }
  assert.match(profile,/<ProfileSettingsHub/);
  assert.match(profile,/onOpenProfile=\{\(\)=>setActiveSubTab\('perfil'\)\}/);
  assert.match(profile,/<ProfileFigmaHome/);
  assert.match(profile,/<EmergencyContactsEditor/);
});
test('density has three persisted choices and Explorar is unaffected',()=>{
  assert.deepEqual(['less','moderate','more'].map(parseMapIconDensity),['less','moderate','more']);
  assert.match(settings,/Densidade dos ícones/);
  assert.match(settings,/setIconDensity\(option.id\)/);
  assert.match(settings,/O Explorar continua mostrando todos os ícones disponíveis/);
  assert.match(settings,/aria-pressed=\{iconDensity===option.id\}/);
});
test('voice settings and navigation buttons share one preference and live update events',()=>{
  assert.match(settings,/useVoicePreference\(\)/);
  assert.match(voiceControl,/useVoicePreference\(\)/);
  assert.match(voiceHook,/VOICE_PREFERENCE_EVENT/);
  assert.match(text('src/services/voicePreference.ts'),/role:voice-guidance:v1/);
});
test('alert settings preserve automatic map warnings with no radius selector',()=>{
  assert.match(settings,/sem filtro de raio/);
  assert.match(settings,/somente durante a navegação ativa/);
  assert.doesNotMatch(settings,/raioKm|radiusKm|input.*raio/i);
});
test('appearance, address history, safety and account actions remain available',()=>{
  for(const token of ['role-map-theme','clearAddressHistory','showLevelPublicly','showMedalsPublicly',
    'Proteger endereço de partida e chegada','onLogout','onLogin','OfflineRegionsPanel']){
    assert.ok(settings.includes(token),token);
  }
});
