import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
const db=openDatabase(':memory:');
const server=createApi({db}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
try {
  const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/weather/route`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routePath:[[-23.55,-46.63],[-23.52,-46.60]],drivingMinutes:30,stops:[]}),signal:AbortSignal.timeout(15000)});
  const body=await response.json() as any;
  if(response.status!==200 || body.source!=='Open-Meteo' || body.weatherPoints?.length !== 2)throw new Error(body.error || 'O provedor não retornou uma previsão válida.');
  console.log(`Clima ao vivo verificado: ${body.weatherPoints.length} pontos com horário, temperatura, probabilidade de chuva e vento. Fonte: ${body.source}.`);
} catch(error){console.error('Verificação ao vivo indisponível:',(error as Error).message);process.exitCode=1;}
finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
