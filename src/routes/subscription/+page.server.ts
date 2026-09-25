import { plansConfig, knownPlans } from '$lib/server/plans';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  plans: knownPlans().map((id) => ({ id, projectLimit: plansConfig()[id].projectLimit })),
});
