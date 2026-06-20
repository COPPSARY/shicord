<script lang="ts">
	let {
		members = [] as any[]
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

<div style="width:240px;min-width:240px;background:var(--bg-secondary);display:flex;flex-direction:column;border-left:1px solid var(--border);">
	<div style="padding:16px 20px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">
		Members — {members.length}
	</div>
	<div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px;">
		{#each members as member}
			<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:4px;font-size:15px;font-weight:500;color:var(--text-secondary);">
				<div style="width:10px;height:10px;min-width:10px;border-radius:50%;background:var(--green);"></div>
				<div
					style="width:28px;height:28px;min-width:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:white;overflow:hidden;background-size:cover;background-position:center;background:{getColor(member.username)};"
				>
					{getInitials(member.username)}
				</div>
				<span>{member.username}</span>
			</div>
		{/each}
	</div>
</div>
