import { randomBytes } from 'node:crypto';
import { database } from './db';
import { hashPassword } from './auth';
import { passwordDigest } from '$lib/passwordDigest';

/**
 * MySQL-style initialization: ADMIN_USERNAME / ADMIN_PASSWORD are honoured
 * only while the database is brand-new (no users). Once any account exists,
 * the env pair is ignored entirely, so image upgrades or restarts can never
 * silently rotate an admin password back to the env value.
 *
 * With no env pair a fresh database still gets an admin named "admin" with a
 * generated password, printed once to the log — the deployment is never left
 * adminless. Recovery afterwards is `cli.mjs set-password`.
 */
export async function bootstrapAdmin(): Promise<void> {
  const db = database();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (count > 0) return;

  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const envPassword = process.env.ADMIN_PASSWORD;
  const password = envPassword?.length ? envPassword : randomBytes(9).toString('base64url');
  const digest = await passwordDigest(password);
  db.prepare('INSERT INTO users (id, username, pass_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(crypto.randomUUID(), username, hashPassword(digest), Date.now());
  if (envPassword?.length) {
    console.log(`[cyan] Created admin user "${username}"`);
  } else {
    console.log(`[cyan] Created admin user "${username}" with generated password: ${password}`);
  }
}
