<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	let dmConversations = $state<any[]>([]);
	let currentUserId = $state<string | null>(null);
	let profiles = $state<Record<string, any>>({});

	onMount(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		currentUserId = user?.id || null;
		await loadDMList();
	});

	async function loadDMList() {
		if (!currentUserId) return;
		const { data } = await supabase
			.from('dm_conversations')
			.select('*')
			.or(`participant1.eq.${currentUserId},participant2.eq.${currentUserId}`);
		dmConversations = data || [];
		if (dmConversations.length > 0) {
			const ids = dmConversations.map(dm => dm.participant1 === currentUserId ? dm.participant2 : dm.participant1);
			const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
			if (profs) {
				for (const p of profs) profiles[p.id] = p;
			}
		}
	}

	function getOtherParticipant(dm: any): string {
		if (!currentUserId) return dm.participant1;
		return dm.participant1 === currentUserId ? dm.participant2 : dm.participant1;
	}

	function getOtherProfile(dm: any): any {
		const id = getOtherParticipant(dm);
		return profiles[id] || null;
	}

	async function startDM(userId: string) {
		if (!currentUserId) return;
		const key = [currentUserId, userId].sort().join(':');
		const { data: existing } = await supabase
			.from('dm_conversations')
			.select('*')
			.eq('id', key)
			.single();
		if (!existing) {
			await supabase.from('dm_conversations').insert({
				id: key,
				participant1: currentUserId,
				participant2: userId
			});
		}
		window.dispatchEvent(new CustomEvent('startdm', { detail: { userId, dmId: key } }));
	}

	const colors = ['#e53170','#f25f4c','#ff8c42','#2ecc71','#a855f7','#06b6d4','#facc15','#ec4899'];

	function getColor(name: string): string {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
		return colors[Math.abs(h) % colors.length];
	}

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}
</script>

<div style="padding:8px 8px 8px;">
	<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
		<span>Direct Messages</span>
	</div>
	<div style="display:flex;flex-direction:column;gap:2px;">
		{#each dmConversations as dm}
			{@const profile = getOtherProfile(dm)}
			<button
				onclick={() => startDM(getOtherParticipant(dm))}
				style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:4px;cursor:pointer;color:var(--text-muted);font-size:14px;font-weight:500;transition:background 0.1s;background:none;border:none;text-align:left;width:100%;"
			>
				<div
					style="width:32px;height:32px;min-width:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:white;overflow:hidden;background-size:cover;background-position:center;background:{profile?.avatar ? 'transparent' : getColor(profile?.username || profile?.display_name || '?')};"
				>
					{#if profile?.avatar}
						<img src={profile.avatar} alt="" style="width:100%;height:100%;object-fit:cover;" />
					{:else}
						{getInitials(profile?.username || profile?.display_name || '?')}
					{/if}
				</div>
				<span>{profile?.display_name || profile?.username || getOtherParticipant(dm).slice(0, 8)}</span>
			</button>
		{/each}
	</div>
</div>
