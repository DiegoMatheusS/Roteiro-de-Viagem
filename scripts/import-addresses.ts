import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {openDatabase} from '../server/db';
import {importPublicAddress} from '../server/addressImport';

const file=process.argv[2];
if(!file)throw Error('Uso: npm run addresses:import -- caminho/enderecos.ndjson');
const db=openDatabase();let line=0,imported=0,pending=0;
try{
  db.exec('BEGIN IMMEDIATE');
  for await(const raw of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
    line++;if(!raw.trim())continue;
    if(raw.length>8000)throw Error('Registro excede 8 KB.');
    importPublicAddress(db,JSON.parse(raw));imported++;pending++;
    if(pending===1000){db.exec('COMMIT');pending=0;db.exec('BEGIN IMMEDIATE');}
  }
  db.exec('COMMIT');console.log(`${imported} endereços públicos importados. Nenhuma consulta externa.`);
}catch(error){db.exec('ROLLBACK');console.error(`Falha na linha ${line}. ${imported-pending} registros anteriores já foram confirmados. ${(error as Error).message}`);process.exitCode=1;}
finally{db.close();}
