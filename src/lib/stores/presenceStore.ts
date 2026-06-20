import { writable, derived } from 'svelte/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';

export interface PresenceState {
	userId: string;
	username: string;
	avatar: string;
	status: 'online' | 'idle' | 'dnd' | 'offline';
	serverId: string;
	channel: string;
}

export const onlineUsers = writable<PresenceState[]>([]);
export const typingUsers = writable<Record<string, string[]>>({});

let presenceChannel: RealtimeChannel | null = null;
let typingChannel: RealtimeChannel | null = null;

export function subscribeToPresence(userId: string) {
	presenceChannel = supabase.channel(`presence:${userId}`, {
		config: { presence: { key: userId } }
	});

	presenceChannel
		.on('presence', { event: 'sync' }, () => {
			const state = presenceChannel?.presenceState() || {};
			const users: PresenceState[] = [];
			for (const key in state) {
				const presences = state[key] as any[];
				if (presences.length > 0) {
					users.push(presences[0]);
				}
			}
			onlineUsers.set(users);
		})
		.subscribe(async (status) => {
			if (status === 'subscribed') {
				await presenceChannel?.track({
					userId,
					username: '',
					avatar: '',
					status: 'online',
					serverId: '',
					channel: ''
				});
			}
		});

	typingChannel = supabase.channel(`typing:${userId}`);

	typingChannel
		.on('broadcast', { event: 'typing' }, (payload) => {
			typingUsers.update((prev) => {
				const ch = payload.channel as string;
				if (!prev[ch]) prev[ch] = [];
				if (payload.isTyping) {
					if (!prev[ch].includes(payload.username as string)) {
						prev[ch] = [...prev[ch], payload.username as string];
					}
				} else {
					prev[ch] = prev[ch].filter((u) => u !== payload.username);
				}
				return prev;
			});
		})
		.subscribe();
}

export function updatePresence(updates: Partial<PresenceState>) {
	if (presenceChannel) {
		presenceChannel.track(updates);
	}
}

export function emitTyping(channel: string, username: string, isTyping: boolean) {
	if (typingChannel) {
		typingChannel.send({
			type: 'broadcast',
			event: 'typing',
			payload: { channel, username, isTyping }
		});
	}
}

export function unsubscribeFromPresence() {
	if (presenceChannel) {
		presenceChannel.unsubscribe();
		presenceChannel = null;
	}
	if (typingChannel) {
		typingChannel.unsubscribe();
		typingChannel = null;
	}
}
