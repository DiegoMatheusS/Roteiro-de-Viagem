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
  return db;
}

export type FuelDatabase = ReturnType<typeof openDatabase>;
