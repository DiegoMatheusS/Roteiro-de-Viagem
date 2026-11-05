import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapLibreTrafficPort} from '../src/services/mapLibreTraffic';
import {TRAFFIC_SOURCE_ID} from '../src/services/trafficFlow';

test('trânsito só fica ao vivo após carregar um tile, inclusive ao trocar o modo',()=>{
  const listeners=new Map<string,Function>();
  let source:{setTiles:(urls:string[])=>void}|undefined,layer:unknown,loaded=0;
  const map={
    getSource:()=>source,getLayer:()=>layer,getStyle:()=>({layers:[]}),
    addSource:()=>{source={setTiles:()=>{}};},removeSource:()=>{source=undefined;},
    addLayer:(value:unknown)=>{layer=value;},removeLayer:()=>{layer=undefined;},
    on:(name:string,callback:Function)=>listeners.set(name,callback),
    off:(name:string)=>listeners.delete(name)
  } as unknown as Parameters<typeof createMapLibreTrafficPort>[0];
  const port=createMapLibreTrafficPort(map);
  const unlisten=port.listen({idle:()=>{},style:()=>{},error:()=>{},loaded:()=>{loaded++;}});
  const emit=(event:object)=>listeners.get('sourcedata')?.({sourceId:TRAFFIC_SOURCE_ID,...event});
  try{
    port.setTiles('/api/traffic/tiles/red/{z}/{x}/{y}.png');
    emit({sourceDataType:'metadata'});
    emit({sourceDataType:'content'});
    assert.equal(loaded,0,'metadados da fonte não são imagens de trânsito carregadas');
    // Eventos de tile do MapLibre não exigem sourceDataType=content.
    emit({tile:{state:'loading'}});
    emit({tile:{state:'loaded'},sourceId:'base-map'});
    assert.equal(loaded,0);
    emit({tile:{state:'loaded'}});
    assert.equal(loaded,1);

    port.setTiles('/api/traffic/tiles/light/{z}/{x}/{y}.png');
    emit({sourceDataType:'content',sourceDataChanged:true});
    assert.equal(loaded,1,'a troca para todas as cores aguarda o novo tile');
    emit({tile:{state:'loaded'}});
    assert.equal(loaded,2);

    port.setTiles(null);
    emit({tile:{state:'loaded'}});
    assert.equal(loaded,2,'eventos tardios não reativam uma camada removida');
  }finally{unlisten();}
});
