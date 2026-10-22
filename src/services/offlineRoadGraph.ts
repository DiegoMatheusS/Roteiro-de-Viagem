/** Licensed road data, not raster tiles. Edges are *directed* and each
 * geometry is a surveyed/mapped road polyline, never a guessed shortcut.
 * The road supplier must encode turn restrictions in its graph topology.
 */
export type RoadPoint=[number,number]; // [latitude, longitude]
export interface OfflineRoadNode {id:string;coords:RoadPoint}
export interface OfflineRoadEdge {
  from:string;to:string;path:RoadPoint[];speedKmh:number;
  name?:string;
}
export interface OfflineRoadGraph {
  format:'role-road-graph-v1';
  regionId:string;
  attribution:string;
  offlinePermissionConfirmed:true;
  /** License/source provided by the graph publisher, independently of map tiles. */
  sourceId:string;
  nodes:OfflineRoadNode[];
  edges:OfflineRoadEdge[];
}
export interface OfflineGraphRoute {
  routePath:RoadPoint[];
  distanceKm:number;
  drivingMinutes:number; // Estimated using imported edge speeds, not real-time traffic.
  snappedOriginMeters:number;
  snappedDestinationMeters:number;
  edgeCount:number;
}
export const ROAD_GRAPH_MAX_BYTES=8_000_000;
export const ROAD_GRAPH_MAX_NODES=4000;
export const ROAD_GRAPH_MAX_EDGES=12000;
export const ROAD_SNAP_MAX_METERS=75;
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const point=(p:unknown):p is RoadPoint=>Array.isArray(p)&&p.length===2&&
  typeof p[0]==='number'&&typeof p[1]==='number'&&
  Number.isFinite(p[0])&&Number.isFinite(p[1])&&
  Math.abs(p[0])<=85.05112878&&Math.abs(p[1])<=180;
export const roadDistanceMeters=(a:RoadPoint,b:RoadPoint):number=>{
  const r=Math.PI/180,lat1=a[0]*r,lat2=b[0]*r;
  const dLat=(b[0]-a[0])*r,dLon=(b[1]-a[1])*r;
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*6371000*Math.asin(Math.min(1,Math.sqrt(h)));
};
function legalCoords(p:RoadPoint,bounds:{south:number;west:number;north:number;east:number}):boolean{
  return point(p)&&p[0]>=bounds.south-0.00001&&p[0]<=bounds.north+0.00001&&
    p[1]>=bounds.west-0.00001&&p[1]<=bounds.east+0.00001;
}
export function validateOfflineRoadGraph(value:unknown,bounds:{
  south:number;west:number;north:number;east:number
}):OfflineRoadGraph{
  if(!value||typeof value!=='object')throw Error('Rede viária offline inválida.');
  const graph=value as Partial<OfflineRoadGraph>;
  if(graph.format!=='role-road-graph-v1'||!ID.test(graph.regionId||'')||
    graph.offlinePermissionConfirmed!==true||
    !graph.sourceId||!ID.test(graph.sourceId)||
    typeof graph.attribution!=='string'||graph.attribution.trim().length<3||
    graph.attribution.length>250)
    throw Error('A rede viária precisa de origem, atribuição e licença offline.');
  if(!Array.isArray(graph.nodes)||graph.nodes.length<2||
    graph.nodes.length>ROAD_GRAPH_MAX_NODES||
    !Array.isArray(graph.edges)||graph.edges.length<1||
    graph.edges.length>ROAD_GRAPH_MAX_EDGES)
    throw Error('Rede viária vazia ou acima do limite seguro.');
  const ids=new Map<string,RoadPoint>();
  for(const node of graph.nodes){
    if(!node||!ID.test(node.id)||!legalCoords(node.coords,bounds)||ids.has(node.id))
      throw Error('Nó duplicado, inválido ou fora da região.');
    ids.set(node.id,node.coords);
  }
  let vertices=0;
  for(const edge of graph.edges){
    if(!edge||!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to||
      !Number.isFinite(edge.speedKmh)||edge.speedKmh<5||edge.speedKmh>120||
      !Array.isArray(edge.path)||edge.path.length<2||edge.path.length>100||
      (edge.name!==undefined&&(typeof edge.name!=='string'||edge.name.length>120)))
      throw Error('Rua sem origem, destino, velocidade ou geometria válida.');
    vertices+=edge.path.length;
    if(vertices>80000)throw Error('Geometria viária acima do limite seguro.');
    let sum=0;
    for(let i=0;i<edge.path.length;i++){
      if(!legalCoords(edge.path[i],bounds))throw Error('Rua fora da região cadastrada.');
      if(i>0){
        const segment=roadDistanceMeters(edge.path[i-1],edge.path[i]);
        if(segment>350||segment<0.05)throw Error('Rua apresenta segmento muito longo ou inválido.');
        sum+=segment;
      }
    }
    if(sum<2||sum>20000||
      roadDistanceMeters(ids.get(edge.from)!,edge.path[0])>8||
      roadDistanceMeters(ids.get(edge.to)!,edge.path[edge.path.length-1])>8)
      throw Error('Geometria não conecta os nós da rua.');
  }
  return graph as OfflineRoadGraph;
}
interface QueueEntry {id:string;cost:number}
function push(heap:QueueEntry[],entry:QueueEntry){
  heap.push(entry);let i=heap.length-1;
  while(i>0){const p=(i-1)>>1;if(heap[p].cost<=entry.cost)break;
    heap[i]=heap[p];i=p;}
  heap[i]=entry;
}
function pop(heap:QueueEntry[]):QueueEntry|undefined{
  if(!heap.length)return;
  const top=heap[0],last=heap.pop()!;
  if(!heap.length)return top;
  let i=0;
  while(i*2+1<heap.length){
    const left=i*2+1,right=left+1;
    const child=right<heap.length&&heap[right].cost<heap[left].cost?right:left;
    if(heap[child].cost>=last.cost)break;
    heap[i]=heap[child];i=child;
  }
  heap[i]=last;
  return top;
}
function snap(nodes:readonly OfflineRoadNode[],coords:RoadPoint){
  let closest:OfflineRoadNode|null=null,distance=Infinity;
  for(const node of nodes){
    const d=roadDistanceMeters(node.coords,coords);
    if(d<distance){closest=node;distance=d;}
  }
  return {closest,distance};
}
/** Dijkstra along real directed edges. Never fabricates a line from GPS to a
 * road or a missing road between disconnected components. */
export function calculateOfflineRoadRoute(
  graph:OfflineRoadGraph,origin:RoadPoint,destination:RoadPoint
):OfflineGraphRoute|null{
  if(!point(origin)||!point(destination))return null;
  const first=snap(graph.nodes,origin),last=snap(graph.nodes,destination);
  if(!first.closest||!last.closest||first.distance>ROAD_SNAP_MAX_METERS||
    last.distance>ROAD_SNAP_MAX_METERS||first.closest.id===last.closest.id)return null;
  const adjacent=new Map<string,{edge:OfflineRoadEdge;km:number;minutes:number}[]>();
  for(const edge of graph.edges){
    let length=0;
    for(let i=1;i<edge.path.length;i++)
      length+=roadDistanceMeters(edge.path[i-1],edge.path[i]);
    const options=adjacent.get(edge.from)||[];
    options.push({edge,km:length/1000,minutes:length/1000/edge.speedKmh*60});
    adjacent.set(edge.from,options);
  }
  const distances=new Map<string,number>([[first.closest.id,0]]);
  const prev=new Map<string,{edge:OfflineRoadEdge;km:number;minutes:number}>();
  const heap:QueueEntry[]=[];
  push(heap,{id:first.closest.id,cost:0});
  let visits=0;
  while(heap.length){
    const current=pop(heap)!;
    if(current.cost!==distances.get(current.id))continue;
    if(current.id===last.closest.id)break;
    if(++visits>ROAD_GRAPH_MAX_NODES)return null;
    for(const candidate of adjacent.get(current.id)||[]){
      const next=current.cost+candidate.minutes;
      if(next<(distances.get(candidate.edge.to)??Infinity)){
        distances.set(candidate.edge.to,next);
        prev.set(candidate.edge.to,candidate);
        push(heap,{id:candidate.edge.to,cost:next});
      }
    }
  }
  if(!prev.has(last.closest.id))return null;
  const taken:{edge:OfflineRoadEdge;km:number;minutes:number}[]=[];
  let at=last.closest.id;
  while(at!==first.closest.id){
    const edge=prev.get(at);
    if(!edge||taken.length>=ROAD_GRAPH_MAX_EDGES)return null;
    taken.push(edge);at=edge.edge.from;
  }
  taken.reverse();
  const routePath:RoadPoint[]=[];
  let distanceKm=0,drivingMinutes=0;
  for(const segment of taken){
    distanceKm+=segment.km;drivingMinutes+=segment.minutes;
    routePath.push(...(routePath.length?segment.edge.path.slice(1):segment.edge.path));
    if(routePath.length>8000)return null;
  }
  if(distanceKm<=0||drivingMinutes<=0)return null;
  return {routePath,distanceKm,drivingMinutes,
    snappedOriginMeters:first.distance,snappedDestinationMeters:last.distance,
    edgeCount:taken.length};
}
