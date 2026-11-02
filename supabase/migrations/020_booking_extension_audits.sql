create table if not exists public.booking_extension_audits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by text not null,
  requester_role text not null,
  authorization_mode text not null check (authorization_mode in ('admin_direct', 'manager_approved', 'emergency_override')),
  authorized_by text,
  reason text not null,
  previous_check_out_expected date not null,
  new_check_out_expected date not null,
  previous_total_ghs numeric(10,2) not null,
  new_total_ghs numeric(10,2) not null,
  incremental_amount_ghs numeric(10,2) not null,
  payment_recorded_ghs numeric(10,2) not null default 0,
  payment_method public.pay_method,
  payment_reference text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_extension_audits_booking_id_created_at_idx
  on public.booking_extension_audits (booking_id, created_at desc);

alter table public.booking_extension_audits enable row level security;

grant select, insert on public.booking_extension_audits to authenticated;
grant select, insert on public.booking_extension_audits to service_role;

create policy booking_extension_audits_authenticated_select
  on public.booking_extension_audits
  for select
  to authenticated
  using (true);

create policy booking_extension_audits_authenticated_insert
  on public.booking_extension_audits
  for insert
  to authenticated
  with check (true);