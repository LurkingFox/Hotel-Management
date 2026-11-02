drop policy if exists notifications_admin on notifications;
drop policy if exists notifications_admin_read on notifications;
drop policy if exists notifications_staff_insert on notifications;
drop policy if exists notifications_admin_update on notifications;

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