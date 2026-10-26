import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingRoadAlert} from '../src/services/roadAlertDistance';
import {distanceBetweenKm} from '../src/services/gpsTracking';
import type {RoadAlert} from '../src/types/roadAlerts';

type Point=[number,number];

/** Reference: the implementation before the segment table and radius prefilter. */
function referenceNearestProgress(point:Point,route:Point[],expectedKm=0){
  let accumulated=0,bestDistance=Infinity,bestAlong=0,bestScore=Infinity;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    const factor=Math.max(0.01,Math.abs(Math.cos(point[0]*Math.PI/180)));
    const ax=(point[1]-a[1])*111.195*factor;
    const ay=(point[0]-a[0])*111.195;
    const dx=(b[1]-a[1])*111.195*factor;
    const dy=(b[0]-a[0])*111.195;
    const fraction=Math.max(0,Math.min(1,(ax*dx+ay*dy)/Math.max(1e-9,dx*dx+dy*dy)));
    const distance=Math.hypot(ax-fraction*dx,ay-fraction*dy);
    const segmentLength=distanceBetweenKm(a,b);
    const along=accumulated+fraction*segmentLength;
    const score=distance+Math.abs(along-expectedKm)*0.08;
    if(score<bestScore){bestScore=score;bestDistance=distance;bestAlong=along;}
    accumulated+=segmentLength;
  }
  return {distanceKm:bestDistance,alongKm:bestAlong};
}
function referenceUpcoming(alerts:RoadAlert[],route:Point[],position:Point|undefined,travelledKm:number,totalKm:number,now:number){
  if(!position||route.length<2)return null;
  let routeLength=0;
  for(let i=1;i<route.length;i++)routeLength+=distanceBetweenKm(route[i-1],route[i]);
  const expected=totalKm>0?Math.min(1,travelledKm/totalKm)*routeLength:0;
  const user=referenceNearestProgress(position,route,expected);
  if(user.distanceKm>0.4)return null;
  const upcoming=alerts
    .filter(alert=>Date.parse(alert.expiresAt)>now)
    .map(alert=>{
      const found=referenceNearestProgress([alert.lat,alert.lng],route,expected+1);
      return {alert,distanceKm:found.alongKm-user.alongKm,lateralKm:found.distanceKm};
    })
    .filter(item=>item.lateralKm<=0.35&&item.distanceKm>=-0.15&&item.distanceKm<=3)
    .sort((a,b)=>a.distanceKm-b.distanceKm);
  return upcoming[0]?{alert:upcoming[0].alert,distanceKm:Math.max(0,upcoming[0].distanceKm)}:null;
}

function rng(seed:number){
  let state=seed>>>0;
  return ()=>{state=(state*1664525+1013904223)>>>0;return state/0x100000000;};
}
function road(random:()=>number,points:number):Point[]{
  const path:Point[]=[];let lat=-23.5+random(),lon=-46.6+random(),heading=random()*Math.PI*2;
  for(let i=0;i<points;i++){
    heading+=(random()-0.5)*0.4;
    lat+=Math.sin(heading)*0.0003*(0.3+random()*2);
    lon+=Math.cos(heading)*0.0003*(0.3+random()*2);
    path.push([lat,lon]);
  }
  return path;
}

test('alertas à frente: resultado idêntico ao cálculo original em rotas variadas',()=>{
  const random=rng(26102026),now=Date.now();
  let found=0,none=0;
  for(let round=0;round<120;round++){
    let route=road(random,20+Math.floor(random()*1500));
    if(round%4===0)route=[...route,...route.slice(0,-1).reverse()];
    const total=5+random()*300;
    const at=Math.floor(random()*route.length);
    const position:Point=[route[at][0]+(random()-0.5)*0.0006,route[at][1]+(random()-0.5)*0.0006];
    const alerts:RoadAlert[]=Array.from({length:10},(_,i)=>{
      // Near, ahead, behind, off to the side, and well beyond the search radius.
      const target=route[Math.min(route.length-1,Math.max(0,at+Math.floor((random()-0.3)*400)))];
      const spread=[0.0002,0.002,0.004,0.03,0.08][Math.floor(random()*5)];
      return {id:`a${round}-${i}`,lat:target[0]+(random()-0.5)*spread,lng:target[1]+(random()-0.5)*spread,
        expiresAt:new Date(now+(random()<0.15?-60_000:3_600_000)).toISOString(),kind:'accident'} as unknown as RoadAlert;
    });
    const travelled=random()*total;
    const expected=referenceUpcoming(alerts,route,position,travelled,total,now);
    const actual=upcomingRoadAlert(alerts,route,position,travelled,total,now);
    assert.deepEqual(actual,expected,`rodada ${round}`);
    if(expected)found++;else none++;
  }
  assert.ok(found>5,'o teste precisa cobrir casos com alerta à frente');
  assert.ok(none>5,'o teste precisa cobrir casos sem alerta');
});

test('a tabela de trechos acompanha uma rota recriada sob o mesmo objeto',()=>{
  const now=Date.now();
  const route:Point[]=[[0,0],[0,0.01],[0,0.02]];
  const alert={id:'x',lat:0,lng:0.015,expiresAt:new Date(now+60_000).toISOString(),kind:'accident'} as unknown as RoadAlert;
  const first=upcomingRoadAlert([alert],route,[0,0.001],0,2,now);
  assert.deepEqual(first,referenceUpcoming([alert],route,[0,0.001],0,2,now));
  route.push([0,0.03],[0,0.04]);
  const second=upcomingRoadAlert([alert],route,[0,0.001],0,4,now);
  assert.deepEqual(second,referenceUpcoming([alert],route,[0,0.001],0,4,now));
});

test('rota longa com vários alertas não custa uma varredura por alerta',()=>{
  const random=rng(7),now=Date.now();
  const route=road(random,50_000);
  const at=25_000;
  const alerts:RoadAlert[]=Array.from({length:8},(_,i)=>({id:'n'+i,lat:route[at+i*30][0],lng:route[at+i*30][1],
    expiresAt:new Date(now+3_600_000).toISOString(),kind:'accident'}) as unknown as RoadAlert);
  const started=performance.now();
  for(let i=0;i<30;i++)upcomingRoadAlert(alerts,route,route[at],200,400,now);
  const perCall=(performance.now()-started)/30;
  assert.deepEqual(upcomingRoadAlert(alerts,route,route[at],200,400,now),referenceUpcoming(alerts,route,route[at],200,400,now));
  // Previously ~30 ms per call for this case on a desktop CPU. Loose bound for slow CI.
  assert.ok(perCall<25,`levou ${perCall.toFixed(2)} ms por chamada`);
});
