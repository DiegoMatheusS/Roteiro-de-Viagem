import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectTripStops,selectMeetingPins,selectSharingParticipants,lngLat} from '../src/services/mapLibreTripPins';
import type {RouteStop,MeetingPoint,ConvoyParticipant} from '../src/types';

const place:RouteStop={id:'osm:node:1',name:'Mirante confirmado',category:'mirante',
  lat:-23.52,lng:-46.61,description:'Parada de passeio',recommendedMinutes:15};
const meeting:MeetingPoint={id:'p1',title:'Ponto inicial',category:'minha_escolha',
  coords:[-23.53,-46.62],order:1,confirmedArrivedParticipantIds:[]};
const participant:ConvoyParticipant={id:'a',name:'Viajante Teste',vehicleType:'motorcycle',
  isOrganizer:true,isSharingLocation:true,coords:[-23.54,-46.63],
  lastLocationTimestamp:'2026-10-17T23:00:00.000Z',joinedAt:'2026-10-17T20:00:00.000Z'};

test('native pins accept real, unique scenic and convoy points only',()=>{
  assert.deepEqual(selectTripStops([place,place,{...place,id:'bad',lat:NaN}]).map(x=>x.id),['osm:node:1']);
  assert.deepEqual(selectTripStops([{...place,category:'posto'}, {...place,id:'a',category:'posto',type:'suggested'}]).map(x=>x.id),['a']);
  assert.deepEqual(selectMeetingPins([meeting,meeting,{...meeting,id:'bad',coords:[91,0]}]).map(x=>x.id),['p1']);
  assert.deepEqual(lngLat([-23.5,-46.6]),[-46.6,-23.5]);
});
test('participants must opt in to location and recent location cannot be fabricated',()=>{
 const now=Date.parse('2026-10-17T23:01:00.000Z');
 const people:ConvoyParticipant[]=[participant,participant,{...participant,id:'private',isSharingLocation:false},
   {...participant,id:'missing',coords:undefined},{...participant,id:'expired',lastLocationTimestamp:'2026-10-17T22:50:00.000Z'},
   {...participant,id:'bad',coords:[-100,0]},{...participant,id:'future',lastLocationTimestamp:'2026-10-18T20:00:00.000Z'}];
 assert.deepEqual(selectSharingParticipants(people,now).map(x=>x.id),['a']);
});
test('MapLibre pins update each member coordinates without replacing unrelated participants',()=>{
  const s=readFileSync(new URL('../src/services/mapLibreTripPins.ts',import.meta.url),'utf8');
  const m=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(s,/record\.marker\.setLngLat\(lngLat\(coords\(item\)\)\)/);
  assert.match(s,/element\.title=person\.name/);
  assert.match(s,/className='custom-stop-marker'/);
  assert.match(s,/meeting-point-marker/);
  assert.match(s,/convoy-participant-marker/);
  assert.match(s,/setDOMContent\(details\)/);
  assert.doesNotMatch(s,/\.setHTML\(/);
  assert.match(m,/tripPinsControllerRef\.current=controller/);
  assert.match(m,/stopPinGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(m,/meetingPinGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(m,/convoyPinGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(m,/previous\.marker\.setLatLng\(person\.coords\)/);
  assert.match(m,/selectRouteRef\.current\?\.\(option\.id\)/);
});
