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
    -- The same traveler account may have an admin role, but Google sessions never authorize administration.
    -- A separate per-session marker avoids changing existing session records or permissions.
    CREATE TABLE IF NOT EXISTS google_traveler_sessions (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE);
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
  addColumns('users', { blocked_at: 'TEXT', deleted_at: 'TEXT', google_sub: 'TEXT' });
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;');
  addColumns('stations', { kind: "TEXT NOT NULL DEFAULT 'fuel'", active: 'INTEGER NOT NULL DEFAULT 1', managed: 'INTEGER NOT NULL DEFAULT 0', description: "TEXT NOT NULL DEFAULT ''", website: "TEXT NOT NULL DEFAULT ''", phone: "TEXT NOT NULL DEFAULT ''" });
  addColumns('photos', { observed_at: 'TEXT', content_hash: 'TEXT' });
  addColumns('prices', { approved_at: 'TEXT', approved_by: 'TEXT REFERENCES users(id)', supersedes_id: 'TEXT REFERENCES prices(id)' });
  db.exec(`
    CREATE TABLE IF NOT EXISTS road_alerts (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK(kind IN ('pothole','broken_vehicle','accident','speed_camera','road_obstruction','flooded_road','police_presence','robbery')),
      lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90), lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
      note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL, reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS road_alerts_geo ON road_alerts(status,expires_at,lat,lng);
    CREATE INDEX IF NOT EXISTS road_alerts_user ON road_alerts(user_id,created_at);
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES stations(id), user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS place_ratings (
      place_id TEXT NOT NULL REFERENCES stations(id), user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), updated_at TEXT NOT NULL,
      PRIMARY KEY(place_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS place_feedback_mail (
      id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id),
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL, request_hash TEXT NOT NULL,
      subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
      sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS place_feedback_mail_pending ON place_feedback_mail(sent_at,next_attempt_at);
    CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, source_url TEXT NOT NULL, category TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS geocoding_queries (id TEXT PRIMARY KEY, location_ids TEXT NOT NULL, updated_at TEXT NOT NULL);
    -- Public POIs continue in locations/stations. Personal selections must not enter the shared search index.
    CREATE TABLE IF NOT EXISTS user_saved_locations (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
      lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),
      lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
      source_url TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
      saved_at TEXT NOT NULL,
      PRIMARY KEY(user_id,location_id)
    );
    CREATE INDEX IF NOT EXISTS user_saved_locations_recent ON user_saved_locations(user_id,saved_at DESC);
    -- Private per-account cache: includes precise GPS origins, never shared across accounts.
    CREATE TABLE IF NOT EXISTS user_route_cache (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cache_key TEXT NOT NULL, result_json TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(user_id,cache_key)
    );
    CREATE INDEX IF NOT EXISTS user_route_cache_age ON user_route_cache(created_at);
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
  // SQLite não permite ampliar um CHECK em uma coluna existente. Preserva os relatos já armazenados.
  const alertSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='road_alerts'").get() as {sql:string}).sql;
  if (!alertSql.includes("'accident'")) {
    // Dropping the old table with FK enforcement enabled would cascade-delete
    // confirmation votes in road_alert_checks during an in-place upgrade.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE road_alerts_next (
          id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          kind TEXT NOT NULL CHECK(kind IN ('pothole','broken_vehicle','accident','speed_camera','road_obstruction','flooded_road','police_presence','robbery')),
          lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90), lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
          note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
          reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL, reviewed_at TEXT
        );
        INSERT INTO road_alerts_next SELECT * FROM road_alerts;
        DROP TABLE road_alerts;
        ALTER TABLE road_alerts_next RENAME TO road_alerts;
        CREATE INDEX road_alerts_geo ON road_alerts(status,expires_at,lat,lng);
        CREATE INDEX road_alerts_user ON road_alerts(user_id,created_at);
      `);
      if (db.prepare('PRAGMA foreign_key_check').all().length)
        throw new Error('Migração de alertas violou referências existentes.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
  // Somente uma confirmação por conta e ocorrência. Sem dados de GPS armazenados nos votos.
  db.exec(`
    CREATE TABLE IF NOT EXISTS road_alert_checks (
      alert_id TEXT NOT NULL REFERENCES road_alerts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      present INTEGER NOT NULL CHECK(present IN (0,1)),
      created_at TEXT NOT NULL,
      PRIMARY KEY(alert_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS road_alert_checks_alert ON road_alert_checks(alert_id,present);
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
