# Shicord

Guest-only realtime MVP. No auth flow, no multi-server system, no message history guarantees beyond what is persisted, just live chat with optional voice.

## Stack

- `Svelte 5` + `SvelteKit 2`
- `Ably Realtime` for chat delivery, presence, and WebRTC signaling
- `Supabase` for message persistence and storage buckets
- native `WebRTC` for voice audio
- `Metered` TURN credentials via server endpoint
- `@lucide/svelte` for icons
- `@sveltejs/adapter-vercel` for deploys

## What It Does

- guest name join
- live chat in `#general`
- one voice channel UI path
- reply and delete own message
- image upload to Supabase storage
- guest avatar upload to Supabase storage
- online presence list

## Environment

Copy `.env.example` to `.env` and fill these in:

```env
ABLY_API_KEY=
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
METERED_DOMAIN=
METERED_API_KEY=
```

The app uses Metered's `turn/credentials?apiKey=...` endpoint, so keep `METERED_API_KEY` in server env and do not expose it to the browser.

Optional older TURN envs are still listed in `.env.example`, but the app now prefers the Metered server endpoint.

## Supabase Setup

1. Run [`supabase-mvp-reset.sql`](./supabase-mvp-reset.sql).
2. Create storage buckets:
   - `Avatar`
   - `Server-images`
3. Add storage policies so public reads and client uploads work for your MVP.

Without Supabase envs, live Ably chat can still connect, but persisted history and uploads will not work.

## Local Dev

```bash
npm install
npm run dev
```

Dev app runs on `http://localhost:5173`.

## Deploy

This repo already uses the Vercel adapter in `vite.config.ts`. You do not need a custom `vercel.json` for the current app.

Add the same env vars in Vercel project settings:

- `ABLY_API_KEY`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `METERED_DOMAIN`
- `METERED_API_KEY`
