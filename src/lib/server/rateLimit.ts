/** Cheap in-process per-key per-minute counter — enough for a self-hosted box. */
const buckets = new Map<string, { minute: number; count: number }>();

export function rateLimited(key: string, limit: number): boolean {
  if (process.env.AUTH_RATE_LIMIT === '0') return false; // tests
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = buckets.get(key);
  if (!bucket || bucket.minute !== minute) {
    buckets.set(key, { minute, count: 1 });
    return false;
  }
  return ++bucket.count > limit;
}
