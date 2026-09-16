// SSR enabled (Firebase App Hosting)
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthUser } from '$lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: AuthUser | null;
		}
		interface PageData {
			user?: AuthUser | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
