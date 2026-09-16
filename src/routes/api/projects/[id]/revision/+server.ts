import { json } from '@sveltejs/kit';
import { getProjectRevision } from '$lib/server/userLibrary';

export function GET({ params, locals }) {
  return json({ revision: getProjectRevision(locals.user!.id, params.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
