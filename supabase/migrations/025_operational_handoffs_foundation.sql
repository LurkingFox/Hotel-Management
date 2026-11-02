create type public.operational_handoff_status as enum ('open', 'acknowledged', 'closed');
create type public.operational_handoff_item_type as enum ('carryover_guest', 'unresolved_request', 'payment_risk', 'vip_arrival', 'room_issue', 'general');
create type public.operational_handoff_priority as enum ('normal', 'high', 'urgent');

create table if not exists public.operational_handoffs (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete set null,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  created_by_name text not null,
  created_by_role text,
  summary text,
  handoff_scope text not null default 'reception',
  status public.operational_handoff_status not null default 'open',
  acknowledged_at timestamptz,
  acknowledged_by text,
  acknowledged_by_staff_id uuid references public.staff(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_handoff_items (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.operational_handoffs(id) on delete cascade,
  item_type public.operational_handoff_item_type not null,
  priority public.operational_handoff_priority not null default 'normal',
  title text not null,
  detail text,
  booking_id uuid references public.bookings(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  owner_role text,
  due_at timestamptz,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_handoffs_status_idx on public.operational_handoffs (status, created_at desc);
create index if not exists operational_handoff_items_handoff_id_idx on public.operational_handoff_items (handoff_id);
create index if not exists operational_handoff_items_resolved_idx on public.operational_handoff_items (resolved, priority);

create or replace function public.touch_operational_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_operational_handoffs_updated_at on public.operational_handoffs;
create trigger touch_operational_handoffs_updated_at
before update on public.operational_handoffs
for each row execute function public.touch_operational_record_updated_at();

drop trigger if exists touch_operational_handoff_items_updated_at on public.operational_handoff_items;
create trigger touch_operational_handoff_items_updated_at
before update on public.operational_handoff_items
for each row execute function public.touch_operational_record_updated_at();

alter table public.operational_handoffs enable row level security;
alter table public.operational_handoff_items enable row level security;

drop policy if exists operational_handoffs_staff_read on public.operational_handoffs;
create policy operational_handoffs_staff_read on public.operational_handoffs
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists operational_handoffs_staff_write on public.operational_handoffs;
create policy operational_handoffs_staff_write on public.operational_handoffs
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists operational_handoff_items_staff_read on public.operational_handoff_items;
create policy operational_handoff_items_staff_read on public.operational_handoff_items
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists operational_handoff_items_staff_write on public.operational_handoff_items;
create policy operational_handoff_items_staff_write on public.operational_handoff_items
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));