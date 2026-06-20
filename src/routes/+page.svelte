<script lang="ts">
  import { onMount } from 'svelte';
  import { Pencil } from '@lucide/svelte';
  import { getCurrentAblyClient, getMessageChannel, getPresenceChannel } from '$lib/services/ably';
  import { supabase } from '$lib/supabase';
  import { getGuestAvatar, getGuestId, getGuestName, setGuestAvatar, setGuestName } from '$lib/stores/guestStore';
  import { isVoicePresence } from '$lib/utils/server';
  import ChannelList from '$lib/components/ChannelList.svelte';
  import MessageArea from '$lib/components/MessageArea.svelte';
  import MembersSidebar from '$lib/components/MembersSidebar.svelte';

  const RIP_DC = 'rip-dc';
  const CHANNELS = [
    { server_id: RIP_DC, name: 'general', topic: 'Chat', type: 'text' },
    { server_id: RIP_DC, name: 'Voice', topic: 'Voice chat', type: 'voice' }
  ];

  let channels = $state(CHANNELS);
  let currentChannel = $state('general');
  let messages = $state<any[]>([]);
  let onlineUsers = $state<any[]>([]);
  let loadingOlder = $state(false);
  let canLoadOlder = $state(true);
  let currentMessageChannelUnsub: (() => void) | null = null;
  let presenceUnsub: (() => void) | null = null;
  let presenceChannelRef: any = null;
  let historyOffset = 0;

  const MESSAGE_PAGE_SIZE = 40;

  let guestId = $state('');
  let guestName = $state('');
  let guestAvatar = $state('');
  let showNamePicker = $state(false);
  let nameInput = $state('');
  let connectionState = $state('connecting');
  let voiceParticipants = $derived(onlineUsers.filter((u) => isVoicePresence(u)));
  let memberCount = $derived(onlineUsers.length);
  let isVoiceChannel = $derived(channels.find((c) => c.name === currentChannel)?.type === 'voice');

  onMount(() => {
    guestId = getGuestId();
    guestName = getGuestName();
    guestAvatar = getGuestAvatar();

    if (!guestName) {
      showNamePicker = true;
      return;
    }

    initApp();

    const localVoicePresenceListener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      onlineUsers = upsertUser(onlineUsers, detail);
    };

    window.addEventListener('voicepresence', localVoicePresenceListener as EventListener);

    return () => {
      currentMessageChannelUnsub?.();
      presenceUnsub?.();
      window.removeEventListener('voicepresence', localVoicePresenceListener as EventListener);
    };
  });

  function upsertUser(users: any[], nextUser: any) {
    const index = users.findIndex((user) => user.userId === nextUser.userId);
    if (index === -1) return [...users, nextUser];
    const copy = [...users];
    copy[index] = { ...copy[index], ...nextUser };
    return copy;
  }

  function getMessageKey(message: any) {
    if (message?.id) return `id:${message.id}`;
    if (message?._id) return `opt:${message._id}`;
    return [
      message?.sender_id || 'anon',
      message?.created_at || '',
      message?.msg_type || 'text',
      message?.text || ''
    ].join('|');
  }

  function mergeMessages(nextMessages: any[]) {
    const seen = new Set<string>();
    const merged: any[] = [];

    for (const message of nextMessages) {
      const key = getMessageKey(message);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(message);
    }

    return merged;
  }

  function removeMessageByIdentity(target: any) {
    messages = messages.filter((message) => {
      if (target.id && message.id === target.id) return false;
      if (target._id && message._id === target._id) return false;
      return true;
    });
  }

  async function initApp() {
    await setupPresence();
    await selectChannel(currentChannel);
    setupConnectionStatus();
  }

  function setupConnectionStatus() {
    const client = getCurrentAblyClient();
    if (!client) return;

    connectionState = client.connection.state;

    const listener = (change: any) => {
      connectionState = change.current;
    };

    client.connection.on(listener);

    const previousPresenceUnsub = presenceUnsub;
    presenceUnsub = () => {
      previousPresenceUnsub?.();
      client.connection.off(listener);
    };
  }

  async function setupPresence() {
    const presenceChannel = await getPresenceChannel(guestId);
    presenceChannelRef = presenceChannel;

    const syncPresence = async () => {
      const members = await presenceChannel.presence.get();
      onlineUsers = members.map((member) => ({
        userId: member.clientId,
        username: member.data?.username || 'Guest',
        avatar: member.data?.avatar || '',
        status: member.data?.status || 'online',
        channelName: member.data?.channelName || '',
        peerId: member.data?.peerId || null,
        muted: member.data?.muted || false
      }));
    };

    await presenceChannel.presence.enter({
      username: guestName,
      avatar: guestAvatar,
      status: 'online',
      channelName: '',
      peerId: null,
      muted: false
    });

    await syncPresence();

    const listener = () => {
      syncPresence();
    };

    await presenceChannel.presence.subscribe(['enter', 'update', 'leave'], listener);

    presenceUnsub = () => {
      presenceChannel.presence.unsubscribe(['enter', 'update', 'leave'], listener);
      presenceChannel.presence.leave();
    };
  }

  async function selectChannel(channelName: string) {
    currentChannel = channelName;
    messages = [];
    historyOffset = 0;
    canLoadOlder = true;
    loadingOlder = false;

    currentMessageChannelUnsub?.();
    const messageChannel = await getMessageChannel(guestId, channelName);
    const listener = (message: any) => {
      if (message.data?._kind === 'delete') {
        removeMessageByIdentity(message.data);
        return;
      }
      messages = mergeMessages([...messages, message.data]);
    };

    await messageChannel.subscribe('message', listener);
    await loadPersistedMessages(channelName);

    currentMessageChannelUnsub = () => {
      messageChannel.unsubscribe('message', listener);
    };
  }

  async function loadPersistedMessages(channelName = currentChannel, appendOlder = false) {
    if (!supabase || loadingOlder || !canLoadOlder) return;

    loadingOlder = true;

    try {
      const from = historyOffset;
      const to = historyOffset + MESSAGE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('messages')
        .select('id, server_id, channel_name, sender_id, username, text, msg_type, media_data, reply_to, edited, reactions, avatar, created_at')
        .eq('server_id', RIP_DC)
        .eq('channel_name', channelName)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Failed to load message history:', error);
        return;
      }

      const batch = (data || []).reverse();
      if (channelName !== currentChannel) return;
      historyOffset += batch.length;
      canLoadOlder = batch.length === MESSAGE_PAGE_SIZE;
      messages = appendOlder ? mergeMessages([...batch, ...messages]) : mergeMessages([...batch, ...messages]);
    } finally {
      loadingOlder = false;
    }
  }

  async function sendMessage(message: any) {
    const messageChannel = await getMessageChannel(guestId, currentChannel);
    const payload = {
      ...message,
      sender_id: guestId,
      username: guestName,
      created_at: new Date().toISOString(),
      reactions: {}
    };

    messages = mergeMessages([...messages, payload]);
    await messageChannel.publish('message', payload);
    void persistMessage(payload, currentChannel);
  }

  async function deleteMessage(message: any) {
    removeMessageByIdentity(message);

    const messageChannel = await getMessageChannel(guestId, currentChannel);
    await messageChannel.publish('message', {
      _kind: 'delete',
      id: message.id || null,
      _id: message._id || null
    });

    if (supabase && message.id) {
      const { error } = await supabase.from('messages').delete().eq('id', message.id);
      if (error) {
        console.error('Failed to delete message:', error);
      }
    }
  }

  async function persistMessage(message: any, channelName: string) {
    if (!supabase) return;

    try {
      const { error } = await supabase.from('messages').insert({
        server_id: RIP_DC,
        channel_name: channelName,
        sender_id: message.sender_id || guestId,
        username: message.username || guestName || 'Guest',
        text: message.text || '',
        msg_type: message.msg_type || 'text',
        media_data: message.media_data || null,
        reply_to: message.reply_to || null,
        edited: false,
        reactions: message.reactions || {},
        avatar: message.avatar || '',
        created_at: message.created_at || new Date().toISOString()
      });

      if (error) {
        console.error('Failed to persist message:', error);
      }
    } catch (error) {
      console.error('Failed to persist message:', error);
    }
  }

  async function saveName() {
    const name = nameInput.trim();
    if (!name) return;
    setGuestName(name);
    guestName = name;
    showNamePicker = false;
    onlineUsers = upsertUser(onlineUsers, {
      userId: guestId,
      username: name,
      avatar: guestAvatar,
      status: 'online',
      channelName: '',
      peerId: null,
      muted: false
    });
    await initApp();
  }

  function joinVoiceChannel(channelName: string) {
    currentChannel = channelName;
    const event = new CustomEvent('joinvoice', {
      detail: {
        channelName,
        serverId: RIP_DC,
        userId: guestId,
        username: guestName,
        avatar: guestAvatar
      }
    });
    window.dispatchEvent(event);
  }

  async function handleGuestAvatarUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file || !supabase) return;

    const ext = file.name.split('.').pop() || 'png';
    const filePath = `${guestId}.${ext}`;
    const { error } = await supabase.storage.from('Avatar').upload(filePath, file, {
      upsert: true,
      contentType: file.type
    });
    if (error) {
      console.error('Failed to upload avatar:', error);
      input.value = '';
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('Avatar').getPublicUrl(filePath);
    setGuestAvatar(publicUrl);
    guestAvatar = publicUrl;
    onlineUsers = upsertUser(onlineUsers, {
      userId: guestId,
      username: guestName || 'Guest',
      avatar: publicUrl
    });
    await presenceChannelRef?.presence.update({
      username: guestName || 'Guest',
      avatar: publicUrl,
      status: onlineUsers.find((user) => user.userId === guestId)?.status || 'online',
      channelName: onlineUsers.find((user) => user.userId === guestId)?.channelName || '',
      peerId: onlineUsers.find((user) => user.userId === guestId)?.peerId || null,
      muted: onlineUsers.find((user) => user.userId === guestId)?.muted || false
    });
    input.value = '';
  }
</script>

<div style="display:flex;height:100vh;width:100vw;">
  <div style="width:240px;min-width:240px;background:var(--bg-secondary);display:flex;flex-direction:column;border-right:1px solid var(--border);">
    <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:16px;font-weight:700;color:var(--text-primary);min-height:48px;">
      <span style="flex:1;">rip-dc</span>
      <span style="font-size:11px;color:var(--text-muted);font-weight:400;">{memberCount} online</span>
    </div>
    <div style="flex:1;overflow-y:auto;">
      <ChannelList
        {channels}
        {currentChannel}
        voiceParticipants={voiceParticipants}
        onChannelClick={(ch: string) => selectChannel(ch)}
        onJoinVoice={(ch: string) => joinVoiceChannel(ch)}
      />
    </div>

    <div style="display:flex;align-items:center;gap:6px;padding:8px 8px 0;background:var(--bg-secondary);">
      <a
        href="https://github.com/COPPSARY/shicord"
        target="_blank"
        rel="noreferrer"
        title="GitHub"
        style="width:28px;height:28px;border-radius:8px;background:#181717;display:flex;align-items:center;justify-content:center;overflow:hidden;"
      >
        <img src="https://cdn.simpleicons.org/github/white" alt="GitHub" style="width:16px;height:16px;display:block;" />
      </a>
      <a
        href="https://web.facebook.com/profile.php?id=61567582710788"
        target="_blank"
        rel="noreferrer"
        title="Facebook"
        style="width:28px;height:28px;border-radius:8px;background:#1877F2;display:flex;align-items:center;justify-content:center;overflow:hidden;"
      >
        <img src="https://cdn.simpleicons.org/facebook/white" alt="Facebook" style="width:16px;height:16px;display:block;" />
      </a>
    </div>

    <div style="display:flex;align-items:center;padding:8px;background:var(--bg-tertiary);border-top:1px solid var(--border);min-height:56px;">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <div
          onclick={() => document.getElementById('guest-avatar-input')?.click()}
          style="width:32px;height:32px;min-width:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:white;background:{guestAvatar ? 'transparent' : 'var(--accent)'};background-image:{guestAvatar ? `url(${guestAvatar})` : 'none'};background-size:cover;background-position:center;cursor:pointer;overflow:hidden;"
        >
          {#if !guestAvatar}
            {(guestName || 'GU').slice(0, 2).toUpperCase()}
          {/if}
        </div>
        <input id="guest-avatar-input" type="file" accept="image/jpeg,image/png,image/gif" style="display:none" onchange={handleGuestAvatarUpload} />
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {guestName || 'Guest'}
          </div>
        </div>
        <button
          onclick={() => {
            localStorage.removeItem('shicord_guest_name');
            location.reload();
          }}
          style="background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;color:var(--text-muted);display:flex;align-items:center;justify-content:center;"
          title="Change name"
        >
          <Pencil size={14} />
        </button>
      </div>
    </div>
  </div>

  <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);min-height:48px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:20px;color:var(--text-muted);font-weight:300;">
          {isVoiceChannel ? '🔊' : '#'}
        </span>
        <span style="font-size:15px;font-weight:700;">{currentChannel}</span>
        <span style="font-size:13px;color:var(--text-muted);">
          {channels.find((c) => c.name === currentChannel)?.topic || ''}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:var(--bg-accent);font-size:11px;font-weight:700;text-transform:uppercase;color:{connectionState === 'connected' ? 'var(--green)' : connectionState === 'connecting' ? '#f0b232' : 'var(--danger)'};">
        <span style="width:8px;height:8px;border-radius:50%;background:currentColor;display:block;"></span>
        <span>{connectionState}</span>
      </div>
    </div>

    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      {#if currentChannel === 'general'}
        <div style="padding:12px 16px;margin:8px 12px 0;background:var(--bg-accent);border-radius:8px;border-left:3px solid var(--accent);flex-shrink:0;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">📌 Pinned</div>
          <div style="font-size:14px;color:var(--text-secondary);font-style:italic;">everyone chatting here for now, i can't get the god damn servers to work properly gng..</div>
        </div>
      {/if}
      <MessageArea
        {messages}
        {currentChannel}
        currentServerId={RIP_DC}
        currentView="server"
        currentDMId={null}
        currentDMUserId={null}
        onSendOptimistic={() => {}}
        onSendMessage={sendMessage}
        onDeleteMessage={deleteMessage}
        onLoadOlder={() => loadPersistedMessages(currentChannel, true)}
        {loadingOlder}
        {canLoadOlder}
        profiles={{}}
        {guestId}
        {guestName}
        {guestAvatar}
      />
    </div>
  </div>

  <MembersSidebar members={onlineUsers} />
</div>

{#if showNamePicker}
  <div
    style="position:fixed;inset:0;background:var(--bg-primary);display:flex;align-items:center;justify-content:center;z-index:9999;"
  >
    <div style="width:360px;text-align:center;">
      <h1 style="font-size:28px;font-weight:800;color:var(--text-primary);margin-bottom:4px;">rip-dc</h1>
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:24px;">Pick a name to start chatting</p>
      <input
        type="text"
        bind:value={nameInput}
        placeholder="Your name"
        maxlength="24"
        onkeydown={(e) => { if (e.key === 'Enter') saveName(); }}
        style="width:100%;padding:12px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:16px;text-align:center;outline:none;box-sizing:border-box;"
        autofocus
      />
      <button
        onclick={saveName}
        disabled={!nameInput.trim()}
        style="margin-top:12px;width:100%;padding:12px;border-radius:8px;border:none;background:{nameInput.trim() ? 'var(--accent)' : 'var(--bg-accent)'};color:white;font-size:15px;font-weight:600;cursor:{nameInput.trim() ? 'pointer' : 'default'};"
      >
        Join
      </button>
    </div>
  </div>
{/if}
