<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { extractInviteCode } from '$lib/utils/server';

	let {
		show = false,
		onClose = () => {},
		onJoined = () => {}
	} = $props();

	let inviteCode = $state('');
	let joinError = $state('');
	let joining = $state(false);

	async function joinServer() {
		joinError = '';
		joining = true;
		try {
			const code = extractInviteCode(inviteCode);
			if (!code) { joinError = 'Enter an invite code'; joining = false; return; }
			const { data: invite, error: invErr } = await supabase
				.from('invites')
				.select('*, servers!inner(*)')
				.eq('code', code)
				.single();
			if (invErr || !invite) { joinError = 'Invalid invite code'; joining = false; return; }
			if (!invite.server_id) { joinError = 'Invite has no server'; joining = false; return; }
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) { joinError = 'Not logged in'; joining = false; return; }
			await supabase.from('invites').update({ uses: (invite.uses || 0) + 1 }).eq('id', invite.id);
			await supabase.from('server_members').insert({ server_id: invite.server_id, user_id: user.id });
			onJoined();
			onClose();
		} catch (e: any) {
			joinError = e?.message || 'Failed to join server';
		}
		joining = false;
	}
</script>

{#if show}
	<div class="modal" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
		<div class="modal-content small">
			<h2>Join a Server</h2>
			<p>Enter an invite code</p>
			<label>Invite Code or Link</label>
			<input type="text" bind:value={inviteCode} placeholder="Paste invite link or code here"
				onkeydown={(e) => { if (e.key === 'Enter') joinServer(); }}
			/>
			{#if joinError}
				<div style="color:var(--danger);font-size:13px;margin-bottom:8px;">{joinError}</div>
			{/if}
			<div class="modal-buttons">
				<button onclick={joinServer}>{joining ? 'Joining...' : 'Join'}</button>
				<button onclick={onClose}>Cancel</button>
			</div>
		</div>
	</div>
{/if}
