import { json } from '@sveltejs/kit';
import { ConflictError, deleteProject, getProject, saveProject, StoreError } from '$lib/server/userLibrary';

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

export function GET({ params, locals }) {
  const row = getProject(locals.user!.id, params.id);
  if (!row) return json({ error: 'Not found.' }, { status: 404 });
  return json(row, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT({ request, params, locals }) {
  const user = locals.user!;
  try {
    const body = await request.json();
    const data = body?.data;
    const baseRevision = body?.baseRevision;
    if (typeof data !== 'string' || !Number.isInteger(baseRevision)) {
      return json({ error: 'Invalid project.' }, { status: 400 });
    }
    if (data.length > MAX_PROJECT_BYTES) {
      return json({ error: 'This plan is too large to store. Remove unused attachments or export it as JSON.' }, { status: 413 });
    }
    const parsed = JSON.parse(data);
    if (parsed?.id !== params.id) {
      return json({ error: 'The saved project ID does not match its library entry. Download a library backup before recovery.' }, { status: 400 });
    }
    return json({ revision: saveProject(user, params.id, data, baseRevision) });
  } catch (error) {
    if (error instanceof ConflictError) return json({ error: error.message }, { status: 409 });
    if (error instanceof StoreError) return json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return json({ error: 'Invalid project.' }, { status: 400 });
    console.error('project save failed', error);
    return json({ error: 'Could not save to server storage. Download your project as JSON to keep a copy.' }, { status: 500 });
  }
}

export function DELETE({ params, locals }) {
  deleteProject(locals.user!.id, params.id);
  return json({ ok: true });
}
