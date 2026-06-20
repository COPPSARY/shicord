import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';
import { voiceState } from '$lib/stores/voiceStore';
import { get } from 'svelte/store';

export interface ChatMessage {
	id?: string;
	server_id?: string;
	channel_name?: string;
	dm_conv_id?: string;
	sender_id?: string;
	username: string;
	text: string;
	msg_type: string;
	media_data?: string | null;
	reply_to?: any;
	edited?: boolean;
	reactions?: Record<string, string[]>;
	avatar?: string;
	name_color?: string;
	badge?: string;
	created_at?: string;
}

export interface VoiceSignal {
	type:
		| 'voice-join'
		| 'voice-leave'
		| 'voice-mute'
		| 'voice-deafen'
		| 'voice-camera'
		| 'voice-screen'
		| 'signal';
	userId: string;
	username: string;
	serverId: string;
	channelName: string;
	peerId?: string;
	muted?: boolean;
	deafened?: boolean;
	camera?: boolean;
	screen?: boolean;
	signal?: any;
	targetUserId?: string;
}

type MessageCallback = (msg: ChatMessage) => void;
type SignalCallback = (signal: VoiceSignal) => void;
type PresenceCallback = (users: any[]) => void;

class SupabaseRealtimeService {
	private channels: Map<string, RealtimeChannel> = new Map();
	private messageCallbacks: Map<string, MessageCallback[]> = new Map();
	private signalCallbacks: Map<string, SignalCallback[]> = new Map();
	private presenceCallbacks: Map<string, PresenceCallback[]> = new Map();

	subscribeToMessages(
		serverId: string,
		channelName: string,
		callback: MessageCallback
	): () => void {
		const key = `messages:${serverId}:${channelName}`;
		if (!this.messageCallbacks.has(key)) {
			this.messageCallbacks.set(key, []);
		}
		this.messageCallbacks.get(key)!.push(callback);

		if (!this.channels.has(key)) {
			const ch = supabase
				.channel(key)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `server_id=eq.${serverId} AND channel_name=eq.${channelName}`
					},
					(payload: RealtimePostgresChangesPayload<ChatMessage>) => {
						const msg = payload.new as ChatMessage;
						this.messageCallbacks.get(key)?.forEach((cb) => cb(msg));
					}
				)
				.subscribe();
			this.channels.set(key, ch);
		}

		return () => {
			const cbs = this.messageCallbacks.get(key);
			if (cbs) {
				const idx = cbs.indexOf(callback);
				if (idx > -1) cbs.splice(idx, 1);
				if (cbs.length === 0) {
					const ch = this.channels.get(key);
					if (ch) supabase.removeChannel(ch);
					this.channels.delete(key);
					this.messageCallbacks.delete(key);
				}
			}
		};
	}

	subscribeToDM(dmConvId: string, callback: MessageCallback): () => void {
		const key = `dm:${dmConvId}`;
		if (!this.messageCallbacks.has(key)) {
			this.messageCallbacks.set(key, []);
		}
		this.messageCallbacks.get(key)!.push(callback);

		if (!this.channels.has(key)) {
			const ch = supabase
				.channel(key)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `dm_conv_id=eq.${dmConvId}`
					},
					(payload: RealtimePostgresChangesPayload<ChatMessage>) => {
						const msg = payload.new as ChatMessage;
						this.messageCallbacks.get(key)?.forEach((cb) => cb(msg));
					}
				)
				.subscribe();
			this.channels.set(key, ch);
		}

		return () => {
			const cbs = this.messageCallbacks.get(key);
			if (cbs) {
				const idx = cbs.indexOf(callback);
				if (idx > -1) cbs.splice(idx, 1);
				if (cbs.length === 0) {
					const ch = this.channels.get(key);
					if (ch) supabase.removeChannel(ch);
					this.channels.delete(key);
					this.messageCallbacks.delete(key);
				}
			}
		};
	}

	subscribeToVoiceSignals(serverId: string, callback: SignalCallback): () => void {
		const key = `voice:${serverId}`;
		if (!this.signalCallbacks.has(key)) {
			this.signalCallbacks.set(key, []);
		}
		this.signalCallbacks.get(key)!.push(callback);

		if (!this.channels.has(key)) {
			const ch = supabase.channel(key, {
				config: { broadcast: { self: true } }
			});

			ch.on('broadcast', { event: 'voice-signal' }, (payload) => {
				this.signalCallbacks.get(key)?.forEach((cb) => cb(payload.payload as VoiceSignal));
			});

			ch.subscribe();
			this.channels.set(key, ch);
		}

		return () => {
			const cbs = this.signalCallbacks.get(key);
			if (cbs) {
				const idx = cbs.indexOf(callback);
				if (idx > -1) cbs.splice(idx, 1);
				if (cbs.length === 0) {
					const ch = this.channels.get(key);
					if (ch) supabase.removeChannel(ch);
					this.channels.delete(key);
					this.signalCallbacks.delete(key);
				}
			}
		};
	}

	async sendVoiceSignal(signal: VoiceSignal) {
		const key = `voice:${signal.serverId}`;
		let ch = this.channels.get(key);
		if (!ch) {
			ch = supabase.channel(key, {
				config: { broadcast: { self: true } }
			});
			ch.subscribe();
			this.channels.set(key, ch);
		}
		await ch.send({
			type: 'broadcast',
			event: 'voice-signal',
			payload: signal
		});
	}

	subscribeToPresence(
		serverId: string,
		callback: PresenceCallback,
		userInfo?: { userId: string; username: string; avatar?: string }
	): () => void {
		const key = `presence:${serverId}`;
		if (!this.presenceCallbacks.has(key)) {
			this.presenceCallbacks.set(key, []);
		}
		this.presenceCallbacks.get(key)!.push(callback);

		if (!this.channels.has(key)) {
			const presenceKey = userInfo?.userId || serverId;
			const ch = supabase.channel(key, {
				config: { presence: { key: presenceKey } }
			});

			ch.on('presence', { event: 'sync' }, () => {
				const state = ch.presenceState();
				const users: any[] = [];
				for (const k in state) {
					const presences = state[k] as any[];
					if (presences.length > 0) {
						users.push(presences[0]);
					}
				}
				this.presenceCallbacks.get(key)?.forEach((cb) => cb(users));
			});

			ch.subscribe(async (status, err) => {
				console.log('presence subscribe:', key, status, err);
				if (status === 'SUBSCRIBED' && userInfo) {
					await ch.track({
						userId: userInfo.userId,
						username: userInfo.username,
						avatar: userInfo.avatar || '',
						status: 'online',
						serverId
					});
				}
			});
			this.channels.set(key, ch);
		} else if (userInfo) {
			const ch = this.channels.get(key)!;
			ch.track({
				userId: userInfo.userId,
				username: userInfo.username,
				avatar: userInfo.avatar || '',
				status: 'online',
				serverId
			});
		}

		return () => {
			const cbs = this.presenceCallbacks.get(key);
			if (cbs) {
				const idx = cbs.indexOf(callback);
				if (idx > -1) cbs.splice(idx, 1);
				if (cbs.length === 0) {
					const ch = this.channels.get(key);
					if (ch) {
						supabase.removeChannel(ch);
					}
					this.channels.delete(key);
					this.presenceCallbacks.delete(key);
				}
			}
		};
	}

	async trackPresence(serverId: string, state: any) {
		const key = `presence:${serverId}`;
		const ch = this.channels.get(key);
		if (ch) {
			await ch.track(state);
		}
	}

	async untrackPresence(serverId: string) {
		const key = `presence:${serverId}`;
		const ch = this.channels.get(key);
		if (ch) {
			await ch.untrack();
		}
	}

	unsubscribeAll() {
		this.channels.forEach((ch) => supabase.removeChannel(ch));
		this.channels.clear();
		this.messageCallbacks.clear();
		this.signalCallbacks.clear();
		this.presenceCallbacks.clear();
	}
}

export const realtimeService = new SupabaseRealtimeService();
