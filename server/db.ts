import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {initializeDatabase} from './schema';
export type {FuelDatabase} from './database';

export function openDatabase(filename=process.env.DATABASE_PATH||'./data/roteiro.sqlite'){
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename);
  if(filename!==':memory:')fs.chmodSync(filename,0o600);
  initializeDatabase(db);
  return db;
}
