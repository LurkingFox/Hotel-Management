drop policy if exists staff_self_read on staff;
drop policy if exists staff_self_update on staff;
drop policy if exists shifts_self_read on shifts;
drop policy if exists shifts_self_insert on shifts;
drop policy if exists shifts_self_update on shifts;

create policy staff_self_read on staff
for select to authenticated
using (
  auth.uid() = auth_user_id
  or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = id::text
);

create policy staff_self_update on staff
for update to authenticated
using (
  auth.uid() = auth_user_id
  or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = id::text
)
with check (
  auth.uid() = auth_user_id
  or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = id::text
);

create policy shifts_self_read on shifts
for select to authenticated
using (
  exists (
    select 1
    from staff
    where staff.id = shifts.staff_id
      and (
        staff.auth_user_id = auth.uid()
        or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = staff.id::text
      )
  )
);

create policy shifts_self_insert on shifts
for insert to authenticated
with check (
  exists (
    select 1
    from staff
    where staff.id = shifts.staff_id
      and (
        staff.auth_user_id = auth.uid()
        or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = staff.id::text
      )
  )
);

create policy shifts_self_update on shifts
for update to authenticated
using (
  exists (
    select 1
    from staff
    where staff.id = shifts.staff_id
      and (
        staff.auth_user_id = auth.uid()
        or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = staff.id::text
      )
  )
)
with check (
  exists (
    select 1
    from staff
    where staff.id = shifts.staff_id
      and (
        staff.auth_user_id = auth.uid()
        or (auth.jwt() -> 'user_metadata' ->> 'staff_id') = staff.id::text
      )
  )
);