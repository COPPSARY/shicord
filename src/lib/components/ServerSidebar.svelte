<script lang="ts">
	let {
		services = [] as any[],
		servers = [] as any[],
		currentServerId = null as string | null,
		currentView = 'server' as string,
		onHome = () => {},
		onServerClick = (_id: string) => {},
		onAddServer = () => {},
		onJoinServer = () => {}
	} = $props();

	const serverList = $derived(servers.length > 0 ? servers : services);

	function getColor(name: string): string {
		const colors = ['#e53170','#f25f4c','#ff8c42','#2ecc71','#a855f7','#06b6d4','#facc15','#ec4899'];
		let h = 0;
		for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
		return colors[Math.abs(h) % colors.length];
	}
</script>

<div style="width:72px;min-width:72px;background:var(--server-bar-bg);display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:4px;overflow-y:auto;">
	<div
		onclick={onHome}
		style="width:48px;height:48px;border-radius:{currentView === 'friends' ? '14px' : '24px'};background:var(--server-icon-bg);display:flex;align-items:center;justify-content:center;cursor:pointer;color:{currentView === 'friends' ? 'var(--accent)' : 'var(--text-muted)'};transition:all 0.15s;flex-shrink:0;"
	>
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
			<polyline points="9 22 9 12 15 12 15 22"/>
		</svg>
	</div>

	<div style="width:32px;height:2px;border-radius:1px;background:var(--border);margin:4px 0;flex-shrink:0;"></div>

	{#each serverList as server (server.id)}
		<div
			onclick={() => onServerClick(server.id)}
			title={server.name}
			style="width:48px;height:48px;border-radius:{currentServerId === server.id ? '14px' : '24px'};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white;cursor:pointer;transition:all 0.15s;flex-shrink:0;position:relative;{server.icon ? `background-image:url(${server.icon});background-size:cover;background-position:center;` : `background:${getColor(server.name)};`}"
		>
			{#if !server.icon}
				{server.name.charAt(0).toUpperCase()}
			{/if}
		</div>
	{/each}

	<div
		onclick={onAddServer}
		title="Create Server"
		style="width:48px;height:48px;border-radius:24px;background:var(--server-icon-bg);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--green);transition:all 0.15s;flex-shrink:0;font-size:24px;"
	>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
			<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
		</svg>
	</div>
	<div
		onclick={onJoinServer}
		title="Join Server"
		style="width:48px;height:48px;border-radius:24px;background:var(--server-icon-bg);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--accent);transition:all 0.15s;flex-shrink:0;font-size:20px;font-weight:700;margin-top:2px;"
	>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
			<polyline points="10 17 15 12 10 7"/>
			<line x1="15" y1="12" x2="3" y2="12"/>
		</svg>
	</div>
</div>
