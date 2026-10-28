import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GpsCalibrationPanel} from '../../src/components/GpsCalibrationPanel';
import '../../src/index.css';
function Fixture(){
  const [open,setOpen]=useState(true);
  return <><button onClick={()=>setOpen(value=>!value)}>{open?'Fechar calibração':'Abrir calibração'}</button>
    {open&&<GpsCalibrationPanel/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
