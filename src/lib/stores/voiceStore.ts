import { writable, derived } from 'svelte/store';

export interface VoiceParticipant {
	socketId: string;
	username: string;
	peerId: string | null;
	muted: boolean;
	deafened: boolean;
	camera: boolean;
	screenShare: boolean;
}

export interface VoiceState {
	active: boolean;
	channelName: string;
	serverId: string;
	participants: VoiceParticipant[];
	localStream: MediaStream | null;
	peerId: string | null;
	audioMuted: boolean;
	deafened: boolean;
	videoActive: boolean;
	screenActive: boolean;
}

function createVoiceStore() {
	const { subscribe, set, update } = writable<VoiceState>({
		active: false,
		channelName: '',
		serverId: '',
		participants: [],
		localStream: null,
		peerId: null,
		audioMuted: false,
		deafened: false,
		videoActive: false,
		screenActive: false
	});

	return {
		subscribe,
		join(channelName: string, serverId: string, peerId: string) {
			update((s) => ({
				...s,
				active: true,
				channelName,
				serverId,
				peerId,
				audioMuted: false,
				deafened: false
			}));
		},
		leave() {
			update((s) => {
				if (s.localStream) {
					s.localStream.getTracks().forEach((t) => t.stop());
				}
				return {
					active: false,
					channelName: '',
					serverId: '',
					participants: [],
					localStream: null,
					peerId: null,
					audioMuted: false,
					deafened: false,
					videoActive: false,
					screenActive: false
				};
			});
		},
		setLocalStream(stream: MediaStream) {
			update((s) => ({ ...s, localStream: stream }));
		},
		setParticipants(participants: VoiceParticipant[]) {
			update((s) => ({ ...s, participants }));
		},
		toggleMute() {
			update((s) => {
				const newMuted = !s.audioMuted;
				if (s.localStream) {
					s.localStream.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
				}
				return { ...s, audioMuted: newMuted };
			});
		},
		toggleDeafen() {
			update((s) => {
				const newDeafened = !s.deafened;
				return { ...s, deafened: newDeafened };
			});
		},
		async toggleVideo() {
			update((s) => {
				if (s.videoActive) {
					if (s.localStream) {
						s.localStream.getVideoTracks().forEach((t) => {
							t.stop();
							s.localStream?.removeTrack(t);
						});
					}
					return { ...s, videoActive: false };
				}
				return { ...s, videoActive: true };
			});
		},
		async toggleScreenShare() {
			update((s) => {
				if (s.screenActive) {
					return { ...s, screenActive: false };
				}
				return { ...s, screenActive: true };
			});
		}
	};
}

export const voiceState = createVoiceStore();

export const voiceActive = derived(voiceState, ($v) => $v.active);
export const voiceParticipants = derived(voiceState, ($v) => $v.participants);
