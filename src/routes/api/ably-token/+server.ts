import * as Ably from 'ably';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const capability = JSON.stringify({
	'room:rip-dc:messages:*': ['publish', 'subscribe', 'history'],
	'room:rip-dc:reactions:*': ['publish', 'subscribe'],
	'room:rip-dc:presence': ['publish', 'subscribe', 'presence'],
	'room:rip-dc:voice-signal': ['publish', 'subscribe']
});

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.ABLY_API_KEY;

	if (!apiKey) {
		return json({ error: 'Missing ABLY_API_KEY' }, { status: 500 });
	}

	try {
		const { clientId } = await request.json();

		if (!clientId || typeof clientId !== 'string') {
			return json({ error: 'Missing clientId' }, { status: 400 });
		}

		const rest = new Ably.Rest(apiKey);
		const tokenRequest = await rest.auth.createTokenRequest({
			clientId,
			capability,
			ttl: 60 * 60 * 1000
		});

		return json(tokenRequest);
	} catch (error: any) {
		console.error('Ably token request failed:', error);
		return json(
			{
				error: error?.message || 'Ably token request failed',
				code: error?.code || null,
				statusCode: error?.statusCode || 500
			},
			{ status: 500 }
		);
	}
};
