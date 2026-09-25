#!/usr/bin/env node
// CYAN Housing Planner — operator CLI. Self-contained: talks straight to the
// SQLite file so it works inside the container without touching app code.
//
//   node cli.mjs set-password <username> [--password <pw>] [--admin]
//   node cli.mjs list-users
//
//   docker exec -it <container> node cli.mjs set-password admin
//
// DATA_DIR points at the database folder (default ./data, /data in the image).
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const dbFile = join(process.env.DATA_DIR ?? './data', 'cyan-housing-planner.db');

function digestPassword(password) {
  // Same domain-separated digest the browser sends — see passwordDigest.ts.
  return createHash('sha256').update(`cyan-housing-planner:v1:${password}`).digest('hex');
}

function hashPassword(digest) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(digest, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt2$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key}`;
}

function openDb() {
  if (!existsSync(dbFile)) {
    console.error(`No database at ${dbFile} — start the server once first (or set DATA_DIR).`);
    process.exit(1);
  }
  const db = new DatabaseSync(dbFile);
  try {
    db.prepare('SELECT 1 FROM users LIMIT 1').get();
  } catch {
    console.error(`${dbFile} has no users table — is this a CYAN Housing Planner database?`);
    process.exit(1);
  }
  return db;
}

/** Read a password without echoing it (TTY mask), or from piped stdin. */
function readSecret() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (d) => (buf += d));
      process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
      process.stdin.on('error', reject);
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Mask typed characters; prompts go through process.stdout directly.
    rl._writeToOutput = () => {};
    process.stdout.write('New password: ');
    rl.question('', (first) => {
      process.stdout.write('\nRepeat password: ');
      rl.question('', (second) => {
        rl.close();
        process.stdout.write('\n');
        if (first !== second) reject(new Error('Passwords do not match.'));
        else resolve(first);
      });
    });
  });
}

async function setPassword(username, { password, admin }) {
  const db = openDb();
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE username = ?').get(username);
  if (!user) {
    console.error(`No such user: ${username}`);
    process.exit(1);
  }
  const pw = password ?? (await readSecret());
  if (pw.length < 8 || pw.length > 32) {
    console.error('Password must be 8–32 characters.');
    process.exit(1);
  }
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(digestPassword(pw)), user.id);
  // Force re-login everywhere — same semantics as an in-app password change.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  if (admin && !user.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    console.log(`Granted admin rights to "${user.username}".`);
  }
  console.log(`Password for "${user.username}" has been reset.`);
}

function listUsers() {
  const db = openDb();
  const rows = db.prepare('SELECT username, plan, is_admin, is_active FROM users ORDER BY created_at').all();
  for (const u of rows) {
    console.log(`${u.username}\t${u.plan}\t${u.is_admin ? 'admin' : 'user'}\t${u.is_active ? 'active' : 'deactivated'}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
const flags = { password: undefined, admin: false };
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--password') flags.password = args[++i];
  else if (args[i] === '--admin') flags.admin = true;
  else positional.push(args[i]);
}

try {
  if (cmd === 'set-password' && positional.length === 1) {
    await setPassword(positional[0], flags);
  } else if (cmd === 'list-users') {
    listUsers();
  } else {
    console.log(`Usage:
  node cli.mjs set-password <username> [--password <pw>] [--admin]
  node cli.mjs list-users`);
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
