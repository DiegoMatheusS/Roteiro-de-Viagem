export function apiOrigin(value,required=true){
  if(!value){if(!required)return '';throw new Error('Defina RDV_API_URL com a origem HTTPS do backend.');}
  let url;try{url=new URL(value);}catch{throw new Error('RDV_API_URL inválida.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('RDV_API_URL deve ser uma origem HTTPS, sem caminho ou credenciais.');
  return url.origin;
}
