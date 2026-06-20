<script lang="ts">
	import { Volume2 } from '@lucide/svelte';

	let {
		channels = [] as any[],
		currentChannel = '' as string,
		onChannelClick = (_name: string) => {},
		voiceParticipants = [] as any[],
		onJoinVoice = (_name: string) => {}
	} = $props();

	let textChannels = $derived(channels.filter(c => c.type === 'text' || !c.type));
	let voiceChannels = $derived(channels.filter(c => c.type === 'voice'));

	function getParticipantsForChannel(name: string) {
		return voiceParticipants.filter(p => p.channelName === name);
	}
</script>

<div style="padding:8px;">
	<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">
		<span>Text Channels</span>
	</div>
	<div style="display:flex;flex-direction:column;gap:2px;">
		{#each textChannels as ch (ch.name || ch.id)}
			<div
				onclick={() => onChannelClick(ch.name)}
				style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:4px;cursor:pointer;color:var(--text-muted);font-size:15px;font-weight:500;transition:background 0.1s;{currentChannel === ch.name ? 'background:var(--bg-accent);color:var(--text-primary);' : ''}"
			>
				<span style="font-size:20px;font-weight:300;color:{currentChannel === ch.name ? 'var(--text-primary)' : 'var(--text-muted)'};">#</span>
				<span>{ch.name}</span>
			</div>
		{/each}
	</div>

	{#if voiceChannels.length > 0}
		<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:8px;">
			<span>Voice Channels</span>
		</div>
		<div style="display:flex;flex-direction:column;gap:2px;">
			{#each voiceChannels as ch (ch.name || ch.id)}
				{@const vp = getParticipantsForChannel(ch.name)}
				<div
					onclick={() => onJoinVoice(ch.name)}
					style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:4px;cursor:pointer;color:var(--text-muted);font-size:15px;font-weight:500;transition:background 0.1s;{currentChannel === ch.name ? 'background:var(--bg-accent);color:var(--text-primary);' : ''}"
				>
					<span style="color:var(--voice-green);display:flex;align-items:center;">
						<Volume2 size={16} />
					</span>
					<span>{ch.name}</span>
					{#if vp.length > 0}
						<span style="font-size:11px;color:var(--green);margin-left:auto;">{vp.length} in voice</span>
					{/if}
				</div>
				{#each vp as p}
					<div
						style="display:flex;align-items:center;gap:8px;padding:4px 12px 4px 28px;border-radius:4px;font-size:13px;color:var(--text-muted);"
					>
						<div style="width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0;"></div>
						<div
							style="width:24px;height:24px;min-width:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:white;overflow:hidden;background-size:cover;background-position:center;background:{p.avatar ? 'transparent' : 'var(--accent)'};"
						>
							{#if p.avatar}
								<img src={p.avatar} alt="" style="width:100%;height:100%;object-fit:cover;" />
							{:else}
								{p.username?.slice(0, 2).toUpperCase() || '?'}
							{/if}
						</div>
						<span>{p.username}</span>
					</div>
				{/each}
			{/each}
		</div>
	{/if}
</div>
