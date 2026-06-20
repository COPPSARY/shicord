-- ponytail: guest-only realtime MVP. Drop the legacy Discord schema and keep only persistent chat history.

begin;

-- Legacy teardown
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

drop table if exists public.server_members cascade;
drop table if exists public.dm_conversations cascade;
drop table if exists public.invites cascade;
drop table if exists public.friends cascade;
drop table if exists public.channels cascade;
drop table if exists public.servers cascade;
drop table if exists public.profiles cascade;
drop table if exists public.messages cascade;

-- Minimal persistent chat history
create table public.messages (
	id bigserial primary key,
	server_id text not null default 'rip-dc',
	channel_name text not null default 'general',
	sender_id text not null,
	username text not null check (length(trim(username)) > 0),
	text text not null default '',
	msg_type text not null default 'text' check (msg_type in ('text', 'image', 'file')),
	media_data text,
	reply_to jsonb,
	edited boolean not null default false,
	reactions jsonb not null default '{}'::jsonb,
	avatar text not null default '',
	created_at timestamptz not null default timezone('utc', now()),
	constraint messages_has_payload check (text <> '' or media_data is not null)
);

create index messages_room_created_idx
	on public.messages (server_id, channel_name, created_at desc, id desc);

create index messages_created_idx
	on public.messages (created_at desc, id desc);

alter table public.messages enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on public.messages to anon, authenticated;
grant usage, select on sequence public.messages_id_seq to anon, authenticated;

drop policy if exists "messages_read_all" on public.messages;
drop policy if exists "messages_insert_all" on public.messages;

create policy "messages_read_all"
	on public.messages
	for select
	to anon, authenticated
	using (true);

create policy "messages_insert_all"
	on public.messages
	for insert
	to anon, authenticated
	with check (true);

commit;
