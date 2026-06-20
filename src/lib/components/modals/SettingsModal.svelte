<script lang="ts">
	import { supabase } from '$lib/supabase';

	let {
		onLogout = () => {},
		user = null as any,
		profile = null as any,
		onProfileUpdate = () => {},
		show = $bindable(false)
	} = $props();

	let displayName = $state('');
	let username = $state('');
	let bio = $state('');
	let avatarFile = $state<File | null>(null);
	let avatarPreview = $state('');
	let saving = $state(false);

	$effect(() => {
		if (show) {
			displayName = profile?.display_name || user?.user_metadata?.username || '';
			username = profile?.username || user?.user_metadata?.username || '';
			bio = profile?.bio || '';
			avatarFile = null;
			avatarPreview = '';
		}
	});

	function handleAvatarUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input?.files?.[0];
		if (!file) return;
		avatarFile = file;
		const reader = new FileReader();
		reader.onload = (ev) => {
			avatarPreview = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function deleteOldAvatar() {
		if (!profile?.avatar) return;
		const url = profile.avatar;
		const parts = url.split('/');
		const filePath = parts.slice(-2).join('/');
		if (filePath) {
			await supabase.storage.from('Avatar').remove([filePath]);
		}
	}

	async function uploadAvatar(): Promise<string> {
		if (!avatarFile || !user) return profile?.avatar || '';
		const ext = avatarFile.name.split('.').pop() || 'png';
		const filePath = `${user.id}.${ext}`;
		await deleteOldAvatar();
		await supabase.storage.from('Avatar').upload(filePath, avatarFile, {
			upsert: true,
			contentType: avatarFile.type
		});
		const { data: { publicUrl } } = supabase.storage.from('Avatar').getPublicUrl(filePath);
		return publicUrl;
	}

	async function save() {
		saving = true;
		const u = await supabase.auth.getUser();
		if (!u.data.user) { saving = false; return; }
		const updates: any = {};
		if (username) updates.username = username;
		if (displayName) updates.display_name = displayName;
		if (bio) updates.bio = bio;
		if (avatarFile) {
			updates.avatar = await uploadAvatar();
		}
		await supabase.from('profiles').update(updates).eq('id', u.data.user.id);
		show = false;
		saving = false;
		onProfileUpdate();
	}
</script>

{#if show}
	<div class="modal" onclick={(e) => { if (e.target === e.currentTarget) show = false; }}>
		<div class="modal-content" style="width:460px;">
			<h2>User Settings</h2>
			<div style="display:flex;gap:16px;margin:16px 0;">
				<div
					onclick={() => document.getElementById('avatar-input')?.click()}
					style="width:80px;height:80px;border-radius:50%;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:white;overflow:hidden;background-size:cover;background-position:center;flex-shrink:0;cursor:pointer;{avatarPreview ? `background-image:url(${avatarPreview})` : (profile?.avatar ? `background-image:url(${profile.avatar})` : '')}"
				>
					{#if !avatarPreview && !profile?.avatar}
						{(displayName || 'U').slice(0, 2).toUpperCase()}
					{/if}
				</div>
				<div style="flex:1;">
					<input type="file" id="avatar-input" accept="image/jpeg,image/png,image/gif" style="display:none" onchange={handleAvatarUpload} />
					<label>Display Name</label>
					<input type="text" bind:value={displayName} maxlength="32" />
					<label>Username</label>
					<input type="text" bind:value={username} maxlength="32" />
					<label>Bio</label>
					<textarea bind:value={bio} maxlength="200" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary);font-size:14px;outline:none;resize:none;height:60px;"></textarea>
				</div>
			</div>
			{#if user}
				<div style="padding-top:12px;border-top:1px solid var(--border);">
					<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">{user.email}</p>
					<button onclick={onLogout} style="background:var(--danger);">Log Out</button>
				</div>
			{/if}
			<div class="modal-buttons" style="margin-top:12px;">
				<button onclick={save}>{saving ? 'Saving...' : 'Save'}</button>
				<button onclick={() => show = false}>Cancel</button>
			</div>
		</div>
	</div>
{/if}
