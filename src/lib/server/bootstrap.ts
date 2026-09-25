import { database } from './db';
import { hashPassword } from './auth';

/**
 * Docker-friendly admin seeding: when the database has no admin at all and
 * both ADMIN_USERNAME / ADMIN_PASSWORD are set, grant admin to that user —
 * creating the account if needed. Runs once at server start; the env vars are
 * ignored as soon as any admin exists, so they can stay in the compose file.
 */
export function bootstrapAdmin(): void {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  const db = database();
  if (db.prepare('SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1').get()) return;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
    console.log(`[cyan] Granted admin to existing user "${username}"`);
    return;
  }
  db.prepare('INSERT INTO users (id, username, pass_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(crypto.randomUUID(), username, hashPassword(password), Date.now());
  console.log(`[cyan] Created admin user "${username}"`);
}
