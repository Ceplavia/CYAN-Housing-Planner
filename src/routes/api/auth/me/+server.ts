import { json } from '@sveltejs/kit';
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
