create type public.manager_approval_type as enum (
  'booking_extension',
  'service_receipt_confirmation'
);

create type public.manager_approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table if not exists public.manager_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_type public.manager_approval_type not null,
  status public.manager_approval_status not null default 'pending',
  booking_id uuid references public.bookings(id) on delete set null,
  target_id uuid,
  target_table text,
  title text not null,
  detail text,
  requested_by text not null,
  requested_by_role text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  constraint manager_approvals_title_present check (nullif(trim(title), '') is not null)
);

create index if not exists manager_approvals_status_requested_at_idx
  on public.manager_approvals (status, requested_at desc);

create index if not exists manager_approvals_type_status_requested_at_idx
  on public.manager_approvals (approval_type, status, requested_at desc);

create index if not exists manager_approvals_target_idx
  on public.manager_approvals (target_table, target_id);

alter table public.manager_approvals enable row level security;

drop policy if exists manager_approvals_admin_read on public.manager_approvals;

create policy manager_approvals_admin_read
on public.manager_approvals
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

drop policy if exists manager_approvals_staff_insert on public.manager_approvals;

create policy manager_approvals_staff_insert
on public.manager_approvals
for insert to authenticated
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists manager_approvals_admin_update on public.manager_approvals;

create policy manager_approvals_admin_update
on public.manager_approvals
for update to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');