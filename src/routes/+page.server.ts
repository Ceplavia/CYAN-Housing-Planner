import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Signed-in users land on the dashboard; anonymous visitors see the
// product landing page.
export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(303, '/dashboard');
};
