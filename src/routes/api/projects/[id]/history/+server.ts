import { json } from '@sveltejs/kit';
import { getHistory, setHistory } from '$lib/server/userLibrary';

const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

export function GET({ params, locals }) {
  return json({ data: getHistory(locals.user!.id, params.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT({ request, params, locals }) {
  const body = await request.json().catch(() => null);
  const data = body?.data;
  if (data !== null && typeof data !== 'string') return json({ error: 'Invalid history.' }, { status: 400 });
  if (typeof data === 'string' && data.length > MAX_HISTORY_BYTES) {
    return json({ error: 'These attachments would make saved versions too large to reopen. Export a backup, then use smaller files or remove unused attachments.' }, { status: 413 });
  }
  setHistory(locals.user!.id, params.id, data);
  return json({ ok: true });
}

export function DELETE({ params, locals }) {
  setHistory(locals.user!.id, params.id, null);
  return json({ ok: true });
}
