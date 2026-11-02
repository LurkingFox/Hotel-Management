create table if not exists public.room_access_devices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  provider text not null check (provider in ('seam')),
  external_device_id text not null unique,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_access_credentials (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  provider text not null check (provider in ('local_rfid', 'seam')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  local_keycard_id uuid references public.keycards(id) on delete set null,
  provider_reference text,
  provider_device_id text,
  credential_code text,
  issued_to text,
  issued_by text,
  note text,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists booking_access_credentials_provider_reference_key
  on public.booking_access_credentials (provider, provider_reference)
  where provider_reference is not null;

create index if not exists booking_access_credentials_booking_id_idx
  on public.booking_access_credentials (booking_id, status);

create index if not exists room_access_devices_provider_idx
  on public.room_access_devices (provider, room_id);

alter table public.room_access_devices enable row level security;
alter table public.booking_access_credentials enable row level security;

grant select, insert, update, delete on public.room_access_devices to authenticated;
grant select, insert, update, delete on public.booking_access_credentials to authenticated;
grant select, insert, update, delete on public.room_access_devices to service_role;
grant select, insert, update, delete on public.booking_access_credentials to service_role;

create policy room_access_devices_authenticated_select
  on public.room_access_devices
  for select
  to authenticated
  using (true);

create policy room_access_devices_authenticated_insert
  on public.room_access_devices
  for insert
  to authenticated
  with check (true);

create policy room_access_devices_authenticated_update
  on public.room_access_devices
  for update
  to authenticated
  using (true)
  with check (true);

create policy room_access_devices_authenticated_delete
  on public.room_access_devices
  for delete
  to authenticated
  using (true);

create policy booking_access_credentials_authenticated_select
  on public.booking_access_credentials
  for select
  to authenticated
  using (true);

create policy booking_access_credentials_authenticated_insert
  on public.booking_access_credentials
  for insert
  to authenticated
  with check (true);

create policy booking_access_credentials_authenticated_update
  on public.booking_access_credentials
  for update
  to authenticated
  using (true)
  with check (true);

create policy booking_access_credentials_authenticated_delete
  on public.booking_access_credentials
  for delete
  to authenticated
  using (true);