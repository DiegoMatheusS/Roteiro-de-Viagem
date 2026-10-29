import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVehicleNumber} from '../src/services/vehicleNumberInput';

test('vehicle values accept both decimal separators without silently replacing an empty field',()=>{
  assert.equal(parseVehicleNumber(''),null);
  assert.equal(parseVehicleNumber('  '),null);
  assert.equal(parseVehicleNumber('1'),1);
  assert.equal(parseVehicleNumber('0'),0);
  assert.equal(parseVehicleNumber('12,5'),12.5);
  assert.equal(parseVehicleNumber('12.75'),12.75);
  assert.equal(parseVehicleNumber('0,5'),0.5);
  assert.equal(parseVehicleNumber('.5'),0.5);
  for(const input of ['NaN','Infinity','12,5,3','1.000,5','15 litros','1e3','-2'])
    assert.equal(parseVehicleNumber(input),null,input);
});
