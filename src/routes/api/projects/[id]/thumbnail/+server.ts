import { json } from '@sveltejs/kit';
import { saveThumbnail } from '$lib/server/userLibrary';

export async function PUT({ request, params, locals }) {
  const body = await request.json().catch(() => null);
  if (typeof body?.dataUrl === 'string' && body.dataUrl.length < 4 * 1024 * 1024) {
    saveThumbnail(locals.user!.id, params.id, body.dataUrl);
  }
  return json({ ok: true });
}
