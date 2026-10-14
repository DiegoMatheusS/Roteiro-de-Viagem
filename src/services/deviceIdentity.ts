export function getDeviceId(){
  let id=localStorage.getItem('rdv_device_v1');
  if(!id){id=crypto.randomUUID();localStorage.setItem('rdv_device_v1',id);}
  return id;
}
