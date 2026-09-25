import { database } from './db';
import { hashPassword } from './auth';
import { passwordDigest } from '$lib/passwordDigest';

/**
 * Admin seeding and credential sync: whenever ADMIN_USERNAME / ADMIN_PASSWORD
 * are set, the named account exists as an admin whose password matches the
 * env value — created if missing, rotated if the stored hash predates the
 * current credential scheme. The env pair doubles as the admin password
 * recovery path; remove it after bootstrapping to stop future resets.
 */
export async function bootstrapAdmin(): Promise<void> {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  const db = database();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
  const digest = await passwordDigest(password);
  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1, pass_hash = ? WHERE id = ?').run(hashPassword(digest), existing.id);
    console.log(`[cyan] Synced admin user "${username}"`);
    return;
  }
  db.prepare('INSERT INTO users (id, username, pass_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(crypto.randomUUID(), username, hashPassword(digest), Date.now());
  console.log(`[cyan] Created admin user "${username}"`);
}
