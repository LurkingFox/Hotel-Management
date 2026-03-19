alter table public.service_charges
  add column if not exists requested_by text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists payment_confirmed boolean not null default false,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by text,
  add column if not exists payment_id uuid references public.payments(id);

update public.service_charges
set requested_by = coalesce(requested_by, 'system')
where requested_by is null;

update public.service_charges
set
  resolved_at = coalesce(resolved_at, created_at, now()),
  resolved_by = coalesce(resolved_by, 'legacy workflow'),
  payment_confirmed = true,
  payment_confirmed_at = coalesce(payment_confirmed_at, created_at, now()),
  payment_confirmed_by = coalesce(payment_confirmed_by, 'legacy workflow')
where resolved = true and payment_confirmed = false;

create index if not exists bookings_status_check_in_idx on public.bookings (status, check_in desc);
create index if not exists bookings_room_check_in_idx on public.bookings (room_id, check_in desc);
create index if not exists payments_booking_paid_at_idx on public.payments (booking_id, paid_at desc);
create index if not exists payments_method_paid_at_idx on public.payments (method, paid_at desc);
create index if not exists service_charges_booking_created_idx on public.service_charges (booking_id, created_at desc);
create index if not exists service_charges_resolution_idx on public.service_charges (resolved, payment_confirmed, created_at desc);
create index if not exists access_log_room_accessed_idx on public.access_log (room_id, accessed_at desc);
create index if not exists access_log_result_accessed_idx on public.access_log (result, accessed_at desc);
create index if not exists notifications_read_created_idx on public.notifications (read, created_at desc);
create index if not exists shifts_staff_started_idx on public.shifts (staff_id, started_at desc);
create index if not exists staff_active_shift_name_idx on public.staff (active, on_shift, name);