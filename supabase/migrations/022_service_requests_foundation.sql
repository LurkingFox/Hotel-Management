create type public.service_request_category as enum (
  'housekeeping',
  'maintenance',
  'laundry',
  'food',
  'minibar',
  'billing',
  'other'
);

create type public.service_request_priority as enum (
  'low',
  'normal',
  'high',
  'urgent'
);

create type public.service_request_source as enum (
  'guest_portal',
  'reception',
  'manager'
);

create type public.service_request_status as enum (
  'new',
  'acknowledged',
  'assigned',
  'in_progress',
  'completed',
  'cancelled'
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  service_charge_id uuid references public.service_charges(id) on delete set null,
  category public.service_request_category not null,
  priority public.service_request_priority not null default 'normal',
  source public.service_request_source not null default 'reception',
  status public.service_request_status not null default 'new',
  title text not null,
  description text,
  guest_name text,
  requested_by text not null,
  requested_by_role text,
  assigned_staff_id uuid references public.staff(id) on delete set null,
  due_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  completed_at timestamptz,
  completed_by text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_title_present check (nullif(trim(title), '') is not null),
  constraint service_requests_assignee_required check (
    status not in ('assigned', 'in_progress') or assigned_staff_id is not null
  ),
  constraint service_requests_completion_requires_timestamp check (
    status <> 'completed' or completed_at is not null
  )
);

create table if not exists public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null,
  message text not null,
  actor_name text,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint service_request_events_event_type_present check (nullif(trim(event_type), '') is not null),
  constraint service_request_events_message_present check (nullif(trim(message), '') is not null)
);

create or replace function public.touch_service_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_requests_touch_updated_at on public.service_requests;

create trigger service_requests_touch_updated_at
before update on public.service_requests
for each row execute function public.touch_service_request_updated_at();

create index if not exists service_requests_status_priority_created_at_idx
  on public.service_requests (status, priority, created_at desc);

create index if not exists service_requests_booking_id_created_at_idx
  on public.service_requests (booking_id, created_at desc);

create index if not exists service_requests_room_id_created_at_idx
  on public.service_requests (room_id, created_at desc);

create index if not exists service_request_events_request_id_created_at_idx
  on public.service_request_events (service_request_id, created_at desc);

alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;

drop policy if exists service_requests_read_staff on public.service_requests;

create policy service_requests_read_staff
on public.service_requests
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists service_requests_write_staff on public.service_requests;

create policy service_requests_write_staff
on public.service_requests
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists service_request_events_read_staff on public.service_request_events;

create policy service_request_events_read_staff
on public.service_request_events
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists service_request_events_write_staff on public.service_request_events;

create policy service_request_events_write_staff
on public.service_request_events
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));