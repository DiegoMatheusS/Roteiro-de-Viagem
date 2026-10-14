import type { TravelerSnapshot } from './storageService';
export interface StateConflict { label:string; device:string; server:string }
const record=(v:any):v is Record<string,any> => !!v && typeof v==='object' && !Array.isArray(v);
const equal=(a:any,b:any):boolean => {
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  if(record(a)&&record(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>equal(a[k],b[k]));}
  return false;
};
const lists=new Set(['vehicles','fuelLogs','achievements','trips','convoys','profile.emergencyContacts']);
const derived=new Set(['weatherPoints','weatherUpdatedAt','weatherSource','hasRainRisk','tolls','tollsUpdatedAt','tollsMapUnavailable','tollsStatus','knownTollsCost','totalEstimatedCost','costPerPerson']);
const labels:Record<string,string>={profile:'Perfil',vehicles:'Veículo',trips:'Viagem',fuelLogs:'Abastecimento',achievements:'Conquista',activeTrip:'Viagem em andamento',selectedVehicleId:'Veículo selecionado',activeConvoyId:'Comboio selecionado',name:'nome',bio:'descrição',homeAddress:'endereço de casa',homeCoordinates:'localização de casa',title:'título',nickname:'apelido',status:'situação',routePath:'percurso',stops:'paradas',manualStops:'paradas obrigatórias',trackingDeviceId:'aparelho da navegação'};
const display=(value:any)=>value===undefined?'Removido':value===null?'Nenhum':typeof value==='string'?value.slice(0,140):Array.isArray(value)?`${value.length} itens`:record(value)?String(value.title||value.nickname||value.name||'Registro alterado'):String(value);
/** Three-way merge: only fields modified differently on both devices need a choice. */
export function mergeTravelerState(base:TravelerSnapshot|null,device:TravelerSnapshot,server:TravelerSnapshot,preference?:'server'|'device') {
  const conflicts:StateConflict[]=[];
  function merge(b:any,l:any,r:any,path:string,label:string):any {
    if(equal(l,r))return l;
    if(equal(l,b))return r;
    if(equal(r,b))return l;
    const field=path.split('.').at(-1)!;
    if(path==='activeTrip'){
      if(l?.id&&server.trips.some(t=>t.id===l.id&&['completed','cancelled'].includes(t.status)))return r;
      if(r?.id&&device.trips.some(t=>t.id===r.id&&['completed','cancelled'].includes(t.status)))return l;
      if(l?.id&&r?.id&&l.id!==r.id){if(!preference)conflicts.push({label,device:display(l),server:display(r)});return preference==='server'?r:l;}
    }
    if(field==='trackedDistanceKm'&&typeof l==='number'&&typeof r==='number')return Math.max(l,r);
    if(derived.has(field))return r;
    if(lists.has(path)&&Array.isArray(l)&&Array.isArray(r)&&[...l,...r].every(v=>record(v)&&typeof v.id==='string')){
      const bm=new Map((Array.isArray(b)?b:[]).map(v=>[v.id,v])),lm=new Map(l.map(v=>[v.id,v])),rm=new Map(r.map(v=>[v.id,v]));
      return [...new Set([...r.map(v=>v.id),...l.map(v=>v.id)])].map(id=>{
        const item=lm.get(id)||rm.get(id)||bm.get(id);
        return merge(bm.get(id),lm.get(id),rm.get(id),`${path}.${id}`,`${labels[path]||label} “${display(item)}”`);
      }).filter(v=>v!==undefined);
    }
    if(record(l)&&record(r)&&(record(b)||b==null)){
      const result:Record<string,any>={};
      for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
        const v=merge(b?.[k],l[k],r[k],path?`${path}.${k}`:k,path?`${label}: ${labels[k]||k}`:labels[k]||k);
        if(v!==undefined)result[k]=v;
      }
      return result;
    }
    if(!preference)conflicts.push({label,device:display(l),server:display(r)});
    return preference==='server'?r:l;
  }
  const state=structuredClone(merge(base,device,server,'','')) as TravelerSnapshot;
  // Completion counters follow the merged trip IDs, never count the same trip twice.
  if(base){
    const newCompleted=state.trips.filter(t=>t.status==='completed'&&base.trips.find(b=>b.id===t.id)?.status!=='completed');
    if(newCompleted.length){
      state.profile={...state.profile,completedTripsCount:base.profile.completedTripsCount+newCompleted.length,
        verifiedGpsKm:base.profile.verifiedGpsKm+newCompleted.filter(t=>t.actualTraveledVerifiedGps).reduce((s,t)=>s+(t.actualDistanceKm||0),0),
        manualKm:base.profile.manualKm+newCompleted.filter(t=>!t.actualTraveledVerifiedGps).reduce((s,t)=>s+(t.actualDistanceKm||0),0)};
      for(let i=conflicts.length-1;i>=0;i--)if(/completedTripsCount|verifiedGpsKm|manualKm/.test(conflicts[i].label))conflicts.splice(i,1);
    }
  }
  state.trips=state.trips.map(trip=>{
    if(!['planned','in_progress'].includes(trip.status))return trip;
    const count=trip.vehicleGroupType==='multi_vehicle'?Math.max(1,trip.groupVehiclesCount):1;
    const vehicle=state.vehicles.find(v=>v.id===trip.vehicleId);
    const consumption=trip.fuelPriceSource?.consumptionKmPerLiter||vehicle?.consumption.userConfigured;
    const estimatedFuelLiters=consumption?Number((trip.distanceKm/consumption*count).toFixed(2)):trip.estimatedFuelLiters;
    const estimatedFuelCost=consumption?Number((estimatedFuelLiters*trip.fuelPricePerLiter).toFixed(2)):trip.estimatedFuelCost;
    const knownTollsCost=trip.tolls?Number((trip.tolls.reduce((s,t)=>s+(t.knownCost??(t.price==null?0:t.price*t.passages)),0)*count).toFixed(2)):trip.knownTollsCost;
    const totalFoodCost=trip.peopleCount*trip.foodCostPerPerson;
    const totalEstimatedCost=Number((estimatedFuelCost+knownTollsCost+totalFoodCost).toFixed(2));
    return {...trip,estimatedFuelLiters,estimatedFuelCost,knownTollsCost,totalFoodCost,totalEstimatedCost,costPerPerson:trip.splitExpenses?Number((totalEstimatedCost/Math.max(1,trip.peopleCount)).toFixed(2)):totalEstimatedCost};
  });
  if(state.activeTrip){
    const saved=state.trips.find(t=>t.id===state.activeTrip!.id);
    if(!saved||saved.status!=='in_progress')state.activeTrip=null;
    else state.activeTrip={...saved,trackedDistanceKm:Math.max(saved.trackedDistanceKm||0,state.activeTrip.trackedDistanceKm||0)};
  }
  if(state.selectedVehicleId&&!state.vehicles.some(v=>v.id===state.selectedVehicleId))state.selectedVehicleId=state.vehicles[0]?.id||'';
  return {state,conflicts};
}
