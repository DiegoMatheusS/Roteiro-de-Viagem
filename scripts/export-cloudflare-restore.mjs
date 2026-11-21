import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { createApi } from '../server/api.ts';
import { openDatabase } from '../server/db.ts';
import { restoreTables } from '../cloudflare/restore.ts';

const [source, output] = process.argv.slice(2);
if (!source || !output) {
  console.error('Uso: node --import tsx scripts/export-cloudflare-restore.mjs BACKUP.sqlite RESTAURACAO.json');
  process.exit(1);
}

const folder = mkdtempSync(join(tmpdir(), 'ruavo-restore-'));
const copy = join(folder, 'roteiro.sqlite');
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"';
try {
  const original = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(original, copy);
  } finally {
    original.close();
  }
  const db = openDatabase(copy);
  try {
    const api = createApi({
      db, migrateLocalPhotos: false, photoDirectory: folder,
      sanitizePhoto: async () => { throw new Error('A exportação não recebe fotos.'); },
    });
    api.locals.feedbackMail.close();
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('O backup não passou na verificação de integridade.');

    const expected = new Set(restoreTables);
    const extra = db.prepare('PRAGMA table_list').all().filter(
      table => table.schema === 'main' && table.type === 'table' &&
        !table.name.startsWith('sqlite_') && !expected.has(table.name),
    );
    if (extra.length) throw new Error('O backup contém tabelas fora do esquema de restauração.');

    const tables = restoreTables.map(name => {
      const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(column => column.name);
      const statement = db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`);
      statement.setReturnArrays(true);
      const rows = statement.all().map(row => row.map(value =>
        value instanceof Uint8Array ? {base64: Buffer.from(value).toString('base64')} : value));
      return {name, columns, rows};
    });
    writeFileSync(output, JSON.stringify({format:'ruavo-sqlite-v1',tables}), {flag:'wx',mode:0o600});
    console.log(`Arquivo de restauração criado com ${tables.reduce((sum, {rows}) => sum + rows.length, 0)} registros.`);
  } finally {
    db.close();
  }
} finally {
  rmSync(folder, {recursive:true,force:true});
}
