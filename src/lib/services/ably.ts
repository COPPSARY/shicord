import * as Ably from 'ably';

let client: Ably.Realtime | null = null;
let currentClientId = '';

const MESSAGE_PREFIX = 'room:rip-dc:messages:';
const ROOM_REACTION_PREFIX = 'room:rip-dc:reactions:';
const PRESENCE_CHANNEL = 'room:rip-dc:presence';
const VOICE_SIGNAL_CHANNEL = 'room:rip-dc:voice-signal';

function ensureBrowser() {
	if (typeof window === 'undefined') {
		throw new Error('Ably client can only be created in the browser');
	}
}

export async function getAblyClient(clientId: string) {
	ensureBrowser();

	if (client && currentClientId === clientId) {
		return client;
	}

	if (client) {
		client.close();
		client = null;
	}

	currentClientId = clientId;
	client = new Ably.Realtime({
		authCallback: async (_params, callback) => {
			try {
				const response = await fetch('/api/ably-token', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ clientId })
				});

				if (!response.ok) {
					const body = await response.json().catch(() => null);
					throw new Error(body?.error || `Ably token request failed: ${response.status}`);
				}

				callback(null, await response.json());
			} catch (error) {
				callback(error as Error, null);
			}
		},
		clientId,
		echoMessages: false
	});

	await client.connection.once('connected');
	return client;
}

export function getCurrentAblyClient() {
	return client;
}

export function getMessageChannelName(channelName: string) {
	return `${MESSAGE_PREFIX}${channelName}`;
}

export async function getMessageChannel(clientId: string, channelName: string) {
	const realtime = await getAblyClient(clientId);
	return realtime.channels.get(getMessageChannelName(channelName));
}

export async function getRoomReactionChannel(clientId: string, channelName: string) {
	const realtime = await getAblyClient(clientId);
	return realtime.channels.get(`${ROOM_REACTION_PREFIX}${channelName}`);
}

export async function getPresenceChannel(clientId: string) {
	const realtime = await getAblyClient(clientId);
	return realtime.channels.get(PRESENCE_CHANNEL);
}

export async function getVoiceSignalChannel(clientId: string) {
	const realtime = await getAblyClient(clientId);
	return realtime.channels.get(VOICE_SIGNAL_CHANNEL);
}

export function closeAblyClient() {
	client?.close();
	client = null;
	currentClientId = '';
}
