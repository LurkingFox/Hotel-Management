alter table hotel_profile
add column if not exists logo_path text,
add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('hotel-assets', 'hotel-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists hotel_assets_public_read on storage.objects;
drop policy if exists hotel_assets_admin_insert on storage.objects;
drop policy if exists hotel_assets_admin_update on storage.objects;
drop policy if exists hotel_assets_admin_delete on storage.objects;

create policy hotel_assets_public_read on storage.objects
for select to public
using (bucket_id = 'hotel-assets');

create policy hotel_assets_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'hotel-assets' and (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy hotel_assets_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'hotel-assets' and (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
with check (bucket_id = 'hotel-assets' and (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy hotel_assets_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'hotel-assets' and (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');