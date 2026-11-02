create extension if not exists pgcrypto;

create type room_type as enum ('single', 'double', 'suite', 'family');
create type room_status as enum ('vacant', 'occupied', 'cleaning', 'maintenance', 'reserved');
create type booking_status as enum ('active', 'reserved', 'checked_out', 'cancelled');
create type pay_method as enum ('cash', 'momo', 'bank_transfer', 'cheque');
create type charge_type as enum ('laundry', 'food', 'minibar', 'other');
create type access_result as enum ('granted', 'denied', 'expired');

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  type room_type not null,
  rate_ghs numeric(10, 2) not null,
  status room_status not null default 'vacant',
  created_at timestamptz default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  guest_name text not null,
  guest_phone text,
  check_in date not null,
  check_out_expected date not null,
  check_out_actual date,
  nights int not null,
  total_ghs numeric(10, 2) not null,
  paid_ghs numeric(10, 2) not null default 0,
  balance_ghs numeric(10, 2) generated always as (total_ghs - paid_ghs) stored,
  status booking_status not null default 'reserved',
  cancel_note text,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  amount_ghs numeric(10, 2) not null,
  method pay_method not null,
  reference text,
  received_by text not null,
  paid_at timestamptz default now(),
  constraint payments_reference_required check (
    method = 'cash' or nullif(trim(reference), '') is not null
  )
);

create table if not exists service_charges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  type charge_type not null,
  amount_ghs numeric(10, 2) not null default 0,
  description text,
  resolved boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists keycards (
  id uuid primary key default gen_random_uuid(),
  card_uid text unique not null,
  room_id uuid references rooms(id),
  booking_id uuid references bookings(id),
  issued_to text not null,
  issued_by text not null,
  issued_at timestamptz default now(),
  valid_from date not null,
  valid_until date not null,
  status text not null default 'active',
  access_count int not null default 0,
  constraint keycards_uid_format check (card_uid ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){3}$'),
  constraint keycards_status_valid check (status in ('active', 'revoked'))
);

create table if not exists access_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  card_uid text not null,
  keycard_id uuid references keycards(id),
  guest_name text,
  issued_by text,
  result access_result not null,
  note text,
  accessed_at timestamptz default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  daily_rate_ghs numeric(10, 2) not null,
  on_shift boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  triggered_by text not null,
  booking_id uuid references bookings(id),
  keycard_id uuid references keycards(id),
  read boolean not null default false,
  created_at timestamptz default now()
);

create or replace function sync_booking_paid_ghs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update bookings
  set paid_ghs = coalesce((
    select sum(amount_ghs)
    from payments
    where booking_id = new.booking_id
  ), 0)
  where id = new.booking_id;

  return new;
end;
$$;

drop trigger if exists payments_sync_booking_paid_ghs on payments;

create trigger payments_sync_booking_paid_ghs
after insert on payments
for each row execute function sync_booking_paid_ghs();

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter table rooms enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table service_charges enable row level security;
alter table keycards enable row level security;
alter table access_log enable row level security;
alter table staff enable row level security;
alter table shifts enable row level security;
alter table notifications enable row level security;

create policy rooms_read on rooms
for select to authenticated
using (true);

create policy rooms_admin on rooms
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy bookings_read on bookings
for select to authenticated
using (true);

create policy bookings_write on bookings
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy payments_read_admin on payments
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy payments_write on payments
for insert to authenticated
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy services_read on service_charges
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy services_write on service_charges
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy keycards_admin_read on keycards
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy keycards_write on keycards
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy access_log_admin on access_log
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy notifications_admin_read on notifications
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy notifications_staff_insert on notifications
for insert to authenticated
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

create policy notifications_admin_update on notifications
for update to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy staff_admin on staff
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy shifts_admin on shifts
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create or replace function prevent_access_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'access_log is append-only';
end;
$$;

drop trigger if exists prevent_access_log_update on access_log;
drop trigger if exists prevent_access_log_delete on access_log;

create trigger prevent_access_log_update
before update on access_log
for each row execute function prevent_access_log_mutation();

create trigger prevent_access_log_delete
before delete on access_log
for each row execute function prevent_access_log_mutation();