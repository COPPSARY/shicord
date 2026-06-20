<script lang="ts">
	let {
		show = false,
		onClose = () => {},
		onCreate = (_name: string) => {},
		error = ''
	} = $props();

	let serverName = $state('');
</script>

{#if show}
	<div class="modal" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
		<div class="modal-content small">
			<h2>Create a Server</h2>
			<p>Give your server a name</p>
			<label>Server Name</label>
			<input type="text" bind:value={serverName} placeholder="My Server" maxlength="32"
				onkeydown={(e) => { if (e.key === 'Enter') { onCreate(serverName || 'New Server'); serverName = ''; } }}
			/>
			{#if error}
				<div style="color:var(--danger);font-size:13px;margin:4px 0;">{error}</div>
			{/if}
			<div class="modal-buttons">
				<button onclick={() => { onCreate(serverName || 'New Server'); serverName = ''; }}>Create</button>
				<button onclick={() => { onClose(); serverName = ''; }}>Cancel</button>
			</div>
		</div>
	</div>
{/if}
