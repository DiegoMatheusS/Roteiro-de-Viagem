import test from 'node:test';
import assert from 'node:assert/strict';
import {manuallySelectedAddress,streetQueryForManualPin} from '../src/services/manualAddressPin';

test('busca usa a rua sem o número e preserva bairro e cidade',()=>{
  assert.equal(streetQueryForManualPin('Rua Professor Custódio de Faria, 188, São Paulo'),
    'Rua Professor Custódio de Faria, São Paulo');
  assert.equal(streetQueryForManualPin('Rua 25 de Março, 100, São Paulo'),
    'Rua 25 de Março, São Paulo');
  assert.equal(streetQueryForManualPin('Rua das Flores nº 100A, São Paulo'),
    'Rua das Flores, São Paulo');
  assert.equal(streetQueryForManualPin('Rua das Flores, São Paulo'),
    'Rua das Flores, São Paulo');
  assert.equal(streetQueryForManualPin(''),null);
});

test('a pessoa escolhe primeiro o ponto e depois informa o número, se souber',()=>{
  const point:[number,number]=[-23.55055,-46.63337];
  assert.deepEqual(manuallySelectedAddress('Rua das Flores, São Paulo',point,'188'),{
    name:'Rua das Flores, 188, São Paulo',
    address:'Rua das Flores, 188, São Paulo',coords:point,category:'manual'
  });
  assert.equal(manuallySelectedAddress('Rua das Flores, São Paulo',point,'').address,
    'Rua das Flores, São Paulo');
  assert.equal(manuallySelectedAddress('Rua das Flores, 188, São Paulo',point,'190').address,
    'Rua das Flores, 190, São Paulo');
  assert.equal(manuallySelectedAddress('Rua das Flores nº 188, São Paulo',point).address,
    'Rua das Flores, 188, São Paulo');
});

test('não aceita localização inválida, números não plausíveis ou inventa id de geocodificador',()=>{
  assert.throws(()=>manuallySelectedAddress('Rua das Flores', [91,-46.63]),/válido/);
  assert.throws(()=>manuallySelectedAddress('', [-23,-46]),/válido/);
  assert.throws(()=>manuallySelectedAddress('Rua das Flores', [-23,-46], 'abc'),/número válido/);
  const record=manuallySelectedAddress('Rua das Flores',[-23,-46],'99');
  assert.equal(record.id,undefined);
  assert.equal(record.sourceUrl,undefined);
});
