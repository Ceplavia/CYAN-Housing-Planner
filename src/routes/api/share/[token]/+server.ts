import { json } from '@sveltejs/kit';
import { rateLimited } from '$lib/server/rateLimit';
import { resolveShare, type ShareAccess } from '$lib/server/shares';

function respond(result: ShareAccess) {
  switch (result.status) {
    case 'ok':
      return json({ project: result.project, name: result.name, owner: result.owner },
        { headers: { 'Cache-Control': 'no-store' } });
    case 'password':
      return json({ error: 'share.passwordRequired' }, { status: 401 });
    case 'expired':
      return json({ error: 'share.expired' }, { status: 410 });
    case 'missing':
      return json({ error: 'share.missing' }, { status: 404 });
  }
}

/** Unauthenticated read — the token is the capability. */
export function GET({ params }) {
  return respond(resolveShare(params.token));
}

export async function POST({ params, request, getClientAddress }) {
  if (rateLimited(`share:${getClientAddress()}`, 30)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  return respond(resolveShare(params.token, String(body?.password ?? '')));
}
