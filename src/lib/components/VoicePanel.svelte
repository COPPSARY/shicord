<script lang="ts">
	import { onMount } from 'svelte';
	import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from '@lucide/svelte';
	import { getPresenceChannel, getVoiceSignalChannel } from '$lib/services/ably';
	import { voiceState } from '$lib/stores/voiceStore';

	let rtcConfig = {
		iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as RTCIceServer[]
	};

	let voiceError = $state('');
	let voiceSignalChannel: any = null;
	let presenceChannel: any = null;
	let localUser = $state({
		userId: '',
		username: 'Guest',
		avatar: ''
	});
	let peerConnections = new Map<string, RTCPeerConnection>();
	let makingOffers = new Map<string, boolean>();
	let remoteAudioEls = new Map<string, HTMLAudioElement>();

	let vstate = $state({
		active: false,
		channelName: '',
		serverId: '',
		participants: [] as any[],
		localStream: null as MediaStream | null,
		peerId: null as string | null,
		audioMuted: false,
		deafened: false,
		videoActive: false,
		screenActive: false
	});

	onMount(() => {
		void loadIceServers();
		window.addEventListener('joinvoice', handleJoinVoice as EventListener);
		const unsub = voiceState.subscribe((s) => {
			vstate = s;
		});

		return () => {
			unsub();
			window.removeEventListener('joinvoice', handleJoinVoice as EventListener);
		};
	});

	async function loadIceServers() {
		try {
			const response = await fetch('/api/turn-credentials');
			if (!response.ok) return;
			const data = await response.json();
			if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
				rtcConfig = { iceServers: data.iceServers };
			}
		} catch (error) {
			console.error('Failed to load ICE servers:', error);
		}
	}

	function handleJoinVoice(e: CustomEvent) {
		const { channelName, userId, username, avatar } = e.detail;
		joinVoice(channelName, { userId, username, avatar });
	}

	async function joinVoice(channelName: string, userInfo: { userId: string; username: string; avatar: string }) {
		try {
			if (vstate.active && vstate.channelName === channelName) return;

			voiceError = '';
			localUser = userInfo;

			const stream =
				vstate.localStream || (await navigator.mediaDevices.getUserMedia({ audio: true, video: false }));

			voiceState.setLocalStream(stream);
			voiceState.join(channelName, 'rip-dc', userInfo.userId);

			presenceChannel = await getPresenceChannel(userInfo.userId);
			voiceSignalChannel = await getVoiceSignalChannel(userInfo.userId);

			await presenceChannel.presence.update({
				username: userInfo.username,
				avatar: userInfo.avatar,
				status: 'voice',
				channelName,
				peerId: userInfo.userId,
				muted: false
			});
			window.dispatchEvent(new CustomEvent('voicepresence', {
				detail: {
					userId: userInfo.userId,
					username: userInfo.username,
					avatar: userInfo.avatar,
					status: 'voice',
					channelName,
					peerId: userInfo.userId,
					muted: false
				}
			}));

			await voiceSignalChannel.subscribe('signal', handleVoiceSignal);
			const members = await presenceChannel.presence.get();
			members
				.map((member: any) => ({
					userId: member.clientId,
					status: member.data?.status || 'online',
					channelName: member.data?.channelName || ''
				}))
				.filter((participant) => participant.status === 'voice' && participant.channelName === channelName && participant.userId !== userInfo.userId)
				.forEach((participant) => createOffer(participant.userId));
		} catch (error) {
			console.error('Failed to join voice:', error);
			voiceError = 'Voice failed to start';
		}
	}

	async function handleVoiceSignal(message: any) {
		const signal = message.data;
		if (!signal || signal.to !== localUser.userId || signal.channelName !== vstate.channelName) return;

		if (signal.type === 'offer') {
			await acceptOffer(signal.from, signal.sdp);
			return;
		}

		if (signal.type === 'answer') {
			const pc = peerConnections.get(signal.from);
			if (pc) {
				await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
			}
			return;
		}

		if (signal.type === 'ice') {
			const pc = peerConnections.get(signal.from);
			if (pc && signal.candidate) {
				await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
			}
		}
	}

	function createPeerConnection(remoteUserId: string) {
		let pc = peerConnections.get(remoteUserId);
		if (pc) return pc;

		pc = new RTCPeerConnection(rtcConfig);
		peerConnections.set(remoteUserId, pc);

		vstate.localStream?.getTracks().forEach((track) => {
			pc?.addTrack(track, vstate.localStream as MediaStream);
		});

		pc.onicecandidate = async (event) => {
			if (!event.candidate || !voiceSignalChannel) return;
			await voiceSignalChannel.publish('signal', {
				type: 'ice',
				from: localUser.userId,
				to: remoteUserId,
				channelName: vstate.channelName,
				candidate: event.candidate
			});
		};

		pc.ontrack = (event) => {
			attachRemoteAudio(remoteUserId, event.streams[0]);
		};

		pc.onconnectionstatechange = () => {
			if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed' || pc?.connectionState === 'disconnected') {
				closePeer(remoteUserId);
			}
		};

		return pc;
	}

	async function createOffer(remoteUserId: string) {
		const pc = createPeerConnection(remoteUserId);
		makingOffers.set(remoteUserId, true);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		makingOffers.set(remoteUserId, false);

		await voiceSignalChannel.publish('signal', {
			type: 'offer',
			from: localUser.userId,
			to: remoteUserId,
			channelName: vstate.channelName,
			sdp: offer
		});
	}

	async function acceptOffer(remoteUserId: string, offer: RTCSessionDescriptionInit) {
		const pc = createPeerConnection(remoteUserId);
		const offerCollision = makingOffers.get(remoteUserId) || pc.signalingState !== 'stable';
		const polite = localUser.userId > remoteUserId;
		if (offerCollision) {
			if (!polite) return;
			await pc.setLocalDescription({ type: 'rollback' });
		}
		await pc.setRemoteDescription(new RTCSessionDescription(offer));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);

		await voiceSignalChannel.publish('signal', {
			type: 'answer',
			from: localUser.userId,
			to: remoteUserId,
			channelName: vstate.channelName,
			sdp: answer
		});
	}

	function attachRemoteAudio(remoteUserId: string, remoteStream: MediaStream) {
		let audio = remoteAudioEls.get(remoteUserId);
		if (!audio) {
			audio = document.createElement('audio');
			audio.autoplay = true;
			audio.playsInline = true;
			audio.style.display = 'none';
			document.body.appendChild(audio);
			remoteAudioEls.set(remoteUserId, audio);
		}
		audio.srcObject = remoteStream;
		audio.muted = vstate.deafened;
		audio.play().catch(console.error);
	}

	function closePeer(remoteUserId: string) {
		peerConnections.get(remoteUserId)?.close();
		peerConnections.delete(remoteUserId);
		makingOffers.delete(remoteUserId);
		const audio = remoteAudioEls.get(remoteUserId);
		audio?.remove();
		remoteAudioEls.delete(remoteUserId);
	}

	async function leaveVoice() {
		try {
			await presenceChannel?.presence.update({
				username: localUser.username,
				avatar: localUser.avatar,
				status: 'online',
				channelName: '',
				peerId: null,
				muted: false
			});
			window.dispatchEvent(new CustomEvent('voicepresence', {
				detail: {
					userId: localUser.userId,
					username: localUser.username,
					avatar: localUser.avatar,
					status: 'online',
					channelName: '',
					peerId: null,
					muted: false
				}
			}));
		} finally {
			voiceSignalChannel?.unsubscribe('signal', handleVoiceSignal);
			peerConnections.forEach((_, remoteUserId) => closePeer(remoteUserId));
			peerConnections.clear();
			voiceState.leave();
		}
	}

	async function toggleMute() {
		voiceState.toggleMute();
		const nextMuted = !vstate.audioMuted;
		await presenceChannel?.presence.update({
			username: localUser.username,
			avatar: localUser.avatar,
			status: 'voice',
			channelName: vstate.channelName,
			peerId: localUser.userId,
			muted: nextMuted
		});
		window.dispatchEvent(new CustomEvent('voicepresence', {
			detail: {
				userId: localUser.userId,
				username: localUser.username,
				avatar: localUser.avatar,
				status: 'voice',
				channelName: vstate.channelName,
				peerId: localUser.userId,
				muted: nextMuted
			}
		}));
	}

	function toggleDeafen() {
		voiceState.toggleDeafen();
		const nextDeafened = !vstate.deafened;
		remoteAudioEls.forEach((audio) => {
			audio.muted = nextDeafened;
		});
	}
</script>

{#if vstate.active}
	<div style="position:fixed;bottom:56px;left:0;width:240px;height:52px;background:var(--bg-tertiary);border-top:1px solid var(--accent);border-right:1px solid var(--border);display:flex;align-items:center;padding:0 12px;z-index:1000;gap:10px;">
		<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
			<div style="width:28px;height:28px;border-radius:50%;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
				<Volume2 size={16} color="var(--green)" />
			</div>
			<div style="display:flex;flex-direction:column;min-width:0;">
				<span style="font-size:12px;font-weight:600;color:var(--green);">In Voice</span>
				<span style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#{vstate.channelName}</span>
			</div>
		</div>
		<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
			<button
				onclick={toggleMute}
				title={vstate.audioMuted ? 'Unmute' : 'Mute'}
				style="width:28px;height:28px;border-radius:8px;background:var(--bg-accent);border:none;color:{vstate.audioMuted ? 'var(--danger)' : 'var(--text-primary)'};cursor:pointer;display:flex;align-items:center;justify-content:center;"
			>
				{#if vstate.audioMuted}
					<MicOff size={16} />
				{:else}
					<Mic size={16} />
				{/if}
			</button>
			<button
				onclick={toggleDeafen}
				title={vstate.deafened ? 'Undeafen' : 'Deafen'}
				style="width:28px;height:28px;border-radius:8px;background:var(--bg-accent);border:none;color:{vstate.deafened ? 'var(--danger)' : 'var(--text-primary)'};cursor:pointer;display:flex;align-items:center;justify-content:center;"
			>
				{#if vstate.deafened}
					<VolumeX size={16} />
				{:else}
					<Volume2 size={16} />
				{/if}
			</button>
			<button
				onclick={leaveVoice}
				title="Disconnect"
				style="width:28px;height:28px;border-radius:8px;background:var(--danger);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;"
			>
				<PhoneOff size={16} />
			</button>
		</div>
	</div>
{/if}

{#if voiceError}
	<div style="position:fixed;bottom:64px;right:16px;max-width:320px;padding:10px 12px;border-radius:8px;background:var(--danger);color:white;font-size:13px;z-index:1001;">
		{voiceError}
	</div>
{/if}
