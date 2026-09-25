import { database } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Share links stay visitable-as-expired for this long, then the row goes. */
const SHARE_GRACE_MS = 7 * DAY_MS;

/**
 * Daily housekeeping: drop share links that expired more than 7 days ago
 * (recently-expired ones still answer 410 so visitors see "expired", not
 * "missing") and dead session rows. Runs once at boot, then every 24h.
 */
export function runJanitorOnce(now = Date.now()): void {
  const db = database();
  const shares = db.prepare('DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at < ?')
    .run(now - SHARE_GRACE_MS);
  const sessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  if (shares.changes || sessions.changes) {
    console.log(`[cyan] janitor: removed ${shares.changes} expired share(s), ${sessions.changes} dead session(s)`);
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startJanitor(): void {
  runJanitorOnce();
  if (!timer) {
    timer = setInterval(() => {
      try { runJanitorOnce(); } catch (e) { console.error('[cyan] janitor failed:', e); }
    }, DAY_MS);
    timer.unref?.();
  }
}
