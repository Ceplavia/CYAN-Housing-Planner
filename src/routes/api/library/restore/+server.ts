import { json } from '@sveltejs/kit';
import { restoreLibrary, StoreError } from '$lib/server/userLibrary';

export async function POST({ request, locals, url }) {
  try {
    const raw = await request.text();
    return json(await restoreLibrary(locals.user!, raw, url.searchParams.get('suffix') || undefined), { status: 201 });
  } catch (error) {
    if (error instanceof StoreError) return json({ error: error.message }, { status: error.status });
    return json({ error: error instanceof Error ? error.message : 'Could not read this backup.' }, { status: 400 });
  }
}
