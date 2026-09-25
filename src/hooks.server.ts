import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, sessionUser } from '$lib/server/auth';
import { bootstrapAdmin } from '$lib/server/bootstrap';

bootstrapAdmin();

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = sessionUser(event.cookies.get(SESSION_COOKIE));

  // Account APIs are per-user; page routes check the session in their own
  // handlers so an anonymous visitor can still load the app shell.
  if (event.url.pathname.startsWith('/api/projects') || event.url.pathname.startsWith('/api/library')) {
    if (!event.locals.user) {
      return new Response(JSON.stringify({ error: 'Sign in to save and load your floor plans.' }), {
        status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }
  return resolve(event);
};
