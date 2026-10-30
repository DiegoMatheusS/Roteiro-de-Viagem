import test from 'node:test';
import assert from 'node:assert/strict';
import type {Place} from '../src/types/admin';
import {SAO_PAULO_EXPLORE_CATALOG as catalog} from '../src/catalogs/saoPauloExplore';
import {EXPLORE_CATALOG as fullCatalog} from '../src/catalogs/explore';
import {exploreDistanceKm,filterExplorePlaces,mergeExplorePlaces} from '../src/services/explorePlaces';

const origin:[number,number]=[-23.551,-46.629];
const cities=['Santos','Atibaia','São Roque','Itu','Ilhabela','Campos do Jordão','Ubatuba',
  'Holambra','Serra Negra','Socorro','Boituva','Águas de Lindóia','Santo Antônio do Pinhal','Botucatu'];

test('all 80 requested destinations and the existing scenic road have real photos and source metadata',()=>{
  assert.equal(catalog.length,81);
  assert.equal(new Set(catalog.map(place=>place.id)).size,81);
  assert.deepEqual(catalog.filter(place=>place.kind==='city').map(place=>place.name),cities);
  for(const place of catalog){
    assert.ok(place.coords[0]>-25&&place.coords[0]<-21,place.name);
    assert.ok(place.coords[1]>-49&&place.coords[1]<-44,place.name);
    assert.ok(place.photo?.startsWith('https://'),place.name);
    assert.ok(place.photoPage?.startsWith('https://'),place.name);
    assert.ok(place.photoCredit&&place.sourceUrl&&place.coordinateSource,place.name);
    assert.doesNotMatch(place.photo!,/logo|\.svg(?:\?|$)/i,place.name);
    if(place.photoPage?.includes('commons.wikimedia.org')&&!place.photoCredit.includes('Public domain'))
      assert.ok(place.photoLicense?.startsWith('https://'),place.name);
  }
  assert.ok(catalog.some(place=>place.name==='Nubank Parque'&&place.aliases?.includes('Allianz Parque')));
  const santos=catalog.find(place=>place.name==='Santos')!;
  assert.ok(exploreDistanceKm(santos.coords,[-23.934,-46.328])<1,'Santos points to the urban centre');
});

test('browse the catalog without GPS and find distant cities by an accent-insensitive search',()=>{
  const all=mergeExplorePlaces([]);
  assert.equal(all.length,fullCatalog.length);
  assert.equal(filterExplorePlaces(all,'all','').length,fullCatalog.length,'no fixed twelve-result cap');
  assert.equal(filterExplorePlaces(all,'near','').length,fullCatalog.length,'GPS is required only to calculate a route');
  assert.equal(filterExplorePlaces(all,'cities','').length,14);
  assert.equal(filterExplorePlaces(all,'near','campos do jordao',origin)[0]?.name,'Campos do Jordão');
  assert.equal(filterExplorePlaces(all,'all','sao roque')[0]?.name,'São Roque');
  assert.equal(filterExplorePlaces(all,'all','catedral metropolitana')[0]?.name,'Catedral da Sé');
  assert.equal(filterExplorePlaces(all,'all','allianz')[0]?.name,'Nubank Parque');
  assert.equal(filterExplorePlaces(all,'all','lugar inexistente').length,0);
});

test('nearby radius and category filters do not hide cities from their own filter',()=>{
  const all=mergeExplorePlaces([],origin);
  const nearby=filterExplorePlaces(all,'near','',origin);
  assert.ok(nearby.length>20);
  assert.ok(nearby.every(place=>exploreDistanceKm(origin,place.coords)<=120));
  assert.ok(!nearby.some(place=>place.name==='Campos do Jordão'));
  assert.equal(filterExplorePlaces(all,'cities','',origin).length,14);
  const culture=filterExplorePlaces(all,'culture','');
  assert.ok(culture.some(place=>place.name==='Pinacoteca de São Paulo'));
  assert.ok(!culture.some(place=>place.name==='Parque Ibirapuera'));
  const roads=filterExplorePlaces(all,'road','');
  assert.ok(roads.some(place=>place.name==='Estrada dos Romeiros'));
  assert.ok(!roads.some(place=>place.name==='Farol Santander'));
  assert.ok(filterExplorePlaces(all,'nature','').some(place=>place.name==='Parque Estadual da Cantareira'));
});

test('imported duplicates retain curated photos; inactive, invalid and unrelated places stay out',()=>{
  const base:Place={id:'osm:1',name:'ALLIANZ PARQUE',kind:'attraction',lat:-23.5276,lng:-46.6785,
    address:'São Paulo, SP',sourceUrl:'https://www.openstreetmap.org/node/1',
    description:'',website:'',phone:'',active:true};
  const imported=[base,{...base,id:'osm:2',name:'Mirante de teste',lat:-23.6,lng:-46.6},
    {...base,id:'osm:3',name:'Desativado',active:false},
    {...base,id:'osm:4',name:'Inválido',lat:NaN},
    {...base,id:'osm:5',name:'Posto',kind:'fuel' as const},
    {...base,id:'osm:6',lat:-22,lng:-45}];
  const merged=mergeExplorePlaces(imported,origin);
  assert.equal(merged.length,fullCatalog.length+2);
  assert.equal(merged.some(place=>place.id==='osm:1'),false);
  assert.ok(merged.find(place=>place.name==='Nubank Parque')?.photo);
  assert.ok(merged.some(place=>place.id==='osm:2'));
  assert.ok(merged.some(place=>place.id==='osm:6'),'same name in a different city is retained');
  assert.ok(!merged.some(place=>['osm:3','osm:4','osm:5'].includes(place.id)));
  const distances=merged.map(place=>exploreDistanceKm(origin,place.coords));
  assert.deepEqual(distances,[...distances].sort((a,b)=>a-b));
  assert.equal(catalog[0].name,'Parque Ibirapuera','sorting does not mutate the catalog');
});

test('statewide outdoor discovery reaches the coast and the west, with separate water and park filters',()=>{
  const all=mergeExplorePlaces([],origin);
  const inland=filterExplorePlaces(all,'all','',origin,'inland');
  assert.ok(inland.some(place=>place.city==='Teodoro Sampaio'));
  assert.ok(inland.some(place=>place.city==='São José do Rio Preto'));
  assert.ok(inland.some(place=>place.city==='Bauru'));
  assert.ok(!inland.some(place=>place.city==='São Paulo'));
  const coast=filterExplorePlaces(all,'all','',origin,'coast');
  assert.ok(coast.some(place=>place.name==='Ilhabela'));
  assert.ok(coast.some(place=>place.name==='Rodovia Rio–Santos'));
  assert.ok(coast.every(place=>['Santos','Ilhabela','Ubatuba','São Sebastião','Caraguatatuba','Cubatão','Bertioga','Iguape'].includes(place.city)));
  assert.ok(filterExplorePlaces(all,'waterfalls','').some(place=>place.name==='Cachoeira dos Pretos'));
  assert.ok(filterExplorePlaces(all,'waterfalls','').some(place=>place.name==='Cachoeira do Meu Deus'));
  assert.ok(filterExplorePlaces(all,'lakes','').some(place=>place.name==='Lago do Taboão'));
  assert.ok(filterExplorePlaces(all,'parks','').some(place=>place.name==='Parque Estadual do Juquery'));
  for(const place of fullCatalog){
    assert.ok(place.coords[0]>-25.5&&place.coords[0]<-19.7,place.name);
    assert.ok(place.coords[1]>-53.2&&place.coords[1]<-44,place.name);
    assert.ok(place.photo?.startsWith('https://')&&place.photoPage&&place.photoCredit,place.name);
    assert.ok(place.sourceUrl&&place.coordinateSource,place.name);
    assert.doesNotMatch(place.photo!,/logo|\.svg(?:\?|$)/i,place.name);
  }
});

test('requested scenic roads appear once, including alternate names already catalogued',()=>{
  const roads=filterExplorePlaces(mergeExplorePlaces([]),'road','');
  const queries=['SP-312','Serra da Macaca','Gomeral','Serra de São Pedro','SP-123',
    'Rio Santos','SP-125','SP-099','SP-160','SP-150','Mogi Bertioga','Estrada do Vinho',
    'Estrada das Cabras','Rota das Cavernas','Casemiro Teixeira'];
  for(const query of queries)assert.equal(filterExplorePlaces(roads,'road',query).length,1,query);
  assert.equal(new Set(fullCatalog.map(place=>place.id)).size,fullCatalog.length);
  assert.equal(filterExplorePlaces(roads,'road','Serra da Macaca')[0].id,'sp-estrada-parque-carlos-botelho');
  assert.equal(filterExplorePlaces(roads,'road','SP-312')[0].id,'sp-estrada-dos-romeiros');
});

test('racetracks have their own filter and Anhembi is found under its official name without GPS',()=>{
  const all=mergeExplorePlaces([]);
  const tracks=filterExplorePlaces(all,'racetracks','');
  assert.deepEqual(tracks.map(place=>place.city),['São Paulo','Mogi Guaçu','Indaiatuba','Piracicaba']);
  assert.equal(filterExplorePlaces(all,'racetracks','José Carlos Pace')[0]?.name,'Autódromo de Interlagos');
  assert.equal(filterExplorePlaces(all,'racetracks','Velo Città')[0]?.name,'Autódromo Velocitta');
  assert.equal(filterExplorePlaces(all,'culture','Grande Otelo')[0]?.name,'Sambódromo do Anhembi');
  const interlagos=tracks[0];
  const imported:Place={id:'osm:interlagos',name:'Autódromo José Carlos Pace',kind:'attraction',
    lat:interlagos.coords[0],lng:interlagos.coords[1],address:interlagos.address,
    sourceUrl:interlagos.coordinateSource!,description:'',website:'',phone:'',active:true};
  assert.equal(mergeExplorePlaces([imported]).length,fullCatalog.length,'official and popular names do not duplicate a venue');
});
