import type {DatabaseSync,StatementSync} from 'node:sqlite';

/** The business API only depends on this synchronous SQLite surface. */
export type FuelDatabase=Pick<DatabaseSync,'exec'|'close'>&{
  prepare(sql:string):Pick<StatementSync,'all'|'get'|'run'>;
  transactionSync?<T>(callback:()=>T):T;
};

/** Both hosts roll back the entire operation when any statement fails. */
export function runTransaction<T>(db:FuelDatabase,callback:()=>T):T{
  const perform=()=>{
    const result=callback();
    if(result&&typeof (result as {then?:unknown}).then==='function')throw Error('A transação deve ser síncrona.');
    return result;
  };
  if(db.transactionSync)return db.transactionSync(perform);
  db.exec('BEGIN IMMEDIATE');
  try{
    const result=perform();
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
