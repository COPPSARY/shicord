# Shicord

Real-time chat app — a lightweight alternative to Discord. Built with Node.js, Express, and Socket.io.

## Features

- **Text Chat** — real-time messaging with channels, @mentions, reply, edit, delete
- **Markdown** — bold, italic, code, strikethrough, code blocks, blockquotes
- **Emoji & Stickers** — picker with 64 emojis and 74 stickers
- **File Sharing** — image upload (inline preview), file upload (any type, 10MB limit), voice messages (record up to 60s)
- **Voice/Video Calls** — WebRTC mesh with mute, video toggle, screen sharing
- **Gambling** — coin flip and blackjack with server-side balance
- **Shop** — buy custom name colors and badges with coins
- **Notifications** — tab title badge, channel unread badges, browser push, sound, mention pings
- **Channel Management** — create/delete channels
- **Invite Links** — shareable server invite codes
- **Search** — filter loaded messages by text

## Quick Start

```bash
cp .env.example .env   # or just use defaults
npm install
npm start
```

Open `http://localhost:3000`

## Config

Edit `.env` (or let it use defaults):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MAX_MESSAGE_LENGTH` | `2000` | Max characters per message |
| `MESSAGE_HISTORY_LIMIT` | `100` | Messages kept per channel |

## Voice Calls

WebRTC voice requires HTTPS (or localhost). For deployment behind NAT, add a TURN server in `script.js` under `rtcConfig.iceServers`.

## Tech Stack

- **Backend** — Node.js, Express, Socket.io
- **Frontend** — Vanilla JS, WebRTC, MediaRecorder
- **Storage** — In-memory (no database)
