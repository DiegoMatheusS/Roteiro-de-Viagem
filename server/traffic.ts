import sharp from 'sharp';
import {ApiError} from './http';
import {createTrafficService as createCoreTrafficService,registerTrafficRoutes as registerCoreTrafficRoutes,type TrafficOptions} from './trafficCore';
const unavailable=()=>new ApiError('Trânsito ao vivo indisponível no momento.',503);
export type {TrafficOptions} from './trafficCore';

/** Os tiles reais do provedor são a única fonte de congestionamentos. Remove
 * verde/amarelo e conserva exclusivamente vermelho forte, sem colorir vias
 * baseado em classe, velocidade inventada ou simulação. */
export async function trafficRedOnlyPng(tile:Buffer):Promise<Buffer> {
  const {data,info}=await sharp(tile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==256||info.height!==256||info.channels!==4)throw unavailable();
  for(let i=0;i<data.length;i+=4){
    const red=data[i],green=data[i+1],blue=data[i+2];
    // Exclui laranja/amarelo: só vermelho intenso é congestionamento grave.
    const congested=red>=145&&green<=105&&blue<=135&&
      red>=green*1.7&&red>=blue*1.5;
    if(!congested){data[i+3]=0;continue;}
    data[i]=232;data[i+1]=33;data[i+2]=48;
  }
  return sharp(data,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
}

export function createTrafficService(options:TrafficOptions={}){return createCoreTrafficService({redOnlyPng:trafficRedOnlyPng,...options});}
export function registerTrafficRoutes(...args:Parameters<typeof registerCoreTrafficRoutes>){
  return registerCoreTrafficRoutes(args[0],args[1],{redOnlyPng:trafficRedOnlyPng,...args[2]});
}
