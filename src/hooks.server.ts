import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.safeGetSession = async () => ({ session: null, user: null });
	return resolve(event);
};
