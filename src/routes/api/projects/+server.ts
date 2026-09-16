import { json } from '@sveltejs/kit';
import { listProjects, listThumbnails, saveProject, StoreError } from '$lib/server/userLibrary';

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;

export function GET({ locals }) {
  const user = locals.user!;
  return json({ projects: listProjects(user.id), thumbnails: listThumbnails(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST({ request, locals }) {
  const user = locals.user!;
  try {
    const data = await request.text();
    if (data.length > MAX_PROJECT_BYTES) {
      return json({ error: 'This plan is too large to store. Remove unused attachments or export it as JSON.' }, { status: 413 });
    }
    const parsed = JSON.parse(data);
    const id = parsed?.id;
    if (typeof id !== 'string' || !id) return json({ error: 'Invalid project.' }, { status: 400 });
    const revision = saveProject(user, id, data, null);
    return json({ id, revision }, { status: 201 });
  } catch (error) {
    if (error instanceof StoreError) return json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return json({ error: 'Invalid project.' }, { status: 400 });
    console.error('project create failed', error);
    return json({ error: 'Could not save to server storage. Download your project as JSON to keep a copy.' }, { status: 500 });
  }
}
