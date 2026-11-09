import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapLibreTrafficPort} from '../src/services/mapLibreTraffic';
import {TRAFFIC_SOURCE_ID} from '../src/services/trafficFlow';

test('trânsito só fica ao vivo após carregar um tile, inclusive ao trocar o modo',()=>{
  const listeners=new Map<string,Function>();
  let source:object|undefined,sourceId:string|undefined,layer:unknown,loaded=0,errors=0,created=0;
  const map={
    getSource:(id:string)=>id===sourceId?source:undefined,getLayer:()=>layer,getStyle:()=>({layers:[]}),
    addSource:(id:string)=>{sourceId=id;source={};created++;},removeSource:()=>{source=undefined;sourceId=undefined;},
    addLayer:(value:unknown)=>{layer=value;},removeLayer:()=>{layer=undefined;},
    on:(name:string,callback:Function)=>listeners.set(name,callback),
    off:(name:string)=>listeners.delete(name)
  } as unknown as Parameters<typeof createMapLibreTrafficPort>[0];
  const port=createMapLibreTrafficPort(map);
  const unlisten=port.listen({idle:()=>{},style:()=>{},error:()=>{errors++;},loaded:()=>{loaded++;}});
  const emit=(event:object)=>listeners.get('sourcedata')?.({sourceId,...event});
  try{
    port.setTiles('/api/traffic/tiles/red/{z}/{x}/{y}.png');
    const redSource=sourceId;
    assert.ok(redSource?.startsWith(`${TRAFFIC_SOURCE_ID}-`));
    emit({sourceDataType:'metadata'});
    emit({sourceDataType:'content'});
    assert.equal(loaded,0,'metadados da fonte não são imagens de trânsito carregadas');
    // Eventos de tile do MapLibre não exigem sourceDataType=content.
    emit({tile:{state:'loading'}});
    emit({tile:{state:'loaded'},sourceId:'base-map'});
    assert.equal(loaded,0);
    emit({tile:{state:'loaded'}});
    assert.equal(loaded,1);
    port.setTiles('/api/traffic/tiles/red/{z}/{x}/{y}.png');
    assert.equal(created,1,'atualizações repetidas não recriam tiles de trânsito');

    port.setTiles('/api/traffic/tiles/light/{z}/{x}/{y}.png');
    const fullSource=sourceId;
    assert.notEqual(fullSource,redSource);
    emit({sourceDataType:'content',sourceDataChanged:true});
    emit({sourceId:redSource,tile:{state:'loaded'}});
    listeners.get('error')?.({sourceId:redSource,error:{message:'request from old red tiles failed'}});
    assert.equal(loaded,1,'a troca para todas as cores aguarda o novo tile');
    assert.equal(errors,0,'erro tardio da fonte anterior não derruba o modo atual');
    emit({tile:{state:'loaded'}});
    assert.equal(loaded,2);
    listeners.get('error')?.({sourceId:fullSource,error:{message:'current tile failed'}});
    assert.equal(errors,1);

    port.setTiles(null);
    emit({sourceId:fullSource,tile:{state:'loaded'}});
    listeners.get('error')?.({sourceId:fullSource,error:{message:'late error'}});
    assert.equal(loaded,2,'eventos tardios não reativam uma camada removida');
    assert.equal(errors,1);
  }finally{unlisten();}
});
