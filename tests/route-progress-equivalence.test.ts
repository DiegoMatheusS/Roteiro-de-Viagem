import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRouteProgress} from '../src/services/routeProgress';

type Point=[number,number];
const METERS_PER_DEGREE=111_195;
const MAX_ROUTE_OFFSET_METERS=150;
const PARALLEL_ROAD_TOLERANCE_METERS=20;
const valid=(point:Point):boolean=>Array.isArray(point)&&point.length===2&&
  point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;

/** Reference implementation: the original two full scans. The optimized
 * projection must return exactly the same segment, fraction and point. */
function referenceProjection(path:Point[],location:Point,travelledKm:number,totalKm:number){
  if(path.length<2||!valid(location))return null;
  const lonScale=METERS_PER_DEGREE*Math.max(0.1,Math.cos(location[0]*Math.PI/180));
  const projected=(index:number)=>{
    const a=path[index-1],b=path[index];
    if(!valid(a)||!valid(b))return null;
    const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*METERS_PER_DEGREE;
    const gx=(location[1]-a[1])*lonScale,gy=(location[0]-a[0])*METERS_PER_DEGREE;
    const sq=dx*dx+dy*dy;
    const t=sq>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/sq)):0;
    return {meters:Math.hypot(gx-t*dx,gy-t*dy),t,segmentMeters:Math.hypot(dx,dy)};
  };
  let nearestMeters=Infinity;
  for(let index=1;index<path.length;index++){
    const candidate=projected(index);
    if(candidate)nearestMeters=Math.min(nearestMeters,candidate.meters);
  }
  if(nearestMeters>MAX_ROUTE_OFFSET_METERS)return null;
  const progress=Number.isFinite(travelledKm)&&Number.isFinite(totalKm)&&totalKm>0
    ?Math.min(1,Math.max(0,travelledKm/totalKm)):0;
  let nearest:{segmentStart:number;fraction:number;projected:Point;segmentMeters:number}|null=null,bestScore=Infinity;
  for(let index=1;index<path.length;index++){
    const candidate=projected(index);
    if(!candidate||candidate.meters>nearestMeters+PARALLEL_ROAD_TOLERANCE_METERS)continue;
    const fraction=(index-1+candidate.t)/(path.length-1);
    const score=candidate.meters+Math.abs(fraction-progress)*150;
    if(score<bestScore){
      bestScore=score;
      nearest={segmentStart:index-1,fraction:candidate.t,
        projected:[
          path[index-1][0]+(path[index][0]-path[index-1][0])*candidate.t,
          path[index-1][1]+(path[index][1]-path[index-1][1])*candidate.t
        ],segmentMeters:candidate.segmentMeters};
    }
  }
  return nearest;
}

// Deterministic generator so a failure is reproducible.
function rng(seed:number){
  let state=seed>>>0;
  return ()=>{state=(state*1664525+1013904223)>>>0;return state/0x100000000;};
}

function wanderingRoad(random:()=>number,points:number,lat:number,lon:number):Point[]{
  const path:Point[]=[];
  let heading=random()*Math.PI*2;
  for(let i=0;i<points;i++){
    heading+=(random()-0.5)*0.5;
    lat+=Math.sin(heading)*0.0002*(0.2+random()*2);
    lon+=Math.cos(heading)*0.0002*(0.2+random()*2);
    path.push([lat,lon]);
  }
  return path;
}

test('projeção otimizada devolve exatamente o mesmo trecho que a varredura completa',()=>{
  const random=rng(20261026);
  let compared=0,matched=0,offRoute=0;
  for(let round=0;round<250;round++){
    const length=2+Math.floor(random()*400);
    const path=wanderingRoad(random,length,-23.5+random(),-46.6+random());
    // Close some routes into loops/out-and-back so the progress tie-break matters.
    if(round%5===0)path.push(...path.slice(0,-1).reverse());
    const total=10+random()*400;
    for(let sample=0;sample<12;sample++){
      const base=path[Math.floor(random()*path.length)];
      // Exactly on a vertex, a few metres off, near the 150 m limit, and far away.
      const offset=[0,0.00003,0.0008,0.0014,0.0016,0.02][Math.floor(random()*6)];
      const angle=random()*Math.PI*2;
      const location:Point=[base[0]+Math.sin(angle)*offset,base[1]+Math.cos(angle)*offset];
      const travelled=random()*total;
      const expected=referenceProjection(path,location,travelled,total);
      const actual=projectRouteProgress(path,location,travelled,total);
      compared++;
      if(expected===null)offRoute++;
      assert.deepEqual(actual,expected,`rodada ${round}, amostra ${sample}`);
      matched++;
    }
  }
  assert.equal(matched,compared);
  assert.ok(offRoute>0,'o teste precisa cobrir pontos fora da via');
  assert.ok(offRoute<compared,'o teste precisa cobrir pontos sobre a via');
});

test('vértices inválidos continuam ignorados e o cache acompanha uma rota recriada',()=>{
  const good:Point[]=[[0,0],[0,0.01],[0,0.02],[0,0.03]];
  const broken:Point[]=[[0,0],[Number.NaN,0.01],[0,0.02],[0,0.03]];
  const location:Point=[0,0.025];
  assert.deepEqual(projectRouteProgress(broken,location,1,3),referenceProjection(broken,location,1,3));
  assert.deepEqual(projectRouteProgress(good,location,1,3),referenceProjection(good,location,1,3));
  // Same array object, different geometry (end points changed): never serve a stale index.
  const reused:Point[]=[[0,0],[0,0.01]];
  assert.deepEqual(projectRouteProgress(reused,[0,0.005],0,1),referenceProjection(reused,[0,0.005],0,1));
  reused[0]=[0.5,0.5];reused.push([0.5,0.51]);
  assert.deepEqual(projectRouteProgress(reused,[0.5,0.505],0,1),referenceProjection(reused,[0.5,0.505],0,1));
});

test('rotas longas são projetadas sem varrer o cálculo completo de cada segmento',()=>{
  const road:Point[]=Array.from({length:60_000},(_,i)=>[-23.5,-46.5+i*0.00025]);
  const location:Point=[-23.5,-46.5+30_000*0.00025];
  const started=performance.now();
  for(let i=0;i<50;i++)projectRouteProgress(road,location,200,400);
  const perCall=(performance.now()-started)/50;
  assert.deepEqual(projectRouteProgress(road,location,200,400),referenceProjection(road,location,200,400));
  // The previous implementation needed >15 ms per call here. Keep a very loose
  // bound so slow CI machines do not make this flaky.
  assert.ok(perCall<10,`projeção levou ${perCall.toFixed(2)} ms por chamada`);
});
