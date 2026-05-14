import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function defaultDataRoot() {
  const env = process.env.CONTENT_PACK_DATA_DIR?.trim()
  if (env) return path.resolve(env)
  return path.resolve(__dirname, '..', '..', 'data', 'content-packs')
}

export function defaultDbPath() {
  const env = process.env.CONTENT_PACK_DB_PATH?.trim()
  if (env) return path.resolve(env)
  return path.resolve(defaultDataRoot(), 'content-packs.sqlite')
}

let _db

/**
 * @returns {import('better-sqlite3').Database}
 */
export function getContentPackDb() {
  if (_db) return _db
  const dbPath = defaultDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS content_pack (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      current_revision INTEGER NOT NULL DEFAULT 1,
      csv_member_path TEXT NOT NULL,
      header_json TEXT NOT NULL,
      line_ending TEXT NOT NULL DEFAULT X'0A',
      primary_route_number TEXT
    );

    CREATE TABLE IF NOT EXISTS content_pack_waypoint (
      pack_id TEXT NOT NULL,
      row_order INTEGER NOT NULL,
      cells_json TEXT NOT NULL,
      PRIMARY KEY (pack_id, row_order),
      FOREIGN KEY (pack_id) REFERENCES content_pack(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS content_pack_revision (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      rev INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      apply_summary_json TEXT,
      UNIQUE (pack_id, rev),
      FOREIGN KEY (pack_id) REFERENCES content_pack(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pack_waypoint_pack ON content_pack_waypoint(pack_id);
    CREATE INDEX IF NOT EXISTS idx_revision_pack ON content_pack_revision(pack_id);
  `)

  // Idempotent migrations for databases that pre-date a column. SQLite has no
  // `ADD COLUMN IF NOT EXISTS`, so we sniff `PRAGMA table_info` first.
  const cols = _db.prepare('PRAGMA table_info(content_pack)').all()
  if (!cols.some((c) => c.name === 'primary_route_number')) {
    _db.exec('ALTER TABLE content_pack ADD COLUMN primary_route_number TEXT')
  }
  return _db
}
