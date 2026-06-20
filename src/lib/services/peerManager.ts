import Peer, { type MediaConnection } from 'peerjs';
import { voiceState } from '$lib/stores/voiceStore';
import { get } from 'svelte/store';

type PeerEventCallback = {
	onStream?: (peerId: string, stream: MediaStream) => void;
	onUserVideo?: (peerId: string) => void;
};

class PeerManager {
	private peer: Peer | null = null;
	private connections: Map<string, RTCPeerConnection | MediaConnection> = new Map();
	private eventCallback: PeerEventCallback = {};
	private initPromise: Promise<string> | null = null;

	getPeerId(): string | null {
		return this.peer?.id || null;
	}

	async initialize(): Promise<string> {
		if (this.peer?.id) {
			return this.peer.id;
		}

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = new Promise((resolve, reject) => {
			const configuredHost = import.meta.env.PUBLIC_PEERJS_HOST;
			const isLocalhost =
				typeof window !== 'undefined' &&
				['localhost', '127.0.0.1'].includes(window.location.hostname);

			if (!configuredHost && !isLocalhost) {
				this.initPromise = null;
				reject(new Error('Missing PUBLIC_PEERJS_HOST for non-local environment'));
				return;
			}

			const host = configuredHost || 'localhost';
			const secure = import.meta.env.PUBLIC_PEERJS_SECURE === 'true' || (!isLocalhost && !import.meta.env.PUBLIC_PEERJS_SECURE);
			const port = parseInt(import.meta.env.PUBLIC_PEERJS_PORT || (secure ? '443' : '9001'));
			const path = import.meta.env.PUBLIC_PEERJS_PATH || '/peerjs';

			this.peer = new Peer({
				host,
				port,
				path,
				secure
			});

			this.peer.on('open', (id) => {
				this.initPromise = null;
				resolve(id);
			});

			this.peer.on('call', (call) => {
				const stream = get(voiceState).localStream;
				if (stream) {
					call.answer(stream);
					call.on('stream', (remoteStream) => {
						this.eventCallback.onStream?.(call.peer, remoteStream);
					});
				}
			});

			this.peer.on('error', (err) => {
				console.error('PeerJS error:', err);
				this.initPromise = null;
				reject(err);
			});
		});
		return this.initPromise;
	}

	callPeer(remotePeerId: string) {
		if (this.connections.has(remotePeerId)) return;
		const stream = get(voiceState).localStream;
		if (!stream || !this.peer) return;

		try {
			const call = this.peer.call(remotePeerId, stream);
			this.connections.set(remotePeerId, call);

			call.on('stream', (remoteStream) => {
				this.eventCallback.onStream?.(remotePeerId, remoteStream);
			});

			call.on('close', () => {
				this.connections.delete(remotePeerId);
			});
		} catch (e) {
			console.error('Failed to call peer:', e);
		}
	}

	resetConnections() {
		this.connections.forEach((conn) => {
			if ('close' in conn && typeof conn.close === 'function') {
				conn.close();
			}
		});
		this.connections.clear();
	}

	onEvent(cb: PeerEventCallback) {
		this.eventCallback = cb;
	}

	destroy() {
		this.resetConnections();
		if (this.peer) {
			this.peer.destroy();
			this.peer = null;
		}
		this.initPromise = null;
	}
}

export const peerManager = new PeerManager();
