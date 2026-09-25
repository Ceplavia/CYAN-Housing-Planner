import { redirect } from '@sveltejs/kit';
import { knownPlans } from '$lib/server/plans';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) throw redirect(303, '/');
  if (!locals.user.isAdmin) throw redirect(303, '/dashboard');
  return { plans: knownPlans() };
};
