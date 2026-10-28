import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingHouseNumber,providerAddressLabel,rankLocationSuggestions,requestedHouseNumber} from '../src/services/locationSuggestions';
import type {LocationSelection} from '../src/types/itinerary';
const place=(id:string,name:string,address:string,coords:[number,number]):LocationSelection=>({id,name,address,coords});
test('address matching understands accents and abbreviations; explicit city wins over proximity',()=>{
  const near=place('near','Rua São João','Campinas, SP',[-23.55,-46.63]);
  const city=place('city','Rua São João','São Paulo, SP',[-23.7,-46.8]);
  assert.equal(rankLocationSuggestions('R. Sao Joao Sao Paulo',[near,city],[-23.55,-46.63])[0].id,'city');
  const avenue=place('avenue','Avenida Paulista','São Paulo',[-23.56,-46.65]);
  assert.equal(rankLocationSuggestions('Av. Paulista',[near,avenue])[0].id,'avenue');
});
test('similar matches prefer nearby addresses and duplicates do not hide other house numbers',()=>{
  const far=place('far','Rua das Flores, 10','São Paulo',[-23.8,-46.8]);
  const near=place('near','Rua das Flores, 10','São Paulo',[-23.55,-46.63]);
  const duplicate={...near,id:'same-place'};
  const other=place('other','Rua das Flores, 100','São Paulo',[-23.55,-46.63]);
  const result=rankLocationSuggestions('Rua das Flores 10',[far,near,duplicate,other,near],[-23.55,-46.63]);
  assert.deepEqual(result.map(p=>p.id),['near','far','other']);
});
test('provider label distinguishes house numbers, includes neighbourhood and retains venue names',()=>{
  const address={street:'Rua São João',housenumber:'20',district:'Centro',city:'São Paulo',state:'SP',postcode:'01000-000',country:'Brasil'};
  assert.deepEqual(providerAddressLabel(address),{name:'Rua São João, 20',address:'Rua São João, 20, Centro, São Paulo, SP, 01000-000, Brasil'});
  assert.equal(providerAddressLabel({...address,name:'Museu Municipal'}).name,'Museu Municipal');
  assert.equal(providerAddressLabel({street:'Rua sem número'}).name,'Rua sem número');
});

test('house-number matching distinguishes building numbers from street names and postal codes',()=>{
  assert.equal(requestedHouseNumber('Rua das Flores 100, São Paulo'),'100');
  assert.equal(requestedHouseNumber('Av. Paulista, 1500, São Paulo'),'1500');
  assert.equal(requestedHouseNumber('Rua 25 de Março, 100, São Paulo'),'100');
  assert.equal(requestedHouseNumber('Avenida 9 de Julho 1200'),'1200');
  assert.equal(requestedHouseNumber('Rua 25 de Março'),null);
  assert.equal(requestedHouseNumber('Rua 15'),null);
  assert.equal(requestedHouseNumber('Shopping 24 Horas'),null);
  assert.equal(requestedHouseNumber('Rua das Flores, nº 100A'),'100a');
  assert.equal(requestedHouseNumber('Rua das Flores 100, apto 21'),'100');
  const exact=place('exact','Rua das Flores, 100','Rua das Flores, 100, São Paulo, 01000-100',[-23.55,-46.63]);
  const another=place('other','Rua das Flores, 10','Rua das Flores, 10, São Paulo, 01000-100',[-23.55,-46.63]);
  const street=place('street','Rua das Flores','Rua das Flores, São Paulo, 01000-100',[-23.55,-46.63]);
  assert.equal(matchingHouseNumber(exact,'100'),true);
  assert.equal(matchingHouseNumber(another,'100'),false);
  assert.equal(matchingHouseNumber(street,'100'),false);
  assert.equal(matchingHouseNumber(place('short','Rua das Flores 100','São Paulo',[-23.55,-46.63]),'100'),true);
  assert.equal(matchingHouseNumber(place('single','Paulista 100','São Paulo',[-23.55,-46.63]),'100'),true);
  assert.equal(matchingHouseNumber(place('leading','100 Avenida Paulista','São Paulo',[-23.55,-46.63]),'100'),true);
});
