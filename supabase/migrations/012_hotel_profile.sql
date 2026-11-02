create table if not exists hotel_profile (
  id boolean primary key default true,
  name text not null default 'University Hotel',
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  phone text,
  email text,
  website text,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint hotel_profile_singleton check (id = true)
);

insert into hotel_profile (id, name)
values (true, 'University Hotel')
on conflict (id) do nothing;

alter table hotel_profile enable row level security;

drop policy if exists hotel_profile_admin on hotel_profile;

create policy hotel_profile_admin on hotel_profile
for all to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');