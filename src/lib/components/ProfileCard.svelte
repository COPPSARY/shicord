<script lang="ts">
	let {
		profile = null as any,
		onClose = () => {}
	} = $props();

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

<div
	class="modal"
	style="display:flex;"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<div class="modal-content" style="width:340px;text-align:left;">
		<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0;">
			<div
				style="width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:white;overflow:hidden;background-size:cover;background-position:center;background:{profile?.avatar ? 'transparent' : getColor(profile?.username || profile?.display_name || '?')};"
			>
				{#if profile?.avatar}
					<img src={profile.avatar} alt="" style="width:100%;height:100%;object-fit:cover;" />
				{:else}
					{getInitials(profile?.display_name || profile?.username || '?')}
				{/if}
			</div>
			<div style="text-align:center;">
				<div style="font-size:20px;font-weight:700;">{profile?.display_name || profile?.username || 'Unknown'}</div>
				<div style="font-size:13px;color:var(--text-muted);">@{profile?.username || 'unknown'}</div>
			</div>
			{#if profile?.bio}
				<div style="font-size:14px;color:var(--text-secondary);text-align:center;padding:4px 16px;">
					{profile.bio}
				</div>
			{/if}
			<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--green);">
				<div style="width:10px;height:10px;border-radius:50%;background:var(--green);"></div>
				Online
			</div>
		</div>
	</div>
</div>
