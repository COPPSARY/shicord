import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	const domain = env.METERED_DOMAIN;
	const apiKey = env.METERED_API_KEY;

	if (!domain || !apiKey) {
		return json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
	}

	try {
		// ponytail: this Metered account already supports the apiKey credentials endpoint; use that and stop branching.
		const response = await fetch(
			`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey as string)}`
		);
		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Metered credentials failed: ${response.status} ${text}`);
		}

		const iceServers = await response.json();
		return json({ iceServers });
	} catch (error) {
		console.warn('Failed to fetch TURN credentials, falling back to public STUN:', error);
		return json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
	}
};
