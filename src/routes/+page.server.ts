import type { PageServerLoad } from './$types';

// The landing page is public for everyone — signed-in users see it too
// (their header swaps to the account menu; CTAs point at the dashboard).
export const load: PageServerLoad = () => {};
