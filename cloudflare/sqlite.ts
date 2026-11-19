import type {SQLInputValue} from 'node:sqlite';
import type {FuelDatabase} from '../server/database';

type Row=Record<string,unknown>;
export interface SqliteObjectStorage{
  sql:{exec(query:string,...values:(string|number|null|ArrayBuffer)[]):{toArray():Row[]}};
  transactionSync<T>(callback:()=>T):T;
}
const input=(value:SQLInputValue):string|number|null|ArrayBuffer=>{
  if(value===null||typeof value==='string'||typeof value==='number')return value;
  if(typeof value==='bigint'){
    const result=Number(value);if(!Number.isSafeInteger(result))throw Error('Inteiro SQLite fora do intervalo seguro.');return result;
  }
  return Uint8Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)).buffer;
};
const row=(value:Row)=>Object.fromEntries(Object.entries(value).map(([key,item])=>[key,item instanceof ArrayBuffer?Buffer.from(item):item]));

/** Shared SQL rules, with Cloudflare's real atomic transaction/rollback API. */
export function durableSqlite(storage:SqliteObjectStorage):FuelDatabase{
  const execute=(query:string,values:SQLInputValue[]=[])=>{
    try{return storage.sql.exec(query,...values.map(input));}
    catch(error){
      if(error instanceof Error&&/constraint failed|SQLITE_CONSTRAINT/i.test(error.message))Object.assign(error,{code:'SQLITE_CONSTRAINT'});
      throw error;
    }
  };
  return {
    exec(query){
      if(/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(query))throw Error('Migre o backup para o esquema atual antes de importar.');
      const sql=query.replace(/PRAGMA\s+(?:journal_mode\s*=\s*WAL|foreign_keys\s*=\s*ON)\s*;/gi,'').trim();
      if(sql)execute(sql).toArray();
    },
    prepare(query){
      return {
        all:(...values:SQLInputValue[])=>execute(query,values).toArray().map(row),
        get:(...values:SQLInputValue[])=>{
          const result=execute(query,values).toArray()[0];return result?row(result):undefined;
        },
        run:(...values:SQLInputValue[])=>{
          execute(query,values).toArray();
          const [result]=execute('SELECT changes() AS changes,last_insert_rowid() AS lastInsertRowid').toArray();
          return {changes:Number(result.changes),lastInsertRowid:Number(result.lastInsertRowid)};
        },
      } as ReturnType<FuelDatabase['prepare']>;
    },
    transactionSync:callback=>storage.transactionSync(callback),
    close(){/* Cloudflare owns the persistent database lifecycle. */},
  };
}
