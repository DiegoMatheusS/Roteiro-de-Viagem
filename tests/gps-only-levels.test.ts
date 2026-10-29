import test from 'node:test';
import assert from 'node:assert/strict';
import {storageService,emptyTravelerSnapshot} from '../src/services/storageService';
import {createRoadDraft} from '../src/services/touristCircuit';
import {GUEST_NAVIGATION_VEHICLE} from '../src/services/guestNavigationVehicle';

const data=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem:(key:string)=>data.get(key)??null,
  setItem:(key:string,value:string)=>data.set(key,value),
  removeItem:(key:string)=>data.delete(key)
}});

test('100,000 manually entered kilometres cannot grant Diamond or any level progress',()=>{
  const profile={...emptyTravelerSnapshot('level-test').profile,manualKm:100000};
  const bronze=storageService.calculateTier(profile);
  assert.equal(bronze.tier,'Bronze');
  assert.equal(bronze.progressPercent,0);
  assert.equal(bronze.neededKmForNextTier,500);
  assert.equal(storageService.calculateTier({...profile,verifiedGpsKm:499}).tier,'Bronze');
  assert.equal(storageService.calculateTier({...profile,verifiedGpsKm:500}).tier,'Prata');
  assert.equal(storageService.calculateTier({...profile,verifiedGpsKm:2000}).tier,'Ouro');
  assert.equal(storageService.calculateTier({...profile,verifiedGpsKm:10000}).tier,'Diamante');
});

test('manual history cannot unlock distance medals; GPS trips still do, exactly once',()=>{
  storageService.setScope('gps-only-test');
  storageService.replaceSnapshot(emptyTravelerSnapshot('gps-only-test'));
  const start=(id:string)=>storageService.saveTrip({...createRoadDraft({
    originName:'Origem',originCoords:[0,0],destinationName:'Destino',destinationCoords:[0,.01],
    vehicle:GUEST_NAVIGATION_VEHICLE,circular:false,limits:{mode:'destination'}
  }),id,status:'in_progress'});
  start('manual');
  const manual=storageService.completeTrip('manual',100000,false);
  assert.equal(manual.updatedProfile.manualKm,100000);
  assert.equal(manual.updatedProfile.verifiedGpsKm,0);
  assert.equal(storageService.calculateTier(manual.updatedProfile).tier,'Bronze');
  assert.equal(manual.newAchievementsUnlocked.some(a=>a.category==='distancia'),false);
  assert.equal(storageService.getAchievements().some(a=>a.category==='distancia'&&a.unlockedAt),false);
  start('gps-100');
  const gps=storageService.completeTrip('gps-100',120,true);
  assert.equal(gps.updatedProfile.verifiedGpsKm,120);
  assert.ok(gps.newAchievementsUnlocked.some(a=>a.id==='ach-100km'));
  assert.equal(gps.newAchievementsUnlocked.some(a=>a.id==='ach-500km'),false);
  start('gps-500');
  const long=storageService.completeTrip('gps-500',500,true);
  assert.ok(long.newAchievementsUnlocked.some(a=>a.id==='ach-500km'));
  assert.equal(storageService.calculateTier(long.updatedProfile).tier,'Prata');
  storageService.completeTrip('gps-500',500,true);
  assert.equal(storageService.getProfile().verifiedGpsKm,620);
  assert.equal(storageService.getProfile().manualKm,100000);
});
