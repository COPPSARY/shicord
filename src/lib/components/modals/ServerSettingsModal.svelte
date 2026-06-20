<script lang="ts">
	import { supabase } from '$lib/supabase';

	let {
		show = false,
		server = null as any,
		onClose = () => {},
		onSave = (_name: string, _icon: string | null) => {}
	} = $props();

	let serverName = $state('');
	let iconData = $state<string | null>(null);
	let inviteCode = $state('');
	let inviteCopied = $state(false);

	$effect(() => {
		if (show && server) {
			serverName = server.name || '';
			iconData = null;
		}
	});

	function handleIconUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input?.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			iconData = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function generateInvite() {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return;
		const code = Math.random().toString(36).slice(2, 10);
		const { data } = await supabase
			.from('invites')
			.insert({ code, creator_id: user.id, server_id: server.id })
			.select()
			.single();
		if (data) {
			inviteCode = `${window.location.origin}/join/${data.code}`;
			inviteCopied = false;
		}
	}

	async function copyInvite() {
		if (inviteCode) {
			await navigator.clipboard.writeText(inviteCode);
			inviteCopied = true;
			setTimeout(() => inviteCopied = false, 2000);
		}
	}
</script>

{#if show && server}
	<div class="modal" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
		<div class="modal-content small">
			<h2>Server Settings</h2>
			<p>Customize your server</p>
			<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
				<div
					onclick={() => document.getElementById('server-icon-input')?.click()}
					style="width:64px;height:64px;min-width:64px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;cursor:pointer;overflow:hidden;background-size:cover;background-position:center;{iconData ? `background-image:url(${iconData})` : ''}"
				>
					{iconData ? '' : (server.name?.charAt(0).toUpperCase() || 'S')}
				</div>
				<div style="flex:1;">
					<label>Server Name</label>
					<input type="text" bind:value={serverName} maxlength="32" />
					<p style="font-size:11px;color:var(--text-muted);margin-top:4px;margin-bottom:0;">Click the icon to change it</p>
				</div>
			</div>
			<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding:8px 12px;background:var(--bg-accent);border-radius:6px;">
				Server ID: {server.id}{server.owner_id ? ` | Owner: ${server.owner_id}` : ''}
			</div>

			<div style="margin-bottom:12px;padding-top:8px;border-top:1px solid var(--border);">
				<label style="margin-bottom:4px;">Invite</label>
				{#if inviteCode}
					<div style="display:flex;gap:6px;align-items:center;">
						<input type="text" value={inviteCode} readonly
							style="flex:1;padding:8px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary);font-size:12px;outline:none;"
						/>
						<button onclick={copyInvite} style="padding:8px 12px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;">
							{inviteCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				{:else}
					<button onclick={generateInvite} style="padding:8px 14px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
						Generate Invite
					</button>
				{/if}
			</div>

			<input type="file" id="server-icon-input" accept="image/*" style="display:none" onchange={handleIconUpload} />
			<div class="modal-buttons">
				<button onclick={() => { onSave(serverName, iconData); }}>Save</button>
				<button onclick={onClose}>Cancel</button>
			</div>
		</div>
	</div>
{/if}
