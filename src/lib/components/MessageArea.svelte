<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { FileText, Image, Paperclip, Smile, X } from '@lucide/svelte';
	import ProfileCard from './ProfileCard.svelte';
	import { createMessageRateLimiter } from '$lib/utils/rate-limit.js';
	import { supabase } from '$lib/supabase';

	const _noop = (_msg: any) => {};
	let {
		messages = [] as any[],
		currentChannel = '' as string,
		currentServerId = '' as string | null,
		currentView = 'server' as string,
		currentDMId = null as string | null,
		currentDMUserId = null as string | null,
		onSendOptimistic = _noop,
		onSendMessage = _noop,
		onDeleteMessage = _noop,
		onLoadOlder = async () => {},
		loadingOlder = false,
		canLoadOlder = false,
		profiles = {} as Record<string, any>,
		guestId = '',
		guestName = '',
		guestAvatar = ''
	} = $props();

	let inputText = $state('');
	let replyTo = $state<any>(null);
	let editMessageId = $state<string | null>(null);
	let showEmojiPicker = $state(false);
	let showProfileCard = $state<any>(null);
	let attachMenuOpen = $state(false);
	let previewImage = $state<string | null>(null);
	let previewImageFile = $state<File | null>(null);
	let previewFile = $state<{name:string, data:string} | null>(null);

	let messagesEnd = $state<HTMLDivElement>();
	let scroller = $state<HTMLDivElement>();
	let emojiPickerEl = $state<HTMLElement | null>(null);
	let lastMessageKey = $state('');
	let spamError = $state('');
	let sendError = $state('');
	let cooldownUntil = $state(0);
	let cooldownNow = $state(Date.now());
	let cooldownTimer: ReturnType<typeof setInterval> | null = null;
	const messageRateLimiter = createMessageRateLimiter();

	const colors = ['#e53170','#f25f4c','#ff8c42','#2ecc71','#a855f7','#06b6d4','#facc15','#ec4899'];

	function getAvatarColor(name: string): string {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
		return colors[Math.abs(h) % colors.length];
	}

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	function formatTime(t: string): string {
		return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function escapeHtml(t: string): string {
		const d = document.createElement('div');
		d.textContent = t;
		return d.innerHTML;
	}

	function highlightMentions(t: string): string {
		return t
			.replace(/@everyone/g, '<span class="mention everyone">@everyone</span>')
			.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
	}

	function formatMarkdown(t: string): string {
		return t
			.replace(/```([\s\S]*?)```/g, '<code class="code-block">$1</code>')
			.replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>')
			.replace(/~~(.+?)~~/g, '<del>$1</del>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/^&gt;(.+)/gm, '<blockquote>$1</blockquote>');
	}

	function scrollToBottom() {
		setTimeout(() => messagesEnd?.scrollIntoView({ behavior: 'smooth' }), 50);
	}

	function ensureCooldownTimer() {
		if (cooldownTimer || cooldownUntil <= Date.now()) return;
		cooldownTimer = setInterval(() => {
			cooldownNow = Date.now();
			if (cooldownNow >= cooldownUntil && cooldownTimer) {
				clearInterval(cooldownTimer);
				cooldownTimer = null;
				spamError = '';
			}
		}, 1000);
	}

	onDestroy(() => {
		if (cooldownTimer) clearInterval(cooldownTimer);
	});

	onMount(async () => {
		await import('emoji-picker-element');
	});

	$effect(() => {
		if (!emojiPickerEl) return;

		const handleEmojiClick = (event: Event) => {
			const customEvent = event as CustomEvent;
			insertEmoji(customEvent.detail?.unicode || '');
			showEmojiPicker = false;
		};

		emojiPickerEl.addEventListener('emoji-click', handleEmojiClick);
		return () => {
			emojiPickerEl?.removeEventListener('emoji-click', handleEmojiClick);
		};
	});

	$effect(() => {
		const nextKey = messages.length ? String(messages[messages.length - 1].id || messages[messages.length - 1]._id || messages[messages.length - 1].created_at) : '';
		if (!nextKey || nextKey === lastMessageKey) return;
		lastMessageKey = nextKey;
		scrollToBottom();
	});

	function handleScroll() {
		if (!scroller || loadingOlder || !canLoadOlder) return;
		if (scroller.scrollTop <= 80) {
			onLoadOlder();
		}
	}

	const cooldownSeconds = $derived(cooldownUntil > cooldownNow ? Math.ceil((cooldownUntil - cooldownNow) / 1000) : 0);

	function insertEmoji(e: string) {
		inputText += e;
	}

	function handleAttachClick() {
		attachMenuOpen = !attachMenuOpen;
		showEmojiPicker = false;
	}

	function handleImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input?.files?.[0];
		if (!file) return;
		previewImageFile = file;
		const reader = new FileReader();
		reader.onload = (ev) => {
			previewImage = ev.target?.result as string;
			attachMenuOpen = false;
		};
		reader.readAsDataURL(file);
		input.value = '';
	}

	function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input?.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			previewFile = { name: file.name, data: ev.target?.result as string };
			attachMenuOpen = false;
		};
		reader.readAsDataURL(file);
		input.value = '';
	}

	function cancelPreview() {
		previewImage = null;
		previewImageFile = null;
		previewFile = null;
	}

	async function uploadChatImage(): Promise<string | null> {
		if (!supabase || !previewImageFile || !guestId) return previewImage;
		const ext = previewImageFile.name.split('.').pop() || 'png';
		const filePath = `${guestId}/${Date.now()}.${ext}`;
		const { error } = await supabase.storage.from('Server-images').upload(filePath, previewImageFile, {
			upsert: false,
			contentType: previewImageFile.type
		});
		if (error) throw error;
		const { data: { publicUrl } } = supabase.storage.from('Server-images').getPublicUrl(filePath);
		return publicUrl;
	}

	async function sendMessage() {
		const text = inputText.trim();
		if (!text && !previewImage && !previewFile) return;
		if (cooldownUntil > Date.now()) {
			spamError = "Please don't spam";
			ensureCooldownTimer();
			return;
		}

		if (editMessageId) {
			editMessageId = null;
			inputText = '';
			return;
		}

		if (!guestId) return;

		const senderId = guestId;
		const username = guestName || 'User';
		const displayName = guestName || '';
		const avatarUrl = '';

		let msgType = 'text';
		let mediaData = null;

		if (previewImage) {
			msgType = 'image';
			try {
				mediaData = await uploadChatImage();
			} catch (error) {
				console.error('Failed to upload image:', error);
				sendError = 'Image upload failed';
				return;
			}
		} else if (previewFile) {
			msgType = 'file';
			mediaData = JSON.stringify(previewFile);
		}

		const optimistic = {
			_id: 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
			sender_id: senderId,
			username,
			display_name: displayName,
			text: text || '',
			msg_type: msgType,
			media_data: mediaData,
			reply_to: replyTo ? { id: replyTo.id, username: replyTo.username, text: replyTo.text } : null,
			avatar: guestAvatar || avatarUrl,
			created_at: new Date().toISOString()
		};

		const rateLimitResult = messageRateLimiter.check();
		if (!rateLimitResult.allowed) {
			spamError = rateLimitResult.reason;
			cooldownUntil = Date.now() + rateLimitResult.retryAfterMs;
			cooldownNow = Date.now();
			ensureCooldownTimer();
			return;
		}

		inputText = '';
		replyTo = null;
		cancelPreview();
		spamError = '';
		sendError = '';
		onSendOptimistic(optimistic);
		await onSendMessage(optimistic);
	}

	async function handleReaction(msgId: string, emoji: string) {
		const msg = messages.find(m => m.id === msgId || m._id === msgId);
		if (!msg) return;
		const uname = guestName || 'User';
		const reactions = { ...(msg.reactions || {}) };
		if (reactions[emoji]?.includes(uname)) {
			reactions[emoji] = reactions[emoji].filter((u: string) => u !== uname);
		} else {
			reactions[emoji] = [...(reactions[emoji] || []), uname];
		}
		msg.reactions = reactions;
		messages = [...messages];
	}

	function startReply(msg: any) {
		replyTo = {
			id: msg.id || msg._id,
			username: msg.display_name || msg.username || 'Unknown',
			text: msg.text || ''
		};
	}
</script>

<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
	<div bind:this={scroller} onscroll={handleScroll} style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:2px;">
		{#if loadingOlder}
			<div style="display:flex;justify-content:center;padding:8px 0 12px;font-size:12px;color:var(--text-muted);">
				Loading older messages...
			</div>
		{/if}
		{#each messages as msg (msg.id || msg._id || msg.created_at)}
			{@const isImage = msg.msg_type === 'image'}
			{@const isFile = msg.msg_type === 'file'}
			{@const p = profiles[msg.sender_id]}
			{@const name = msg.display_name || p?.display_name || msg.username || p?.username || 'Unknown'}
			{@const avatar = msg.avatar || p?.avatar || ''}
			{@const isOwnMessage = msg.sender_id === guestId}
			<div
				style="display:flex;gap:12px;padding:4px 16px;margin:0 -16px;transition:background 0.1s;"
			>
				<div
					onclick={() => showProfileCard = p || { id: msg.sender_id, username: name, avatar }}
					style="width:40px;height:40px;min-width:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:white;margin-top:2px;overflow:hidden;background-size:cover;background-position:center;background:{avatar ? 'transparent' : getAvatarColor(name)};cursor:pointer;flex-shrink:0;"
				>
					{#if avatar}
						<img src={avatar} alt="" style="width:100%;height:100%;object-fit:cover;" />
					{:else}
						{getInitials(name)}
					{/if}
				</div>
				<div style="flex:1;min-width:0;">
					<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px;">
						<span
							onclick={() => showProfileCard = p || { id: msg.sender_id, username: name, avatar }}
							style="color:{getAvatarColor(name)};font-size:15px;font-weight:500;cursor:pointer;"
						>
							{name}
						</span>
						<span style="font-size:11px;color:var(--text-muted);">{formatTime(msg.created_at)}</span>
						{#if msg.edited}<span style="font-size:11px;color:var(--text-muted);font-style:italic;">(edited)</span>{/if}
					</div>
					{#if msg.reply_to}
						<div style="padding:4px 12px;margin-bottom:4px;background:var(--bg-accent);border-radius:6px;border-left:3px solid var(--accent);font-size:13px;color:var(--text-muted);">
							<span style="color:var(--accent);font-weight:600;">{msg.reply_to.username}</span>
							<span>{msg.reply_to.text || ''}</span>
						</div>
					{/if}

					{#if isImage}
						{#if msg.text}<div style="font-size:15px;color:var(--text-secondary);">{msg.text}</div>{/if}
						<img src={msg.media_data} alt="" style="max-width:400px;max-height:300px;border-radius:8px;margin-top:4px;cursor:pointer;" />
					{:else if isFile && msg.media_data}
						{@const fd = typeof msg.media_data === 'string' ? JSON.parse(msg.media_data) : msg.media_data}
						{#if msg.text}<div style="font-size:15px;color:var(--text-secondary);">{msg.text}</div>{/if}
						<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-accent);border-radius:8px;margin-top:4px;color:var(--accent);font-size:14px;">
							<FileText size={18} />
							<a href={fd.data} download={fd.name} style="color:var(--accent);">{fd.name}</a>
						</div>
					{:else}
						<div style="font-size:15px;color:var(--text-secondary);line-height:1.4;word-wrap:break-word;white-space:pre-wrap;">{@html formatMarkdown(highlightMentions(escapeHtml(msg.text)))}</div>
					{/if}

					{#if msg.reactions && Object.keys(msg.reactions).length > 0}
						<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
							{#each Object.entries(msg.reactions) as [emoji, users]}
								<span
									onclick={() => handleReaction(msg.id, emoji)}
									style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:8px;background:var(--bg-accent);border:1px solid transparent;font-size:14px;cursor:pointer;transition:background 0.1s;"
								>
									{emoji}
									<span style="font-size:11px;font-weight:600;color:var(--text-muted);">{(users as string[]).length}</span>
								</span>
							{/each}
						</div>
					{/if}
					<div style="display:flex;gap:8px;margin-top:6px;">
						<button onclick={() => startReply(msg)} style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;padding:0;">
							Reply
						</button>
						{#if isOwnMessage}
							<button onclick={() => onDeleteMessage(msg)} style="background:none;border:none;color:var(--danger);font-size:12px;cursor:pointer;padding:0;">
								Delete
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
		<div bind:this={messagesEnd}></div>
	</div>

	<div style="padding:0 16px 16px;position:relative;">
		{#if replyTo}
			<div style="display:flex;align-items:center;gap:8px;padding:6px 16px;background:var(--bg-accent);border-top:1px solid var(--border);font-size:13px;color:var(--text-muted);">
				<span style="flex:1;">
					<strong style="color:var(--accent);">{replyTo.username}</strong> {replyTo.text || ''}
				</span>
				<button onclick={() => replyTo = null} style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">
					<X size={16} />
				</button>
			</div>
		{/if}

		{#if previewImage}
			<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-accent);border-radius:8px 8px 0 0;">
				<img src={previewImage} alt="" style="height:60px;width:auto;border-radius:4px;" />
				<span style="font-size:12px;color:var(--text-muted);flex:1;">Image attached</span>
				<button onclick={cancelPreview} style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">
					<X size={16} />
				</button>
			</div>
		{/if}
		{#if previewFile}
			<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-accent);border-radius:8px 8px 0 0;">
				<FileText size={16} />
				<span style="font-size:13px;color:var(--text-secondary);flex:1;">{previewFile.name}</span>
				<button onclick={cancelPreview} style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">
					<X size={16} />
				</button>
			</div>
		{/if}
		{#if spamError}
			<div style="padding:0 4px 8px;font-size:12px;color:var(--danger);">
				{spamError}{#if cooldownSeconds > 0} Try again in {cooldownSeconds}s.{/if}
			</div>
		{/if}
		{#if sendError}
			<div style="padding:0 4px 8px;font-size:12px;color:var(--danger);">
				{sendError}
			</div>
		{/if}

		<div style="display:flex;gap:4px;background:var(--input-bg);border-radius:8px;padding:4px 8px;border:1px solid transparent;">
			<button
				onclick={handleAttachClick}
				style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:8px 4px;display:flex;align-items:center;flex-shrink:0;"
				title="Attach file"
			>
				<Paperclip size={20} />
			</button>
			<button
				onclick={() => { showEmojiPicker = !showEmojiPicker; attachMenuOpen = false; }}
				style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:8px 4px;display:flex;align-items:center;flex-shrink:0;"
				title="Emoji"
			>
				<Smile size={20} />
			</button>
			<input type="file" id="image-upload-input" accept="image/*" style="display:none" onchange={handleImageUpload} />
			<input type="file" id="file-upload-input" style="display:none" onchange={handleFileUpload} />
			{#if attachMenuOpen}
				<div style="position:absolute;bottom:52px;left:16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;overflow:hidden;z-index:100;box-shadow:0 4px 12px var(--shadow);">
					<button
						onclick={() => { document.getElementById('image-upload-input')?.click(); attachMenuOpen = false; }}
						style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:none;border:none;color:var(--text-primary);font-size:14px;cursor:pointer;width:100%;text-align:left;transition:background 0.1s;"
					>
						<Image size={18} />
						Upload Image
					</button>
					<button
						onclick={() => { document.getElementById('file-upload-input')?.click(); attachMenuOpen = false; }}
						style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:none;border:none;color:var(--text-primary);font-size:14px;cursor:pointer;width:100%;text-align:left;transition:background 0.1s;"
					>
						<FileText size={18} />
						Upload File
					</button>
				</div>
			{/if}
			<textarea
				bind:value={inputText}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
					if (e.key === 'Escape') { replyTo = null; editMessageId = null; inputText = ''; }
				}}
				placeholder="Message #{currentChannel}"
				maxlength="2000"
				rows="1"
				style="flex:1;background:none;border:none;outline:none;color:var(--text-primary);font-size:15px;padding:8px 4px;font-family:inherit;resize:none;max-height:120px;min-height:36px;line-height:1.4;"
			></textarea>
			<button
				onclick={sendMessage}
				disabled={cooldownSeconds > 0}
				style="background:{cooldownSeconds > 0 ? 'var(--bg-accent)' : 'var(--accent)'};color:white;border:none;border-radius:4px;padding:8px 14px;font-size:14px;font-weight:500;cursor:{cooldownSeconds > 0 ? 'not-allowed' : 'pointer'};transition:background 0.1s;font-family:inherit;flex-shrink:0;"
			>Send</button>
		</div>

		{#if showEmojiPicker}
			<div
				style="position:absolute;bottom:60px;right:16px;z-index:100;box-shadow:0 4px 12px var(--shadow);"
			>
				<emoji-picker bind:this={emojiPickerEl}></emoji-picker>
			</div>
		{/if}
	</div>
</div>

{#if showProfileCard}
	<ProfileCard
		profile={showProfileCard}
		onClose={() => showProfileCard = null}
	/>
{/if}
