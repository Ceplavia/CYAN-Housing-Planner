import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Self-hosted storage: one SQLite file per deployment. DATA_DIR lets Docker
 * users point at a mounted volume; the default keeps data beside the app.
 */
let db: DatabaseSync | undefined;

export function database(): DatabaseSync {
  if (!db) {
    const dir = process.env.DATA_DIR || 'data';
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(join(dir, 'cyan-housing-planner.db'));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    // Fresh databases never had user_version set; v1 databases also report 0.
    // Key off table existence instead of the pragma so both paths converge.
    const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get() !== undefined;
    if (!hasUsers) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          pass_hash TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free',
          plan_expires_at INTEGER,
          bonus_projects INTEGER NOT NULL DEFAULT 0,
          is_admin INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          inactive_reason TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS thumbnails (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (user_id, project_id)
        );
        CREATE TABLE IF NOT EXISTS history (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (user_id, project_id)
        );
        CREATE TABLE IF NOT EXISTS recovery (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS shares (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          password TEXT,
          expires_at INTEGER,
          created_at INTEGER NOT NULL,
          UNIQUE (user_id, project_id),
          FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE CASCADE
        );
      `);
    } else {
      // v1 → v2: plan/bonus quota model, activation flag, admin flag. Column
      // checks keep the migration idempotent if a run is interrupted midway.
      const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name));
      if (!columns.has('bonus_projects')) db.exec('ALTER TABLE users ADD COLUMN bonus_projects INTEGER NOT NULL DEFAULT 0');
      if (!columns.has('is_admin')) db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
      if (!columns.has('is_active')) db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
      if (!columns.has('inactive_reason')) db.exec('ALTER TABLE users ADD COLUMN inactive_reason TEXT');
      if (columns.has('project_limit')) db.exec('ALTER TABLE users DROP COLUMN project_limit');
    }
    // v2 → v3: per-project share links. One row per project, revocable,
    // optionally password-protected, dying with the project via cascade.
    const hasShares = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shares'").get() !== undefined;
    if (!hasShares) {
      db.exec(`
        CREATE TABLE shares (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          password TEXT,
          expires_at INTEGER,
          created_at INTEGER NOT NULL,
          UNIQUE (user_id, project_id),
          FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE CASCADE
        );
      `);
    }
    // v3 → v4: paid-plan expiry. Idempotent column check covers both the
    // migrated and fresh-install paths.
    const ucols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name));
    if (!ucols.has('plan_expires_at')) db.exec('ALTER TABLE users ADD COLUMN plan_expires_at INTEGER');
    db.exec('PRAGMA user_version = 4');
  }
  return db;
}

/** Test helper: point subsequent connections at a different database. */
export function resetDatabaseForTests() {
  db?.close();
  db = undefined;
}
