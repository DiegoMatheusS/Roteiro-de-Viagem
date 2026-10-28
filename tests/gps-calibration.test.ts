import test from 'node:test';
import assert from 'node:assert/strict';
import {calibrateDeviceGps} from '../src/services/gpsCalibration';
import {readDeviceLocation,type DeviceLocation} from '../src/services/locationService';

const fix=(accuracyMeters:number,timestamp=Date.now(),coords:[number,number]=[-23.55,-46.63]):DeviceLocation=>
  ({coords,accuracyMeters,timestamp,speedMetersPerSecond:0,headingDegrees:null});
function provider(){
  let receive!:(fix:DeviceLocation)=>void,fail!:(error:string)=>void,stops=0;
  return {watch:(position:(fix:DeviceLocation)=>void,error:(message:string)=>void)=>{
    receive=position;fail=error;return()=>{stops++;};
  },emit:(fix:DeviceLocation)=>receive(fix),fail:(error:string)=>fail(error),get stops(){return stops;}};
}
test('calibration needs distinct consistent precise fixes, then clears its watch',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const source=provider(),progress:number[]=[];
  const now=Date.now(),pending=calibrateDeviceGps({watch:source.watch,onProgress:accuracy=>progress.push(accuracy)});
  source.emit(fix(100,now));source.emit(fix(12,now));source.emit(fix(12,now));
  assert.equal(source.stops,0,'duplicate cached callbacks do not confirm calibration');
  source.emit(fix(8,now+1000));const result=await pending;
  assert.equal(result.quality,'stable');assert.equal(result.samples,2);assert.equal(result.position.accuracyMeters,8);
  assert.equal(source.stops,1);assert.deepEqual(progress,[100,12,8]);
  t.mock.timers.tick(12000);assert.equal(source.stops,1);
});
test('deadline may report limited accuracy only from a still-fresh real fix',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1_800_000_000_000});
  const source=provider(),pending=calibrateDeviceGps({watch:source.watch});
  source.emit(fix(10));t.mock.timers.tick(9000);source.emit(fix(35));t.mock.timers.tick(3000);
  const result=await pending;assert.equal(result.quality,'limited');assert.equal(result.position.accuracyMeters,35);
  assert.equal(source.stops,1);
});
test('old readings, poor accuracy and impossible future timestamps never pass calibration',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1_800_000_000_000});const source=provider();
  const pending=calibrateDeviceGps({watch:source.watch}),rejected=assert.rejects(pending,/GPS recente/);
  source.emit(fix(5,Date.now()-6001));source.emit(fix(5,Date.now()+5001));source.emit(fix(200));
  t.mock.timers.tick(12000);await rejected;assert.equal(source.stops,1);
});
test('position jumps cannot certify a stable signal',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1_800_000_000_000});const source=provider();
  const pending=calibrateDeviceGps({watch:source.watch}),rejected=assert.rejects(pending,/GPS recente/);
  source.emit(fix(5));source.emit(fix(5,Date.now()+1000,[0,0]));assert.equal(source.stops,0);
  t.mock.timers.tick(18000);await rejected;assert.equal(source.stops,1);
});
test('cancel, permission failure and hiding the page release GPS immediately',async()=>{
  const source=provider(),controller=new AbortController();
  const pending=calibrateDeviceGps({watch:source.watch,signal:controller.signal}),cancelled=assert.rejects(pending,/cancelada/);
  controller.abort();await cancelled;assert.equal(source.stops,1);source.emit(fix(5));assert.equal(source.stops,1);
  const failed=provider(),error=calibrateDeviceGps({watch:failed.watch}),denied=assert.rejects(error,/Permita/);
  failed.fail('Permita acesso ao GPS');await denied;assert.equal(failed.stops,1);
  const doc=Object.assign(new EventTarget(),{hidden:false}),hiddenSource=provider();
  const hidden=calibrateDeviceGps({watch:hiddenSource.watch,doc}),paused=assert.rejects(hidden,/sair da tela/);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await paused;assert.equal(hiddenSource.stops,1);
});
test('synchronous provider completion releases the newly returned watch',async()=>{
  let stopped=0;const now=Date.now();
  const result=await calibrateDeviceGps({watch:receive=>{receive(fix(10,now));receive(fix(9,now+1000));return()=>{stopped++;};}});
  assert.equal(result.quality,'stable');assert.equal(stopped,1);
});
test('native travel course precedes compass heading; browsers retain standard heading',()=>{
  const position={timestamp:Date.now(),coords:{latitude:-23.55,longitude:-46.63,accuracy:8,speed:5,heading:90,course:180}};
  assert.equal(readDeviceLocation(position as unknown as GeolocationPosition).headingDegrees,180);
  assert.equal(readDeviceLocation({...position,coords:{...position.coords,course:null}} as unknown as GeolocationPosition).headingDegrees,null);
  const {course,...legacy}=position.coords;
  assert.equal(readDeviceLocation({...position,coords:legacy} as unknown as GeolocationPosition).headingDegrees,90);
});
