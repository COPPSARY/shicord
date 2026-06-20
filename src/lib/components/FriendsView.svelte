<script lang="ts">
	import { supabase } from '$lib/supabase';

	let {
		friends = [] as any[],
		onStartDM = (_id: string) => {},
		onRefresh = () => {}
	} = $props();

	let currentTab = $state('online');
	let addUsername = $state('');
	let friendMsg = $state('');
	let friendMsgError = $state(false);

	const colors = ['#e53170','#f25f4c','#ff8c42','#2ecc71','#a855f7','#06b6d4','#facc15','#ec4899'];

	function getColor(name: string): string {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
		return colors[Math.abs(h) % colors.length];
	}

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	let filteredFriends = $derived.by(() => {
		if (currentTab === 'online') return friends.filter(f => f.status === 'accepted' && f.friend?.status === 'online');
		if (currentTab === 'all') return friends.filter(f => f.status === 'accepted');
		if (currentTab === 'pending') return friends.filter(f => f.status === 'pending');
		return [];
	});

	async function sendFriendRequest() {
		const username = addUsername.replace(/#.*$/, '').trim();
		if (!username) return;
		friendMsg = '';
		const { data: target } = await supabase.from('profiles').select('id').eq('username', username).single();
		if (!target) { friendMsg = 'User not found'; friendMsgError = true; return; }
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		if (target.id === user.id) { friendMsg = 'Cannot add yourself'; friendMsgError = true; return; }
		const { error } = await supabase.from('friends').insert({ sender_id: user.id, receiver_id: target.id, status: 'pending' });
		if (error) { friendMsg = error.message; friendMsgError = true; return; }
		friendMsg = 'Friend request sent!';
		friendMsgError = false;
		addUsername = '';
		onRefresh();
	}

	async function acceptFriend(fromId: string) {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		await supabase.from('friends').update({ status: 'accepted', updated_at: new Date() })
			.eq('sender_id', fromId).eq('receiver_id', user.id).eq('status', 'pending');
		onRefresh();
	}

	async function rejectFriend(fromId: string) {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		await supabase.from('friends').update({ status: 'rejected', updated_at: new Date() })
			.eq('sender_id', fromId).eq('receiver_id', user.id).eq('status', 'pending');
		onRefresh();
	}

	async function removeFriend(friendId: string) {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		await supabase.from('friends').delete()
			.or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`);
		onRefresh();
	}
</script>

<div style="display:flex;flex-direction:column;height:100%;">
	<div style="display:flex;border-bottom:1px solid var(--border);padding:0 8px;overflow-x:auto;flex-shrink:0;">
		{#each ['online', 'all', 'pending', 'add'] as tab}
			<button
				onclick={() => currentTab = tab}
				style="background:none;border:none;color:{currentTab === tab ? 'var(--text-primary)' : 'var(--text-muted)'};font-size:13px;font-weight:500;padding:10px 10px;cursor:pointer;border-bottom:2px solid {currentTab === tab ? 'var(--accent)' : 'transparent'};transition:all 0.15s;white-space:nowrap;"
			>{tab === 'add' ? 'Add Friend' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
		{/each}
	</div>

	{#if currentTab === 'add'}
		<div style="padding:8px 12px;">
			<div style="display:flex;gap:6px;">
				<input
					type="text"
					bind:value={addUsername}
					placeholder="Enter username"
					style="flex:1;padding:8px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary);font-size:13px;outline:none;"
				/>
				<button onclick={sendFriendRequest} style="padding:8px 14px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;">Send</button>
			</div>
			{#if friendMsg}
				<div style="font-size:12px;margin-top:4px;color:{friendMsgError ? 'var(--danger)' : 'var(--green)'};">{friendMsg}</div>
			{/if}
		</div>
	{/if}

	<div style="flex:1;overflow-y:auto;padding:8px;">
		{#if filteredFriends.length === 0}
			<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:14px;">
				{currentTab === 'pending' ? 'No pending requests' : 'No friends online'}
			</div>
		{/if}
		{#each filteredFriends as f}
			<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;transition:background 0.1s;">
				<div
					style="width:40px;height:40px;min-width:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:white;overflow:hidden;background-size:cover;background-position:center;background:{f.friend?.avatar ? 'transparent' : getColor(f.friend?.username || '?')};"
				>
					{#if f.friend?.avatar}
						<img src={f.friend.avatar} alt="" style="width:100%;height:100%;object-fit:cover;" />
					{:else}
						{getInitials(f.friend?.username || '?')}
					{/if}
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:15px;font-weight:500;">{f.friend?.username || 'Unknown'}</div>
					<div style="font-size:12px;color:var(--text-muted);">
						{f.status === 'pending'
							? (f.direction === 'received' ? 'Incoming Request' : 'Pending...')
							: (f.friend?.status || 'offline')}
					</div>
				</div>
				<div style="display:flex;gap:4px;">
					{#if f.status === 'pending' && f.direction === 'received'}
						<button onclick={() => acceptFriend(f.sender_id)} style="background:var(--bg-accent);border:none;color:var(--text-primary);padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Accept</button>
						<button onclick={() => rejectFriend(f.sender_id)} style="background:var(--danger);border:none;color:white;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">✕</button>
					{:else if f.status === 'accepted'}
						<button onclick={() => onStartDM(f.friend?.id)} style="background:var(--bg-accent);border:none;color:var(--text-primary);padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Message</button>
						<button onclick={() => removeFriend(f.friend?.id)} style="background:var(--danger);border:none;color:white;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Remove</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
