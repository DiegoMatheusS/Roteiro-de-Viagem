import type { R2Bucket } from '@cloudflare/workers-types';
import type { SQLInputValue } from 'node:sqlite';
import { runTransaction, type FuelDatabase } from '../server/database';

// Keep parent tables before child tables. FTS shadow tables are maintained by
// the existing address-index triggers.
export const restoreTables = [
  'users', 'sessions', 'google_traveler_sessions', 'stations', 'map_queries',
  'photos', 'prices', 'votes', 'reports', 'moderation_actions', 'road_alerts',
  'road_alert_checks', 'comments', 'place_ratings', 'place_feedback_mail',
  'locations', 'geocoding_queries', 'user_saved_locations', 'user_route_cache',
  'shared_routes', 'traveler_states', 'photo_uploads', 'user_address_history',
  'convoys', 'convoy_members', 'toll_places', 'toll_entries', 'place_photo_cache',
  'radar_cameras', 'radar_sync', 'address_index',
] as const;

const radarTables = new Set<string>(['radar_cameras', 'radar_sync']);
const generatedTables = new Set<string>(['address_index', ...radarTables]);
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';
const markerTable = 'ruavo_restore';
const maxBackupBytes = 24 * 1024 * 1024;

function restoreValue(value: unknown): SQLInputValue {
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'base64' in value && typeof value.base64 === 'string') {
    const binary = Buffer.from(value.base64, 'base64');
    if (binary.toString('base64') === value.base64) return binary;
  }
  throw new Error('Valor incompatível no arquivo de restauração.');
}

export async function restoreFromR2(db: FuelDatabase, bucket: R2Bucket, key: string) {
  db.exec("CREATE TABLE IF NOT EXISTS ruavo_restore (id INTEGER PRIMARY KEY CHECK(id=1), object_key TEXT NOT NULL)");
  const restored = db.prepare(`SELECT object_key FROM ${markerTable} WHERE id=1`).get() as {object_key:string} | undefined;
  if (restored) {
    if (restored.object_key !== key) throw new Error('Este banco já recebeu outro arquivo de restauração.');
    return;
  }

  const object = await bucket.get(key);
  if (!object || object.size > maxBackupBytes) throw new Error('Arquivo de restauração ausente ou acima do limite.');
  const backup = await object.json<{format?: unknown; tables?: unknown}>();
  if (!backup || backup.format !== 'ruavo-sqlite-v1' || !Array.isArray(backup.tables) ||
    backup.tables.length !== restoreTables.length)
    throw new Error('Formato de restauração incompatível.');
  const tables = backup.tables;

  runTransaction(db, () => {
    if (db.prepare("SELECT 1 FROM address_index WHERE source_kind <> 'catalog' LIMIT 1").get())
      throw new Error('O banco de destino já contém endereços importados.');
    for (const table of restoreTables) {
      if (!generatedTables.has(table) && db.prepare(`SELECT 1 FROM ${quote(table)} LIMIT 1`).get())
        throw new Error(`O banco de destino já contém dados em ${table}.`);
    }
    const keepCurrentRadars = Boolean(db.prepare('SELECT 1 FROM radar_cameras LIMIT 1').get());
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const [i, name] of restoreTables.entries()) {
      const table = tables[i] as {name?: unknown; columns?: unknown; rows?: unknown} | null;
      if (!table || table.name !== name || !Array.isArray(table.columns) || !Array.isArray(table.rows))
        throw new Error(`Tabela ausente ou inválida no backup: ${name}.`);
      const targetColumns = db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(column => column.name);
      const columns = new Set(table.columns);
      if (columns.size !== table.columns.length || columns.size !== targetColumns.length ||
        !targetColumns.every(column => columns.has(column)))
        throw new Error(`Colunas incompatíveis no backup: ${name}.`);

      // Keep a successful public sync already present in the destination.
      if (keepCurrentRadars && radarTables.has(name)) continue;
      // Initialization adds radar metadata and builds an address index; restore
      // the original address rows last so the FTS triggers rebuild the index.
      if (generatedTables.has(name)) db.exec(`DELETE FROM ${quote(name)}`);
      const insert = db.prepare(`INSERT INTO ${quote(name)} (${table.columns.map(quote).join(',')}) VALUES (${table.columns.map(() => '?').join(',')})`);
      for (const values of table.rows) {
        if (!Array.isArray(values) || values.length !== columns.size) throw new Error(`Linha inválida em ${name}.`);
        insert.run(...values.map(restoreValue));
      }
      const count = db.prepare(`SELECT count(*) AS total FROM ${quote(name)}`).get();
      if (count?.total !== table.rows.length) throw new Error(`Contagem divergente após restaurar ${name}.`);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Referências inválidas no banco restaurado.');
    db.prepare(`INSERT INTO ${markerTable} (id, object_key) VALUES (1, ?)`).run(key);
  });
}
