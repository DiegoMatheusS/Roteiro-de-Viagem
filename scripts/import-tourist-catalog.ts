import { openDatabase } from '../server/db';
import { TOURISM_REGIONS, importTourismRegion, type TourismRegionKey } from '../server/touristCatalog';

const args=process.argv.slice(2);
const name=args.find(arg=>arg.startsWith('--region='))?.slice('--region='.length);
const target=args.find(arg=>arg.startsWith('--db='))?.slice('--db='.length);
const list=Object.keys(TOURISM_REGIONS).sort() as TourismRegionKey[];
if(!name||!list.includes(name as TourismRegionKey)){
  console.error('Uso: npm run tourism:import -- --region=sao-paulo [--db=./data/roteiro.sqlite]');
  console.error('Regiões disponíveis: '+list.join(', '));
  process.exitCode=1;
}else{
  const region=TOURISM_REGIONS[name as TourismRegionKey];
  const db=openDatabase(target||process.env.DATABASE_PATH||'./data/roteiro.sqlite');
  try{
    const result=await importTourismRegion(db,{coords:[region.coords[0],region.coords[1]],radiusKm:region.radiusKm});
    console.log(JSON.stringify({region:name,label:region.label,...result}));
  }catch(error){
    console.error('Importação não concluída:',(error as Error).message);
    process.exitCode=1;
  }finally{db.close();}
}
