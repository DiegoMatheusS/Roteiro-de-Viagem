import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(filename = process.env.DATABASE_PATH || './data/roteiro.sqlite') {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, address TEXT NOT NULL, source_url TEXT NOT NULL, opening_hours TEXT, hours_verified_at TEXT, map_updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS map_queries (id TEXT PRIMARY KEY, station_ids TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id), user_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, image_data BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS prices (id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id), user_id TEXT NOT NULL REFERENCES users(id), fuel_type TEXT NOT NULL, custom_label TEXT, price REAL NOT NULL CHECK(price > 0), observed_at TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS votes (price_id TEXT NOT NULL REFERENCES prices(id), user_id TEXT NOT NULL REFERENCES users(id), vote TEXT NOT NULL CHECK(vote IN ('confirm','contest')), created_at TEXT NOT NULL, PRIMARY KEY(price_id,user_id));
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, UNIQUE(target_type,target_id,user_id));
    CREATE TABLE IF NOT EXISTS moderation_actions (id TEXT PRIMARY KEY, moderator_id TEXT NOT NULL REFERENCES users(id), target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS prices_station ON prices(station_id,fuel_type,created_at);
    CREATE INDEX IF NOT EXISTS prices_user ON prices(user_id,created_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  const photoColumns = db.prepare('PRAGMA table_info(photos)').all() as any[];
  if (!photoColumns.some(column => column.name === 'image_data')) db.exec('ALTER TABLE photos ADD COLUMN image_data BLOB');
  const addColumns = (table: string, columns: Record<string, string>) => {
    const present = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(row => row.name));
    for (const [name, declaration] of Object.entries(columns))
      if (!present.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`);
  };
  addColumns('users', { blocked_at: 'TEXT', deleted_at: 'TEXT' });
  addColumns('stations', { kind: "TEXT NOT NULL DEFAULT 'fuel'", active: 'INTEGER NOT NULL DEFAULT 1', managed: 'INTEGER NOT NULL DEFAULT 0', description: "TEXT NOT NULL DEFAULT ''", website: "TEXT NOT NULL DEFAULT ''", phone: "TEXT NOT NULL DEFAULT ''" });
  addColumns('photos', { observed_at: 'TEXT', content_hash: 'TEXT' });
  addColumns('prices', { approved_at: 'TEXT', approved_by: 'TEXT REFERENCES users(id)', supersedes_id: 'TEXT REFERENCES prices(id)' });
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES stations(id), user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, source_url TEXT NOT NULL, category TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS geocoding_queries (id TEXT PRIMARY KEY, location_ids TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_routes (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), snapshot TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS traveler_states (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, snapshot TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photo_uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS photo_uploads_user ON photo_uploads(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS places_nearby ON stations(active,lat,lng);
    CREATE INDEX IF NOT EXISTS shares_expiry ON shared_routes(expires_at);
    CREATE INDEX IF NOT EXISTS photos_queue ON photos(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS photos_user ON photos(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS places_kind ON stations(active,kind,lat,lng);
    CREATE INDEX IF NOT EXISTS prices_queue ON prices(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS prices_current ON prices(station_id,status,fuel_type,custom_label,approved_at DESC);
    CREATE INDEX IF NOT EXISTS reports_queue ON reports(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS comments_queue ON comments(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS comments_place ON comments(place_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS moderation_target ON moderation_actions(target_type,target_id,created_at DESC);
    UPDATE users SET role='admin' WHERE role='moderator';
    UPDATE photos SET observed_at=created_at WHERE observed_at IS NULL;
  `);
  // Existing approvals remain valid; previously automatic publications must be reviewed.
  db.prepare(`UPDATE prices SET approved_by=(SELECT moderator_id FROM moderation_actions WHERE target_type='prices' AND target_id=prices.id AND action='approve' ORDER BY created_at DESC LIMIT 1),
    approved_at=(SELECT created_at FROM moderation_actions WHERE target_type='prices' AND target_id=prices.id AND action='approve' ORDER BY created_at DESC LIMIT 1)
    WHERE status='published' AND approved_by IS NULL`).run();
  db.prepare("UPDATE prices SET status='pending_review' WHERE status='published' AND approved_by IS NULL").run();
  db.prepare('INSERT OR IGNORE INTO photo_uploads SELECT id,user_id,created_at FROM photos WHERE created_at>?').run(new Date(Date.now() - 7 * 86400000).toISOString());
  return db;
}

export type FuelDatabase = ReturnType<typeof openDatabase>;
