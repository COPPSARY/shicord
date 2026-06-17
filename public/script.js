const socket = io();
let currentUsername = '', currentChannel = 'general', typingTimeout = null, myAvatar = '';
let unreadCounts = {}, onlineUsernames = [], hasFocus = true;
let mentionStart = -1, mentionQuery = '', replyTo = null;
let channelMessageCache = {};

const colors = ['#5865f2','#ed4245','#faa61a','#57f287','#eb459e','#00b0f4','#fee75c','#b545f0'];

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
let voiceActive = false, localStream = null, peerConnections = {}, voiceChannelName = '';
let videoActive = false, screenActive = false, audioMuted = false;

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','🤗','🤔','🤩','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','🤬','👍','👎','👊','✊','🤛','🤜','🤚','👋','🤟','✌️','🤘','👌','✋','🤝','💪','🦵','🦶','👀','🧠','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💖','🔥','⭐','✨','💯','🎉','🎊','🎁','🎈','🎂','🍕','🍔','🌮','🥤','☕','🍺','🍻','💀','🙏','💅','👏','🎃','👻','💩','✅','❌','💪','😈','👽','🤖'];

const STICKERS = ['😎','🔥','💀','🙏','💯','👀','🤝','💪','✨','⭐','🎉','💖','👑','🚀','💸','🫡','🤙','💅','👻','🎃','🤌','🫵','😤','🥶','🤑','🤡','👽','🤖','🎲','♠️','♥️','♦️','♣️','🐱','🐶','🐸','🦊','🐯','🦁','🐮','🐷','🐵','🦄','🐧','🦅','🐙','🦋','🐞','🌺','🌸','🌈','⚡','🍀','🎮','🏆','🥇','💎','🔮','📀','🎵','🎶','❤️‍🔥','💗','🕊️','🌊','🍄','🪐','🚁','🛸','⌛️','🔐','🎭','🎪']; // 74 total

function getAvatarColor(name){let h=0;for(let i=0;i<name.length;i++)h=name.charCodeAt(i)+((h<<5)-h);return colors[Math.abs(h)%colors.length];}
function getInitials(n){return n.slice(0,2).toUpperCase();}
function formatTime(ts){return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function getMsgContainer(){return document.getElementById('messages');}

function autoResize(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,120)+'px';
}

function highlightMentions(t){
  return t.replace(/@everyone/g,'<span class="mention everyone">@everyone</span>').replace(/@(\w+)/g,'<span class="mention">@$1</span>');
}
function formatMarkdown(t){
  return t.replace(/```([\s\S]*?)```/g,'<code class="code-block">$1</code>')
    .replace(/`([^`]+)`/g,'<code class="code-inline">$1</code>')
    .replace(/~~(.+?)~~/g,'<del>$1</del>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^&gt;(.+)/gm,'<blockquote>$1</blockquote>');
}

function addMessage(msg,isSystem){
  const c=getMsgContainer(),el=document.createElement('div');
  if(isSystem){el.className='system-message';el.textContent=msg;c.appendChild(el);scrollToBottom();return;}
  el.className='message';
  const as=msg.avatar?'background-image:url('+msg.avatar+')':'background:'+getAvatarColor(msg.username);
  let replyHtml='';
  if(msg.replyTo){
    replyHtml='<div class="reply-indicator"><span class="reply-author">'+escapeHtml(msg.replyTo.username)+'</span> <span class="reply-preview">'+escapeHtml(msg.replyTo.text||'')+'</span></div>';
  }
  let body='';
  if(msg.type==='image'){
    body=replyHtml+'<div class="message-text">'+escapeHtml(msg.text||'')+'</div><img class="message-image" src="'+msg.mediaData+'" alt="" onclick="openImagePreview(\''+msg.mediaData+'\')">';
  }else if(msg.type==='voice'){
    body=replyHtml+'<div class="message-text"><span style="color:var(--text-muted)">Voice message</span></div><audio class="message-audio" src="'+msg.mediaData+'" controls preload="none"></audio>';
  }else if(msg.type==='sticker'){
    body=replyHtml+'<div class="sticker-message">'+msg.mediaData+'</div>';
  }else if(msg.type==='file'&&msg.mediaData){
    const fd=JSON.parse(msg.mediaData);
    const ext=fd.name.split('.').pop().toLowerCase();
    const isImage=['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
    const iconSvg='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    body=replyHtml+'<div class="message-text">'+escapeHtml(msg.text||fd.name)+'</div>'+(isImage?'<img class="message-image" src="'+fd.data+'" alt="" onclick="openImagePreview(\''+fd.data+'\')">':'<a class="message-file" href="'+fd.data+'" download="'+fd.name+'">'+iconSvg+'<span>'+escapeHtml(fd.name)+' ('+(fd.size>1048576?(fd.size/1048576).toFixed(1)+'MB':(fd.size/1024).toFixed(1)+'KB')+')</span></a>');
  }else{
    body=replyHtml+'<div class="message-text">'+formatMarkdown(highlightMentions(escapeHtml(msg.text)))+'</div>';
  }
  el.setAttribute('data-msg-id',msg.id||'');
  const editedHtml=msg.edited?' <span class="edited-tag">(edited)</span>':'';
  const reactionsHtml=msg.reactions&&Object.keys(msg.reactions).length>0?'<div class="message-reactions">'+Object.entries(msg.reactions).map(([e,u])=>'<span class="reaction-badge" data-emoji="'+e+'">'+e+'<span class="reaction-count">'+u.length+'</span></span>').join('')+'</div>':'';
  el.innerHTML='<div class="message-avatar" style="'+as+'">'+(msg.avatar?'':getInitials(msg.username))+'</div><div class="message-body"><div class="message-header"><span class="message-username" style="color:'+(msg.nameColor||getAvatarColor(msg.username))+'">'+escapeHtml(msg.username)+(msg.badge?' <span class="message-badge">'+msg.badge+'</span>':'')+'</span><span class="message-time">'+formatTime(msg.timestamp)+editedHtml+'</span><div class="message-actions"><span class="message-action add-reaction-btn" title="React">😊</span><span class="message-action message-edit-btn" title="Edit">✏️</span><span class="message-action message-delete-btn" title="Delete">🗑️</span><span class="message-reply-btn">Reply</span></div></div>'+body+reactionsHtml+'</div>';
  c.appendChild(el);
  scrollToBottom();

  el.querySelector('.message-reply-btn')?.addEventListener('click',(e)=>{
    replyTo={id:msg.id,username:msg.username,text:msg.text||(msg.type==='image'?'Image':msg.type==='voice'?'Voice':msg.type==='sticker'?'Sticker':msg.type==='file'?'File':'')};
    document.getElementById('reply-bar').classList.remove('hidden');
    document.getElementById('reply-text').innerHTML='Replying to <strong>'+escapeHtml(replyTo.username)+'</strong> '+escapeHtml(replyTo.text||'');
    document.getElementById('message-input').focus();
  });
  el.querySelector('.message-edit-btn')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    const inp=document.getElementById('message-input');
    inp.value=msg.text||'';inp.focus();autoResize(inp);
    const mid=msg.id,ch=currentChannel;
    document.getElementById('edit-indicator').classList.remove('hidden');
    document.getElementById('edit-indicator').dataset.msgId=mid;
    document.getElementById('edit-indicator').dataset.channel=ch;
  });
  el.querySelector('.message-delete-btn')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(confirm('Delete this message?'))socket.emit('delete message',{messageId:msg.id,channel:currentChannel});
  });
  el.querySelectorAll('.reaction-badge').forEach(b=>{
    b.addEventListener('click',()=>socket.emit('message reaction',{messageId:msg.id,channel:currentChannel,emoji:b.dataset.emoji}));
  });
  const emojiReactionPicker=document.createElement('div');
  emojiReactionPicker.className='reaction-picker hidden';
  emojiReactionPicker.innerHTML=['😀','😂','😍','🔥','💀','🙏','💯','🎉','❤️','👍','👎','😮','😢','😡'].map(e=>'<span class="rp-emoji">'+e+'</span>').join('');
  el.querySelector('.message-body').appendChild(emojiReactionPicker);
  el.querySelector('.add-reaction-btn')?.addEventListener('click',(e)=>{
    e.stopPropagation();
    document.querySelectorAll('.reaction-picker').forEach(p=>{if(p!==emojiReactionPicker)p.classList.add('hidden');});
    emojiReactionPicker.classList.toggle('hidden');
  });
  emojiReactionPicker.querySelectorAll('.rp-emoji').forEach(e=>{
    e.addEventListener('click',()=>{
      socket.emit('message reaction',{messageId:msg.id,channel:currentChannel,emoji:e.textContent});
      emojiReactionPicker.classList.add('hidden');
    });
  });
}

function scrollToBottom(){getMsgContainer().scrollTop=getMsgContainer().scrollHeight;}

function loadMessages(msgs){getMsgContainer().innerHTML='';msgs.forEach(m=>addMessage(m));}

function renderAvatar(el,un,av){
  if(av){el.style.backgroundImage='url('+av+')';el.style.background='';el.textContent='';}
  else{el.style.backgroundImage='';el.style.background=getAvatarColor(un);el.textContent=getInitials(un);}
}

function switchChannel(ch){
  currentChannel=ch;
  document.querySelectorAll('.channel-item').forEach(e=>e.classList.toggle('active',e.dataset.channel===ch));
  document.getElementById('channel-name').textContent='# '+ch;
  document.getElementById('message-input').placeholder='Message #'+ch;
  getMsgContainer().innerHTML='';
  document.getElementById('typing-indicator').textContent='';
  unreadCounts[ch]=0;updateBadges();
  replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
  socket.emit('switch channel',ch);
}

function updateBadges(){
  let total=0;
  document.querySelectorAll('.channel-item').forEach(el=>{
    const ch=el.dataset.channel,c=unreadCounts[ch]||0;
    let b=el.querySelector('.channel-badge');
    if(c>0){
      total+=c;
      if(b)b.textContent=c>99?'99+':c;
      else{const x=document.createElement('span');x.className='channel-badge';x.textContent=c>99?'99+':c;el.appendChild(x);}
    }else if(b)b.remove();
  });
  document.title=total>0?'('+total+') Shicord':'Shicord';
}

function playNotificationSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),g=ctx.createGain();
    osc.connect(g);g.connect(ctx.destination);osc.frequency.value=520;osc.type='sine';
    g.gain.setValueAtTime(0.12,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.12);
    osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.12);
  }catch(e){}
}

function showBrowserNotification(title,body){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  try{new Notification(title,{body,icon:'/favicon.ico'});}catch(e){}
}

function updateMembers(users){
  const list=document.getElementById('members-list');
  list.innerHTML=users.map(u=>{
    const as=u.avatar?'background-image:url('+u.avatar+')':'background:'+getAvatarColor(u.username);
    const nc=u.nameColor||'';
    const badge=u.badge||'';
    return '<div class="member-item"><div class="member-status"></div><div class="member-avatar" style="'+as+'">'+(u.avatar?'':getInitials(u.username))+'</div><span style="color:'+nc+'">'+(badge?'<span class="member-badge">'+badge+'</span> ':'')+escapeHtml(u.username)+'</span></div>';
  }).join('');
  document.getElementById('online-count').textContent=users.length+' online';
}

function openImagePreview(src){
  const e=document.getElementById('image-preview-container');if(e)e.remove();
  const d=document.createElement('div');d.id='image-preview-container';d.innerHTML='<img src="'+src+'" alt="">';
  d.onclick=()=>d.remove();document.body.appendChild(d);
}

// ---- Join Modal ----
document.getElementById('modal-join-btn').addEventListener('click',()=>{
  const name=document.getElementById('modal-username').value.trim()||'User';
  currentUsername=name;
  socket.emit('join',{username:name,channel:'general',avatar:myAvatar});
  document.getElementById('username-modal').classList.add('hidden');
  if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();
});
document.getElementById('modal-username').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('modal-join-btn').click();});

// ---- Socket ----
socket.on('init',data=>{
  currentUsername=data.username;
  document.getElementById('username-display').textContent=currentUsername;
  renderAvatar(document.getElementById('user-avatar'),currentUsername,myAvatar);
  data.channels.forEach(ch=>unreadCounts[ch]=0);
  document.getElementById('channels').innerHTML=data.channels.map(ch=>'<div class="channel-item'+(ch==='general'?' active':'')+'" data-channel="'+ch+'"><span class="hash">#</span><span>'+ch+'</span></div>').join('');
  document.querySelectorAll('.channel-item').forEach(el=>el.addEventListener('click',()=>switchChannel(el.dataset.channel)));
});

socket.on('channel history',data=>{
  currentChannel=data.channel;
  document.getElementById('channel-name').textContent='# '+data.channel;
  document.getElementById('channel-topic').textContent=data.topic||'';
  channelMessageCache[data.channel]=data.messages||[];
  loadMessages(data.messages||[]);
});

socket.on('chat message',msg=>{
  if(channelMessageCache[currentChannel])channelMessageCache[currentChannel].push(msg);
  if(msg.username!==currentUsername){
    addMessage(msg);playNotificationSound();
    if(currentChannel!==msg.channel){unreadCounts[msg.channel]=(unreadCounts[msg.channel]||0)+1;updateBadges();}
    if(msg.text&&(msg.text.indexOf('@'+currentUsername)!==-1||msg.text.indexOf('@everyone')!==-1))
      showBrowserNotification('Shicord - Mentioned by '+msg.username,msg.text.slice(0,80));
  }else addMessage(msg);
});

socket.on('online users',updateMembers);
socket.on('online list',list=>onlineUsernames=list);

socket.on('username changed',name=>{
  currentUsername=name;document.getElementById('username-display').textContent=name;
  renderAvatar(document.getElementById('user-avatar'),name,myAvatar);
});

socket.on('user avatar',data=>{
  document.querySelectorAll('.member-item').forEach(m=>{
    const s=m.querySelector('span');if(s&&s.textContent===data.username){const a=m.querySelector('.member-avatar');if(a)renderAvatar(a,data.username,data.avatar);}
  });
});

socket.on('mention',data=>{
  playNotificationSound();showBrowserNotification('@'+data.from+' mentioned you in #'+data.channel,data.text);
  if(data.channel!==currentChannel){unreadCounts[data.channel]=(unreadCounts[data.channel]||0)+1;updateBadges();}
});

socket.on('message edited',data=>{
  const el=document.querySelector('[data-msg-id="'+data.messageId+'"]');
  if(el){
    const txt=el.querySelector('.message-text');
    if(txt)txt.innerHTML=formatMarkdown(highlightMentions(escapeHtml(data.newText)));
    let et=el.querySelector('.edited-tag');
    if(!et){et=document.createElement('span');et.className='edited-tag';et.textContent='(edited)';el.querySelector('.message-time').after(et);}
  }
});
socket.on('message deleted',data=>{
  const el=document.querySelector('[data-msg-id="'+data.messageId+'"]');
  if(el)el.remove();
});
socket.on('message reaction',data=>{
  const el=document.querySelector('[data-msg-id="'+data.messageId+'"]');
  if(el){
    let container=el.querySelector('.message-reactions');
    if(!container&&Object.keys(data.reactions).length>0){
      container=document.createElement('div');container.className='message-reactions';
      el.querySelector('.message-body').appendChild(container);
    }
    if(container){
      container.innerHTML=Object.entries(data.reactions).map(([e,u])=>'<span class="reaction-badge" data-emoji="'+e+'">'+e+'<span class="reaction-count">'+u.length+'</span></span>').join('');
      container.querySelectorAll('.reaction-badge').forEach(b=>b.addEventListener('click',()=>socket.emit('message reaction',{messageId:data.messageId,channel:currentChannel,emoji:b.dataset.emoji})));
    }
  }
});
socket.on('channels',list=>{
  document.getElementById('channels').innerHTML=list.map(ch=>'<div class="channel-item'+(ch===currentChannel?' active':'')+'" data-channel="'+ch+'"><span class="hash">#</span><span>'+ch+'</span></div>').join('');
  document.querySelectorAll('.channel-item').forEach(el=>el.addEventListener('click',()=>switchChannel(el.dataset.channel)));
});
socket.on('force switch',ch=>{switchChannel(ch);});
socket.on('channel error',msg=>alert(msg));

// ---- Avatar ----
document.getElementById('user-avatar').onclick=()=>document.getElementById('avatar-input').click();
document.getElementById('avatar-input').onchange=function(){
  const f=this.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{myAvatar=e.target.result;renderAvatar(document.getElementById('user-avatar'),currentUsername,myAvatar);socket.emit('update avatar',myAvatar);};
  r.readAsDataURL(f);this.value='';
};

// ---- Invite ----
document.getElementById('invite-btn').onclick=async function(){
  try{const r=await fetch('/api/invite',{method:'POST'});const d=await r.json();document.getElementById('invite-link-input').value=d.link;}catch(e){document.getElementById('invite-link-input').value=window.location.origin;}
  document.getElementById('invite-modal').classList.remove('hidden');
};
document.getElementById('invite-copy-btn').onclick=function(){
  const i=document.getElementById('invite-link-input');i.select();navigator.clipboard.writeText(i.value).catch(()=>{});
  this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000);
};
document.getElementById('invite-close-btn').onclick=()=>document.getElementById('invite-modal').classList.add('hidden');
document.getElementById('invite-modal').onclick=function(e){if(e.target===this)this.classList.add('hidden');};
document.getElementById('reply-close-btn').onclick=()=>{replyTo=null;document.getElementById('reply-bar').classList.add('hidden');};

// ---- Voice (WebRTC) with polite peer ----
const voiceModal=document.getElementById('voice-modal');
document.querySelector('.voice-channel').onclick=()=>{
  if(voiceActive)return;
  voiceChannelName='general';voiceModal.classList.remove('hidden');
  document.getElementById('voice-status').textContent='Connecting to voice...';
  document.getElementById('voice-videos').classList.add('hidden');
  document.getElementById('voice-controls').classList.remove('hidden');
  startVoice();
};

async function startVoice(){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    voiceActive=true;audioMuted=false;
    document.getElementById('local-video').srcObject=localStream;
    socket.emit('voice join',voiceChannelName);
    document.getElementById('voice-status').textContent='Connected - Voice Active';
  }catch(e){document.getElementById('voice-status').textContent='Failed: '+e.message;}
}

function stopVoice(){
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  Object.values(peerConnections).forEach(pc=>pc.close());peerConnections={};
  voiceActive=false;videoActive=false;screenActive=false;
  socket.emit('voice leave');
  voiceModal.classList.add('hidden');document.getElementById('voice-participants').innerHTML='';
  document.getElementById('voice-videos').classList.add('hidden');
  const rv=document.getElementById('remote-videos');rv.innerHTML='';
}

let makingOffer=false, polite=true;
let ignoreOffer=false;

function createPC(targetId,isPolite){
  polite=isPolite;
  if(peerConnections[targetId]){peerConnections[targetId].close();delete peerConnections[targetId];}
  const pc=new RTCPeerConnection(rtcConfig);
  peerConnections[targetId]=pc;
  if(localStream)localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));

  pc.onicecandidate=e=>{if(e.candidate)socket.emit('voice ice',{to:targetId,candidate:e.candidate});};

  pc.ontrack=e=>{
    const container=document.getElementById('remote-videos');
    let v=container.querySelector('[data-peer="'+targetId+'"]');
    if(!v){
      v=document.createElement('video');v.dataset.peer=targetId;v.autoplay=true;v.playsInline=true;
      const div=document.createElement('div');div.className='remote-video-wrap';div.style='position:relative;display:inline-block;';
      div.appendChild(v);
      const lbl=document.createElement('span');lbl.className='video-label';lbl.textContent='Remote';
      div.appendChild(lbl);container.appendChild(div);
    }
    if(e.streams[0])v.srcObject=e.streams[0];
  };

  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='failed'||pc.connectionState==='disconnected'){
      pc.close();delete peerConnections[targetId];
      const v=document.querySelector('[data-peer="'+targetId+'"]');if(v){const p=v.parentElement;p.remove();}
      updateVoiceParticipants();
    }
  };

  pc.onnegotiationneeded=async()=>{
    try{
      makingOffer=true;
      await pc.setLocalDescription(await pc.createOffer());
      if(polite) { makingOffer=false; return; }
      socket.emit('voice offer',{to:targetId,offer:pc.localDescription});
    }catch(e){console.error(e);}finally{makingOffer=false;}
  };

  return pc;
}

socket.on('voice peers',peers=>{
  peers.forEach(p=>{const pc=createPC(p.socketId,false);pc.onnegotiationneeded();});
  updateVoiceParticipants();
});

socket.on('voice peer joined',data=>{
  const pc=createPC(data.socketId,false);pc.onnegotiationneeded();
  updateVoiceParticipants();
});

socket.on('voice peer left',id=>{
  if(peerConnections[id]){peerConnections[id].close();delete peerConnections[id];}
  const v=document.querySelector('[data-peer="'+id+'"]');if(v){const p=v.parentElement;p.remove();}
  updateVoiceParticipants();
});

socket.on('voice offer',async({from,offer})=>{
  try{
    if(makingOffer&&from>socket.id){
      await peerConnections[from]?.setLocalDescription({type:'rollback'});
    }
    if(ignoreOffer&&from>socket.id) return;
    const pc=peerConnections[from]||createPC(from,true);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await pc.setLocalDescription(await pc.createAnswer());
    socket.emit('voice answer',{to:from,answer:pc.localDescription});
  }catch(e){console.error(e);}
});

socket.on('voice answer',async({from,answer})=>{
  const pc=peerConnections[from];
  if(pc&&pc.remoteDescription&&!pc.currentRemoteDescription){
    try{await pc.setRemoteDescription(new RTCSessionDescription(answer));}catch(e){}
  }
});

socket.on('voice ice',async({from,candidate})=>{
  const pc=peerConnections[from];
  if(pc){try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(e){}}
});

function updateVoiceParticipants(){
  const count=Object.keys(peerConnections).length+1;
  const div=document.getElementById('voice-participants');
  div.innerHTML='<div class="voice-participant"><div class="speaking-indicator"></div><span>'+escapeHtml(currentUsername)+' (You)</span></div>';
  document.getElementById('voice-status').textContent=count+' in voice';
}

document.getElementById('voice-leave-btn').onclick=stopVoice;
voiceModal.onclick=function(e){if(e.target===this)stopVoice();};

// Camera toggle
document.getElementById('voice-video-btn').onclick=async function(){
  if(!voiceActive)return;
  if(!videoActive){
    try{
      const vs=await navigator.mediaDevices.getUserMedia({video:true});
      vs.getTracks().forEach(t=>{
        localStream.addTrack(t);
        Object.values(peerConnections).forEach(pc=>{
          pc.addTrack(t,localStream);
          pc.onnegotiationneeded();
        });
      });
      document.getElementById('local-video').srcObject=localStream;
      document.getElementById('voice-videos').classList.remove('hidden');
      videoActive=true;
    }catch(e){}
  }
};

// Screen share
document.getElementById('voice-screen-btn').onclick=async function(){
  if(!voiceActive||screenActive)return;
  try{
    const ss=await navigator.mediaDevices.getDisplayMedia({video:true});
    ss.getTracks().forEach(t=>{
      localStream.addTrack(t);
      Object.values(peerConnections).forEach(pc=>{
        pc.addTrack(t,localStream);
        pc.onnegotiationneeded();
      });
      t.onended=()=>{screenActive=false;};
    });
    document.getElementById('local-video').srcObject=localStream;
    document.getElementById('voice-videos').classList.remove('hidden');
    screenActive=true;
  }catch(e){}
};

// Mute toggle
document.getElementById('voice-mute-btn').onclick=function(){
  if(!voiceActive)return;
  audioMuted=!audioMuted;
  localStream.getAudioTracks().forEach(t=>t.enabled=!audioMuted);
  this.style.opacity=audioMuted?'0.5':'1';
};

// ---- Emoji Picker (stays open on click) ----
const emojiPicker=document.getElementById('emoji-picker');
EMOJIS.forEach(e=>{
  const el=document.createElement('div');el.className='emoji-item';el.textContent=e;
  el.onclick=()=>{
    const inp=document.getElementById('message-input');
    const start=inp.selectionStart,end=inp.selectionEnd;
    inp.value=inp.value.slice(0,start)+e+inp.value.slice(end);
    inp.selectionStart=inp.selectionEnd=start+e.length;
    inp.focus();autoResize(inp);
  };
  emojiPicker.appendChild(el);
});
document.getElementById('emoji-btn').onclick=function(e){
  e.stopPropagation();
  const sp=document.getElementById('sticker-picker');sp.classList.add('hidden');
  emojiPicker.classList.toggle('hidden');
};
document.addEventListener('click',e=>{
  if(!emojiPicker.contains(e.target)&&e.target!==document.getElementById('emoji-btn'))emojiPicker.classList.add('hidden');
  if(!document.getElementById('sticker-picker').contains(e.target)&&e.target!==document.getElementById('sticker-btn'))document.getElementById('sticker-picker').classList.add('hidden');
});

// ---- Sticker Picker ----
const stickerPicker=document.getElementById('sticker-picker');
STICKERS.forEach(s=>{
  const el=document.createElement('div');el.className='sticker-item';el.textContent=s;
  el.onclick=()=>{
    socket.emit('media message',{text:'',type:'sticker',mediaData:s,replyTo:replyTo||undefined});
    replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
    stickerPicker.classList.add('hidden');
  };
  stickerPicker.appendChild(el);
});
document.getElementById('sticker-btn').onclick=function(e){
  e.stopPropagation();
  document.getElementById('emoji-picker').classList.add('hidden');
  stickerPicker.classList.toggle('hidden');
};

// ---- Image Upload ----
document.getElementById('image-btn').onclick=()=>document.getElementById('image-input').click();
document.getElementById('image-input').onchange=function(){
  const f=this.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    socket.emit('media message',{text:'',type:'image',mediaData:e.target.result,replyTo:replyTo||undefined});
    replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
  };
  r.readAsDataURL(f);this.value='';
};

// ---- File Upload (any type) ----
document.getElementById('file-btn').onclick=()=>document.getElementById('file-input').click();
document.getElementById('file-input').onchange=function(){
  const f=this.files[0];if(!f)return;
  const maxSize=10*1024*1024;
  if(f.size>maxSize){alert('File too large (max 10MB)');this.value='';return;}
  const r=new FileReader();
  r.onload=e=>{
    const fileData={name:f.name,size:f.size,type:f.type,data:e.target.result};
    socket.emit('media message',{text:f.name,type:'file',mediaData:JSON.stringify(fileData),replyTo:replyTo||undefined});
    replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
  };
  r.readAsDataURL(f);this.value='';
};

// ---- Search ----
document.getElementById('search-btn').onclick=function(){
  const inp=document.getElementById('search-input');
  inp.style.display=inp.style.display==='none'?'block':'none';
  if(inp.style.display==='block'){inp.value='';inp.focus();loadMessages(channelMessageCache[currentChannel]||[]);}
};
document.getElementById('search-input').addEventListener('input',function(){
  const q=this.value.trim().toLowerCase();
  const msgs=channelMessageCache[currentChannel]||[];
  if(!q){loadMessages(msgs);return;}
  const filtered=msgs.filter(m=>(m.text||'').toLowerCase().includes(q));
  getMsgContainer().innerHTML='';
  if(filtered.length===0){getMsgContainer().innerHTML='<div class="system-message">No messages match "'+escapeHtml(q)+'"</div>';return;}
  filtered.forEach(m=>addMessage(m));
});

// ---- Channel Create/Delete ----
document.getElementById('create-channel-btn').onclick=()=>{
  const name=prompt('Enter channel name (letters, numbers, hyphens):');
  if(name)socket.emit('create channel',{name});
};
document.addEventListener('click',function(e){
  const ch=e.target.closest('.channel-item');
  if(ch&&ch.dataset.channel&&e.ctrlKey){
    const name=ch.dataset.channel;
    if(name==='general')return;
    if(confirm('Delete #'+name+'?'))socket.emit('delete channel',{name});
  }
});

// ---- Voice Msg Recording ----
let mediaRecorder=null,audioChunks=[],recordingInterval=null,recordingSeconds=0;
document.getElementById('voice-msg-btn').onclick=async function(){
  if(mediaRecorder&&mediaRecorder.state==='recording'){mediaRecorder.stop();return;}
  try{
    const s=await navigator.mediaDevices.getUserMedia({audio:true});
    mediaRecorder=new MediaRecorder(s);audioChunks=[];recordingSeconds=0;
    mediaRecorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.push(e.data);};
    mediaRecorder.onstop=()=>{
      s.getTracks().forEach(t=>t.stop());this.classList.remove('recording');
      document.getElementById('recording-timer').classList.add('hidden');clearInterval(recordingInterval);
      const blob=new Blob(audioChunks,{type:'audio/webm'});
      if(blob.size>1000){
        const r=new FileReader();
        r.onload=e=>{socket.emit('media message',{text:'',type:'voice',mediaData:e.target.result,replyTo:replyTo||undefined});replyTo=null;document.getElementById('reply-bar').classList.add('hidden');};
        r.readAsDataURL(blob);
      }
      audioChunks=[];mediaRecorder=null;
    };
    mediaRecorder.start(100);this.classList.add('recording');
    document.getElementById('recording-timer').classList.remove('hidden');
    document.getElementById('recording-timer').textContent='0:00';
    recordingInterval=setInterval(()=>{
      recordingSeconds++;const m=Math.floor(recordingSeconds/60),s=recordingSeconds%60;
      document.getElementById('recording-timer').textContent=m+':'+(s<10?'0':'')+s;
      if(recordingSeconds>=60&&mediaRecorder&&mediaRecorder.state==='recording')mediaRecorder.stop();
    },1000);
  }catch(e){}
};

// ---- @Mention Autocomplete ----
const mentionDrop=document.getElementById('mention-dropdown');
let mentionFiltered=[],mentionSelectedIndex=-1;

document.getElementById('message-input').addEventListener('input',function(){
  autoResize(this);
  const val=this.value,cp=this.selectionStart,bc=val.slice(0,cp),ai=bc.lastIndexOf('@');
  if(ai!==-1&&(ai===0||bc[ai-1]===' ')){
    const aa=bc.slice(ai+1),hs=aa.indexOf(' ')!==-1;
    if(!hs){
      mentionStart=ai;mentionQuery=aa.toLowerCase();
      mentionFiltered=onlineUsernames.filter(u=>u.toLowerCase().indexOf(mentionQuery)===0&&u!==currentUsername);
      if(mentionFiltered.length>0){showMentionDrop();return;}
    }
  }
  hideMentionDrop();
});

document.getElementById('message-input').addEventListener('keydown',function(e){
  if(!mentionDrop.classList.contains('hidden')){
    if(e.key==='ArrowDown'){e.preventDefault();mentionSelectedIndex=Math.min(mentionSelectedIndex+1,mentionFiltered.length-1);highlightMentionItem();return;}
    if(e.key==='ArrowUp'){e.preventDefault();mentionSelectedIndex=Math.max(mentionSelectedIndex-1,0);highlightMentionItem();return;}
    if(e.key==='Enter'||e.key==='Tab'){if(mentionSelectedIndex>=0){e.preventDefault();insertMention(mentionFiltered[mentionSelectedIndex]);}return;}
    if(e.key==='Escape'){hideMentionDrop();}
  }
  if(e.key==='Escape'){
    const ei=document.getElementById('edit-indicator');
    if(!ei.classList.contains('hidden')){ei.classList.add('hidden');this.value='';autoResize(this);return;}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
});

function showMentionDrop(){
  mentionDrop.innerHTML=mentionFiltered.map((u,i)=>'<div class="mention-item'+(i===0?' selected':'')+'" data-name="'+u+'"><span>'+escapeHtml(u)+'</span></div>').join('');
  mentionDrop.classList.remove('hidden');mentionSelectedIndex=0;
  mentionDrop.querySelectorAll('.mention-item').forEach(el=>{
    el.onclick=()=>insertMention(el.dataset.name);
    el.onmouseenter=function(){
      mentionDrop.querySelectorAll('.mention-item').forEach((x,i)=>{x.classList.toggle('selected',x===this);if(x===this)mentionSelectedIndex=i;});
    };
  });
}

function hideMentionDrop(){mentionDrop.classList.add('hidden');mentionStart=-1;mentionFiltered=[];mentionSelectedIndex=-1;}
function highlightMentionItem(){mentionDrop.querySelectorAll('.mention-item').forEach((e,i)=>e.classList.toggle('selected',i===mentionSelectedIndex));const s=mentionDrop.querySelector('.selected');if(s)s.scrollIntoView({block:'nearest'});}

function insertMention(u){
  if(mentionStart===-1)return;
  const inp=document.getElementById('message-input'),val=inp.value,cp=inp.selectionStart;
  const sa=val.slice(cp).indexOf(' '),end=sa===-1?val.length:cp+sa;
  inp.value=val.slice(0,mentionStart)+'@'+u+' '+val.slice(cp);
  hideMentionDrop();inp.focus();autoResize(inp);
}

// ---- Send ----
function sendMessage(){
  const inp=document.getElementById('message-input');
  let text=inp.value;
  if(!text.trim())return;

  // /bj command
  const trimmed = text.trim();
  if (trimmed.startsWith('/bj ')) {
    const parts = trimmed.split(/\s+/);
    const action = parts[1] || 'bet';
    const bet = parseInt(parts[2]) || 10;
    socket.emit('blackjack', { action, bet });
    inp.value='';autoResize(inp);socket.emit('typing',false);hideMentionDrop();
    replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
    document.getElementById('edit-indicator').classList.add('hidden');
    return;
  }

  const editIndicator=document.getElementById('edit-indicator');
  if(!editIndicator.classList.contains('hidden')){
    const mid=editIndicator.dataset.msgId,ch=editIndicator.dataset.channel;
    socket.emit('edit message',{messageId:mid,channel:ch,newText:text.trim()});
    editIndicator.classList.add('hidden');
    inp.value='';autoResize(inp);socket.emit('typing',false);hideMentionDrop();
    return;
  }

  if(replyTo){
    socket.emit('chat message',{text:inp.value.trim(),replyTo});
  }else{
    socket.emit('chat message',{text:inp.value.trim()});
  }
  inp.value='';autoResize(inp);
  socket.emit('typing',false);hideMentionDrop();
  replyTo=null;document.getElementById('reply-bar').classList.add('hidden');
}

document.getElementById('send-btn').onclick=sendMessage;

document.getElementById('message-input').addEventListener('input',function(){
  socket.emit('typing',this.value.trim().length>0);
  clearTimeout(typingTimeout);
  typingTimeout=setTimeout(()=>socket.emit('typing',false),1500);
});

socket.on('typing',data=>{document.getElementById('typing-indicator').textContent=data.isTyping?escapeHtml(data.username)+' is typing...':'';});

// ---- Focus ----
document.addEventListener('visibilitychange',()=>{hasFocus=!document.hidden;if(hasFocus){unreadCounts[currentChannel]=0;updateBadges();}});
window.addEventListener('focus',()=>{hasFocus=true;unreadCounts[currentChannel]=0;updateBadges();});
window.addEventListener('blur',()=>{hasFocus=false;});

// ---- Gambling ----
document.getElementById('gamble-btn').onclick=()=>{
  document.getElementById('gamble-modal').classList.remove('hidden');
  socket.emit('gamble balance');
};
document.getElementById('gamble-close-btn').onclick=()=>document.getElementById('gamble-modal').classList.add('hidden');
document.getElementById('gamble-modal').onclick=function(e){if(e.target===this)this.classList.add('hidden');};

document.querySelectorAll('.gamble-choice').forEach(btn=>{
  btn.onclick=function(){
    const bet=parseInt(document.getElementById('gamble-bet').value)||10;
    const choice=this.dataset.choice;
    socket.emit('gamble',{bet,choice});
  };
});

socket.on('gamble result',data=>{
  const r=document.getElementById('gamble-result');
  document.getElementById('gamble-balance').textContent='Balance: '+data.balance;
  if(data.win!==undefined){
    r.classList.remove('hidden','win','lose');
    r.classList.add(data.win?'win':'lose');
    r.innerHTML=(data.win?'YOU WIN! +'+data.bet:'YOU LOSE! -'+data.bet)+'<br><span style="font-size:16px;">It was '+data.outcome+'</span>';
  }
});

// ---- Blackjack (/bj) ----
socket.on('blackjack', data => {
  if (data.error) { addMessage('🃏 ' + data.error, true); return; }
  addMessage('🃏 **Blackjack** — ' + escapeHtml(data.username) + ' — Balance: ' + data.balance, true);
  addMessage('Your hand: ' + data.hand + ' = ' + data.pv, true);
  addMessage('Dealer hand: ' + data.dealerHand + ' = ' + data.dv, true);
  addMessage('→ ' + data.result, true);
});

// ---- Settings ----
document.getElementById('settings-btn').onclick=()=>{document.getElementById('settings-username').value=currentUsername;document.getElementById('settings-modal').classList.remove('hidden');};
document.getElementById('settings-close-btn').onclick=()=>document.getElementById('settings-modal').classList.add('hidden');
document.getElementById('settings-save-btn').onclick=()=>{const n=document.getElementById('settings-username').value.trim();if(n)socket.emit('change username',n);document.getElementById('settings-modal').classList.add('hidden');};
document.getElementById('settings-modal').onclick=function(e){if(e.target===this)this.classList.add('hidden');};
