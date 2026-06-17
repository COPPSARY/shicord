const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000;
const MESSAGE_HISTORY_LIMIT = parseInt(process.env.MESSAGE_HISTORY_LIMIT) || 100;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const channels = {
  general: { name: 'general', topic: 'General discussion', messages: [], reactions: {} },
  random: { name: 'random', topic: 'Random stuff', messages: [], reactions: {} },
  tech: { name: 'tech', topic: 'Tech talk', messages: [], reactions: {} },
};

const users = {};
const invites = {};

function generateInviteCode() { return crypto.randomBytes(4).toString('hex'); }

function formatMessage(username, text, type, mediaData, replyTo, extras) {
  return {
    username, text, type: type || 'text',
    mediaData: mediaData || null,
    replyTo: replyTo || null,
    timestamp: Date.now(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    avatar: '',
    reactions: {},
    edited: false,
    nameColor: extras?.nameColor || null,
    badge: extras?.badge || null,
  };
}

function parseMentions(text, channel, senderId) {
  const sender = users[senderId];
  if (!sender) return [];
  const mentioned = [];
  if (text && text.includes('@everyone')) {
    Object.entries(users).forEach(([id, u]) => {
      if (u.channel === channel && id !== senderId) mentioned.push(id);
    });
    return mentioned;
  }
  if (text) {
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const targetName = match[1].toLowerCase();
      Object.entries(users).forEach(([id, u]) => {
        if (u.channel === channel && u.username.toLowerCase() === targetName && id !== senderId && !mentioned.includes(id)) {
          mentioned.push(id);
        }
      });
    }
  }
  return mentioned;
}

app.post('/api/invite', (req, res) => {
  const code = generateInviteCode();
  invites[code] = { createdAt: Date.now(), uses: 0 };
  res.json({ code, link: `${req.protocol}://${req.get('host')}/invite/${code}` });
});

app.get('/invite/:code', (req, res) => {
  if (!invites[req.params.code]) return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  invites[req.params.code].uses++;
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', ({ username, channel, avatar }) => {
    const name = (username || 'Anonymous').trim().slice(0, 32) || 'Anonymous';
    users[socket.id] = { username: name, channel: channel || 'general', avatar: avatar || '', inVoice: false, nameColor: null, badge: null };
    socket.join(users[socket.id].channel);
    socket.emit('channels', Object.keys(channels));
    socket.emit('channel history', { channel: users[socket.id].channel, messages: channels[users[socket.id].channel]?.messages || [], topic: channels[users[socket.id].channel]?.topic || '' });
    socket.emit('init', { username: users[socket.id].username, channels: Object.keys(channels) });
    io.to(users[socket.id].channel).emit('online users', getUsersInChannel(users[socket.id].channel));
    io.to(users[socket.id].channel).emit('user avatar', { username: name, avatar: avatar || '' });
  });

  socket.on('switch channel', (channel) => {
    if (!channels[channel]) return;
    const oldChannel = users[socket.id]?.channel;
    if (oldChannel) socket.leave(oldChannel);
    users[socket.id].channel = channel;
    socket.join(channel);
    socket.emit('channel history', { channel, messages: channels[channel]?.messages || [], topic: channels[channel]?.topic || '' });
    if (oldChannel) io.to(oldChannel).emit('online users', getUsersInChannel(oldChannel));
    io.to(channel).emit('online users', getUsersInChannel(channel));
    socket.emit('online list', getUsersInChannel(channel).map((u) => u.username));
  });

  function broadcastMessage(message, senderId) {
    const user = users[senderId];
    if (!user) return;
    const channel = user.channel;
    if (!channels[channel]) return;
    message.avatar = user.avatar || '';
    message.nameColor = user.nameColor || null;
    message.badge = user.badge || null;
    channels[channel].messages.push(message);
    if (channels[channel].messages.length > MESSAGE_HISTORY_LIMIT) channels[channel].messages.shift();
    io.to(channel).emit('chat message', message);
    const displayText = message.text || (message.type === 'image' ? 'sent an image' : message.type === 'voice' ? 'sent a voice message' : message.type === 'sticker' ? 'sent a sticker' : '');
    const mentioned = parseMentions(displayText, channel, senderId);
    mentioned.forEach((targetId) => io.to(targetId).emit('mention', { from: user.username, channel, text: displayText.length > 50 ? displayText.slice(0, 50) + '...' : displayText }));
  }

  const shopItems = [
    { id: 'namecolor', name: 'Custom Name Color', price: 500, desc: 'Set your name to any color (e.g. /buy namecolor #ff0000)' },
    { id: 'badge', name: 'Premium Badge', price: 300, desc: 'Add a badge emoji next to your name (e.g. /buy badge ⭐)' },
  ];

  function dealerMessage(channel, text) {
    const msg = formatMessage('Dealer', text, 'text', null, null, { nameColor: '#23a55a', badge: '🃏' });
    if (channels[channel]) {
      channels[channel].messages.push(msg);
      if (channels[channel].messages.length > MESSAGE_HISTORY_LIMIT) channels[channel].messages.shift();
    }
    io.to(channel).emit('chat message', msg);
  }

  socket.on('chat message', (msg) => {
    const user = users[socket.id];
    if (!user) return;
    const text = (typeof msg === 'string' ? msg : msg.text || '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) return;
    const replyTo = msg.replyTo || null;
    const message = formatMessage(user.username, text, 'text', null, replyTo);
    broadcastMessage(message, socket.id);
  });

  socket.on('media message', ({ text, type, mediaData, replyTo }) => {
    const user = users[socket.id];
    if (!user) return;
    const message = formatMessage(user.username, text || '', type, mediaData, replyTo || null);
    broadcastMessage(message, socket.id);
  });

  socket.on('typing', (isTyping) => {
    const user = users[socket.id];
    if (!user) return;
    socket.to(user.channel).emit('typing', { username: user.username, isTyping });
  });

  socket.on('change username', (newName) => {
    const user = users[socket.id];
    if (!user) return;
    user.username = (newName || '').trim().slice(0, 32) || user.username;
    socket.emit('username changed', user.username);
    io.to(user.channel).emit('user avatar', { username: user.username, avatar: user.avatar || '' });
    io.to(user.channel).emit('online list', getUsersInChannel(user.channel).map((u) => u.username));
  });

  socket.on('update avatar', (avatarData) => {
    const user = users[socket.id];
    if (!user) return;
    user.avatar = avatarData || '';
    socket.emit('avatar updated', user.avatar);
    io.to(user.channel).emit('user avatar', { username: user.username, avatar: user.avatar });
  });

  // Voice with polite peer pattern
  socket.on('voice join', (channel) => {
    const user = users[socket.id];
    if (!user) return;
    user.inVoice = true;
    user.voiceChannel = channel || user.channel;
    socket.join(`voice:${user.voiceChannel}`);
    const peers = getVoicePeers(user.voiceChannel, socket.id);
    socket.emit('voice peers', peers);
    socket.to(`voice:${user.voiceChannel}`).emit('voice peer joined', { socketId: socket.id, username: user.username });
  });

  socket.on('voice leave', () => {
    const user = users[socket.id];
    if (!user || !user.inVoice) return;
    const vc = user.voiceChannel;
    user.inVoice = false;
    socket.leave(`voice:${vc}`);
    socket.to(`voice:${vc}`).emit('voice peer left', socket.id);
  });

  socket.on('voice offer', ({ to, offer }) => { io.to(to).emit('voice offer', { from: socket.id, offer }); });
  socket.on('voice answer', ({ to, answer }) => { io.to(to).emit('voice answer', { from: socket.id, answer }); });
  socket.on('voice ice', ({ to, candidate }) => { io.to(to).emit('voice ice', { from: socket.id, candidate }); });

  // Gambling
  const balances = {};
  socket.on('gamble', ({ bet, choice }) => {
    const user = users[socket.id];
    if (!user || !user.channel) return;
    const uid = socket.id;
    if (!balances[uid]) balances[uid] = 1000;
    bet = parseInt(bet) || 0;
    if (bet < 1 || bet > balances[uid]) { socket.emit('gamble result', { error: 'Invalid bet. Balance: ' + balances[uid] }); return; }
    const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = outcome === choice;
    if (win) { balances[uid] += bet; } else { balances[uid] -= bet; }
    socket.emit('gamble result', { outcome, win, bet, balance: balances[uid] });
  });
  socket.on('gamble balance', () => {
    const uid = socket.id;
    if (!balances[uid]) balances[uid] = 1000;
    socket.emit('gamble result', { balance: balances[uid] });
  });

  // Chat commands: blackjack, balance, shop, buy
  const blackjackGames = {};
  function createDeck() {
    const suits = ['♠','♥','♦','♣']; const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const d = []; for (const s of suits) for (const r of ranks) d.push({ suit: s, rank: r });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function handValue(h) { let v = 0, a = 0; for (const c of h) { if (c.rank === 'A') { a++; v += 11; } else if (['J','Q','K'].includes(c.rank)) v += 10; else v += parseInt(c.rank); } while (v > 21 && a > 0) { v -= 10; a--; } return v; }
  function bjHand(h) { return h.map(c => c.rank + c.suit).join(' '); }
  function bjHandHid(h) { return h.map((c, i) => i === 0 ? '??' : c.rank + c.suit).join(' '); }

  socket.on('chat command', ({ cmd, args, channel }) => {
    const user = users[socket.id]; if (!user || !channels[channel]) return;
    const uid = socket.id; if (!balances[uid]) balances[uid] = 1000;

    // /balance
    if (cmd === 'balance') {
      dealerMessage(channel, '**' + user.username + '** balance: **' + balances[uid] + '** coins');
      return;
    }

    // /shop
    if (cmd === 'shop') {
      dealerMessage(channel, '**Shop** — ' + user.username + ' (Balance: ' + balances[uid] + ')');
      shopItems.forEach(item => {
        dealerMessage(channel, '**' + item.name + '** — ' + item.price + ' coins\n' + item.desc);
      });
      return;
    }

    // /buy
    if (cmd === 'buy') {
      const itemId = args[0]; const arg = args.slice(1).join(' ');
      const item = shopItems.find(i => i.id === itemId);
      if (!item) { dealerMessage(channel, 'Unknown item. Use /shop to see items.'); return; }
      if (balances[uid] < item.price) { dealerMessage(channel, 'Not enough coins! Need ' + item.price + ', have ' + balances[uid]); return; }

      if (itemId === 'namecolor') {
        const color = arg.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!color) { dealerMessage(channel, 'Invalid color. Use hex like #ff0000'); return; }
        balances[uid] -= item.price;
        user.nameColor = color[0].toLowerCase();
        dealerMessage(channel, user.username + ' bought **Custom Name Color** (' + color[0] + ')');
        io.to(channel).emit('online users', getUsersInChannel(channel));
      } else if (itemId === 'badge') {
        if (!arg) { dealerMessage(channel, 'Specify an emoji badge like /buy badge ⭐'); return; }
        balances[uid] -= item.price;
        user.badge = arg;
        dealerMessage(channel, user.username + ' bought **Premium Badge** ' + arg);
        io.to(channel).emit('online users', getUsersInChannel(channel));
      }
      return;
    }

    // /bj
    if (cmd === 'bj') {
      const game = blackjackGames[uid];
      if (!game || game.state === 'done') {
        const bet = parseInt(args[0]) || 0;
        if (bet < 1 || bet > balances[uid]) { dealerMessage(channel, 'Invalid bet. Balance: ' + balances[uid] + '. Usage: /bj <amount>'); return; }
        const deck = createDeck();
        const ng = { deck, hand: [deck.pop(), deck.pop()], dealerHand: [deck.pop(), deck.pop()], bet, state: 'playing', username: user.username };
        blackjackGames[uid] = ng;
        const pv = handValue(ng.hand);
        dealerMessage(channel, user.username + ' bets **' + bet + '** coins');
        dealerMessage(channel, 'Your hand: ' + bjHand(ng.hand) + ' = **' + pv + '**');
        dealerMessage(channel, 'Dealer: ' + bjHandHid(ng.dealerHand));
        if (pv === 21) {
          ng.state = 'done'; const w = Math.floor(bet * 1.5); balances[uid] += w;
          dealerMessage(channel, '**BLACKJACK!** ' + user.username + ' wins **' + w + '** coins!');
        } else {
          dealerMessage(channel, 'Type /bj hit or /bj stay');
        }
        return;
      }
      if (game.state !== 'playing') return;
      const act = args[0];
      if (act === 'hit') {
        game.hand.push(game.deck.pop()); const pv = handValue(game.hand);
        dealerMessage(channel, user.username + ' hits → ' + bjHand(game.hand) + ' = **' + pv + '**');
        if (pv > 21) {
          game.state = 'done'; balances[uid] -= game.bet;
          dealerMessage(channel, '**Bust!** ' + user.username + ' loses **' + game.bet + '** coins');
        } else if (pv === 21) {
          while (handValue(game.dealerHand) < 17) game.dealerHand.push(game.deck.pop());
          const dv = handValue(game.dealerHand);
          game.state = 'done'; balances[uid] += game.bet;
          dealerMessage(channel, 'Dealer: ' + bjHand(game.dealerHand) + ' = **' + dv + '**');
          dealerMessage(channel, '**21!** ' + user.username + ' wins **' + game.bet + '** coins');
        } else {
          dealerMessage(channel, 'Type /bj hit or /bj stay');
        }
        return;
      }
      if (act === 'stay') {
        while (handValue(game.dealerHand) < 17) game.dealerHand.push(game.deck.pop());
        const pv = handValue(game.hand), dv = handValue(game.dealerHand);
        dealerMessage(channel, 'Dealer: ' + bjHand(game.dealerHand) + ' = **' + dv + '**');
        let result; let won = false;
        if (dv > 21) { result = 'Dealer busts! ' + user.username + ' wins **' + game.bet + '**'; balances[uid] += game.bet; won = true; }
        else if (dv > pv) { result = 'Dealer wins. ' + user.username + ' loses **' + game.bet + '**'; balances[uid] -= game.bet; }
        else if (dv < pv) { result = user.username + ' wins **' + game.bet + '**!'; balances[uid] += game.bet; won = true; }
        else { result = 'Push! Bet returned'; }
        game.state = 'done';
        dealerMessage(channel, result);
        return;
      }
      dealerMessage(channel, 'Usage: /bj hit | /bj stay');
    }
  });

  // Message edit
  socket.on('edit message', ({ messageId, channel, newText }) => {
    if (!channels[channel]) return;
    const msg = channels[channel].messages.find(m => m.id === messageId);
    if (!msg) return;
    msg.text = (newText || '').trim().slice(0, MAX_MESSAGE_LENGTH);
    msg.edited = true;
    io.to(channel).emit('message edited', { messageId, channel, newText: msg.text });
  });

  // Message delete
  socket.on('delete message', ({ messageId, channel }) => {
    if (!channels[channel]) return;
    channels[channel].messages = channels[channel].messages.filter(m => m.id !== messageId);
    io.to(channel).emit('message deleted', { messageId, channel });
  });

  // Emoji reaction
  socket.on('message reaction', ({ messageId, channel, emoji }) => {
    const user = users[socket.id];
    if (!user || !channels[channel]) return;
    const msg = channels[channel].messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    const existing = Object.entries(msg.reactions).find(([e, u]) => e === emoji && u.includes(user.username));
    if (existing) {
      msg.reactions[emoji] = msg.reactions[emoji].filter(u => u !== user.username);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      if (!msg.reactions[emoji].includes(user.username)) msg.reactions[emoji].push(user.username);
    }
    io.to(channel).emit('message reaction', { messageId, channel, reactions: { ...msg.reactions } });
  });

  // Create channel
  socket.on('create channel', ({ name }) => {
    const n = (name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20);
    if (!n || channels[n]) { socket.emit('channel error', 'Invalid or duplicate channel name'); return; }
    channels[n] = { name: n, topic: 'New channel', messages: [], reactions: {} };
    io.emit('channels', Object.keys(channels));
  });

  // Delete channel
  socket.on('delete channel', ({ name }) => {
    if (!name || name === 'general') { socket.emit('channel error', 'Cannot delete general channel'); return; }
    if (!channels[name]) return;
    delete channels[name];
    io.emit('channels', Object.keys(channels));
    Object.entries(users).forEach(([id, u]) => {
      if (u.channel === name) {
        u.channel = 'general';
        socket.leave(name);
        io.to(id).emit('force switch', 'general');
      }
    });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.channel).emit('online users', getUsersInChannel(user.channel));
      if (user.inVoice && user.voiceChannel) socket.to(`voice:${user.voiceChannel}`).emit('voice peer left', socket.id);
    }
    delete users[socket.id];
    delete balances[socket.id];
  });
});

function getUsersInChannel(channel) {
  return Object.values(users).filter((u) => u.channel === channel).map((u) => ({ username: u.username, avatar: u.avatar || '', nameColor: u.nameColor || null, badge: u.badge || null }));
}

function getVoicePeers(channel, excludeSocketId) {
  return Object.entries(users).filter(([id, u]) => u.inVoice && u.voiceChannel === channel && id !== excludeSocketId).map(([id, u]) => ({ socketId: id, username: u.username }));
}

server.listen(PORT, '0.0.0.0', () => { console.log(`Shicord running on http://0.0.0.0:${PORT}`); });
