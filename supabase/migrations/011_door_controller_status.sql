create table if not exists door_controllers (
  controller_id text primary key,
  room_id uuid references rooms(id),
  heartbeat_status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  last_card_uid text,
  last_result access_result,
  last_note text,
  last_error text,
  firmware_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_controllers_status_valid check (heartbeat_status in ('online', 'degraded', 'offline'))
);

create index if not exists door_controllers_room_id_idx on door_controllers(room_id);
create index if not exists door_controllers_last_seen_at_idx on door_controllers(last_seen_at desc);

alter table door_controllers enable row level security;

drop policy if exists door_controllers_admin on door_controllers;

create policy door_controllers_admin on door_controllers
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');