create type public.guest_kyc_status as enum ('not_started', 'pending', 'verified', 'rejected');
create type public.identity_document_type as enum ('ghana_card', 'passport', 'drivers_license', 'voter_id', 'other');
create type public.identity_document_status as enum ('pending', 'verified', 'rejected', 'expired');

create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  nationality text,
  city text,
  date_of_birth date,
  kyc_status public.guest_kyc_status not null default 'not_started',
  kyc_notes text,
  last_stayed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_identity_documents (
  id uuid primary key default gen_random_uuid(),
  guest_profile_id uuid not null references public.guest_profiles(id) on delete cascade,
  document_type public.identity_document_type not null,
  document_number text not null,
  issuing_country text,
  issued_on date,
  expires_on date,
  status public.identity_document_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_identity_documents_number_unique unique (document_type, document_number)
);

alter table public.bookings
  add column if not exists guest_profile_id uuid references public.guest_profiles(id);

create index if not exists guest_profiles_full_name_idx on public.guest_profiles (lower(full_name));
create index if not exists guest_profiles_kyc_status_idx on public.guest_profiles (kyc_status);
create index if not exists guest_identity_documents_guest_profile_id_idx on public.guest_identity_documents (guest_profile_id);
create index if not exists guest_identity_documents_status_idx on public.guest_identity_documents (status);
create index if not exists bookings_guest_profile_id_idx on public.bookings (guest_profile_id);

create or replace function public.touch_guest_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_guest_profiles_updated_at on public.guest_profiles;
create trigger touch_guest_profiles_updated_at
before update on public.guest_profiles
for each row execute function public.touch_guest_profile_updated_at();

drop trigger if exists touch_guest_identity_documents_updated_at on public.guest_identity_documents;
create trigger touch_guest_identity_documents_updated_at
before update on public.guest_identity_documents
for each row execute function public.touch_guest_profile_updated_at();

with guest_rollup as (
  select
    b.guest_name as full_name,
    nullif(trim(b.guest_phone), '') as phone,
    max(b.check_out_expected) as last_stayed_at,
    min(coalesce(b.created_at, now())) as created_at
  from public.bookings b
  group by b.guest_name, nullif(trim(b.guest_phone), '')
)
insert into public.guest_profiles (full_name, phone, last_stayed_at, created_at, updated_at)
select
  guest_rollup.full_name,
  guest_rollup.phone,
  guest_rollup.last_stayed_at,
  guest_rollup.created_at,
  now()
from guest_rollup
where not exists (
  select 1
  from public.guest_profiles gp
  where gp.full_name = guest_rollup.full_name
    and coalesce(gp.phone, '') = coalesce(guest_rollup.phone, '')
);

update public.bookings b
set guest_profile_id = gp.id
from public.guest_profiles gp
where gp.full_name = b.guest_name
  and coalesce(gp.phone, '') = coalesce(nullif(trim(b.guest_phone), ''), '')
  and b.guest_profile_id is null;

alter table public.guest_profiles enable row level security;
alter table public.guest_identity_documents enable row level security;

drop policy if exists guest_profiles_staff_read on public.guest_profiles;
create policy guest_profiles_staff_read on public.guest_profiles
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists guest_profiles_staff_write on public.guest_profiles;
create policy guest_profiles_staff_write on public.guest_profiles
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists guest_identity_documents_staff_read on public.guest_identity_documents;
create policy guest_identity_documents_staff_read on public.guest_identity_documents
for select to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));

drop policy if exists guest_identity_documents_staff_write on public.guest_identity_documents;
create policy guest_identity_documents_staff_write on public.guest_identity_documents
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'receptionist'));