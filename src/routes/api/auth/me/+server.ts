import { json } from '@sveltejs/kit';
import { deleteUser } from '$lib/server/auth';
import { projectCount, projectLimit } from '$lib/server/userLibrary';

export function GET({ locals }) {
  const user = locals.user;
  if (!user) return json({ user: null });
  return json({
    user: {
      username: user.username,
      plan: user.plan,
      projectCount: projectCount(user.id),
      projectLimit: projectLimit(user),
    },
  });
}

export function DELETE({ locals, cookies }) {
  if (!locals.user) return json({ error: 'Not signed in.' }, { status: 401 });
  deleteUser(locals.user.id); // user row cascades to sessions, projects, history, thumbnails, recovery
  cookies.delete('cyan_session', { path: '/' });
  return json({ ok: true });
}
