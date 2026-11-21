import {PNG} from 'pngjs';

export interface PhotoImagesBinding{
  info(stream:ReadableStream<Uint8Array>):Promise<{format?:string;width?:number;height?:number;frames?:number}>;
  input(stream:ReadableStream<Uint8Array>):{
    transform(options:{width:number;height:number;fit:'scale-down';background:string}):{
      output(options:{format:'image/jpeg';quality:number;anim:false}):Promise<{image():ReadableStream<Uint8Array>}>;
    };
  };
}
const stream=(bytes:Buffer)=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(Uint8Array.from(bytes));controller.close();}});

function animated(bytes:Buffer):boolean{
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!png&&!webp)return false;
  for(let offset=png?8:12;offset+8<=bytes.length;){
    const size=png?bytes.readUInt32BE(offset):bytes.readUInt32LE(offset+4);
    const kind=bytes.toString('ascii',offset+(png?4:0),offset+(png?8:4));
    if(kind==='acTL'||kind==='ANIM'||kind==='ANMF')return true;
    const next=offset+(png?12:8)+size+(webp?size%2:0);
    if(next>bytes.length)throw Error('Imagem inválida.');
    offset=next;
  }
  return false;
}

/** Remove EXIF/XMP/IPTC/comments without recompressing JPEG pixels. */
export function stripJpegMetadata(bytes:Buffer):Buffer{
  if(bytes.length<4||bytes.readUInt16BE(0)!==0xffd8)throw Error('JPEG inválido.');
  const parts:Buffer[]=[bytes.subarray(0,2)];let offset=2;
  while(offset+1<bytes.length){
    if(bytes[offset]!==255)throw Error('JPEG inválido.');
    const marker=bytes[offset+1];
    if(marker===0xda||marker===0xd9){parts.push(bytes.subarray(offset));return Buffer.concat(parts);}
    if(offset+4>bytes.length)throw Error('JPEG inválido.');
    const size=bytes.readUInt16BE(offset+2),end=offset+2+size;
    if(size<2||end>bytes.length)throw Error('JPEG inválido.');
    if(![0xe1,0xed,0xfe].includes(marker))parts.push(bytes.subarray(offset,end));
    offset=end;
  }
  throw Error('JPEG inválido.');
}

export async function sanitizeEdgePhoto(images:PhotoImagesBinding,bytes:Buffer):Promise<Buffer>{
  const info=await images.info(stream(bytes));
  if(!['jpeg','jpg','png','webp','image/jpeg','image/png','image/webp'].includes(info.format||'')||
    !info.width||!info.height||info.width*info.height>24_000_000||(info.frames??1)>1||animated(bytes))
    throw Error('Envie uma foto JPG, PNG ou WEBP de até 24 megapixels.');
  // Same 1600px/quality-80 JPEG contract as the Node host. Cloudflare handles
  // EXIF orientation and the new JPEG does not retain original metadata.
  const output=await images.input(stream(bytes)).transform({width:1600,height:1600,fit:'scale-down',background:'#ffffff'})
    .output({format:'image/jpeg',quality:80,anim:false});
  const result=stripJpegMetadata(Buffer.from(await new Response(output.image()).arrayBuffer()));
  if(result.length>1024*1024)throw Error('Imagem muito grande após processamento.');
  return result;
}

/** Only real provider pixels become red congestion, just like the Node codec. */
export async function edgeTrafficRedOnlyPng(bytes:Buffer):Promise<Buffer>{
  const image=PNG.sync.read(bytes,{checkCRC:true});
  if(image.width!==256||image.height!==256)throw Error('Bloco de trânsito inválido.');
  for(let i=0;i<image.data.length;i+=4){
    const red=image.data[i],green=image.data[i+1],blue=image.data[i+2];
    if(!(red>=145&&green<=105&&blue<=135&&red>=green*1.7&&red>=blue*1.5)){image.data[i+3]=0;continue;}
    image.data[i]=232;image.data[i+1]=33;image.data[i+2]=48;
  }
  return Buffer.from(PNG.sync.write(image));
}
