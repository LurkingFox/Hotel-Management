with auth_accounts as (
  select
    u.id as auth_user_id,
    u.email,
    case
      when coalesce(u.raw_user_meta_data ->> 'staff_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (u.raw_user_meta_data ->> 'staff_id')::uuid
      else null
    end as metadata_staff_id,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(u.email, u.id::text), '@', 1)) as display_name,
    u.raw_user_meta_data ->> 'role' as staff_role,
    case
      when jsonb_typeof(u.raw_user_meta_data -> 'active') = 'boolean' then (u.raw_user_meta_data ->> 'active')::boolean
      else true
    end as is_active
  from auth.users u
  where coalesce(u.raw_user_meta_data ->> 'role', '') in ('admin', 'receptionist')
),
linked_by_metadata as (
  update staff s
  set
    auth_user_id = a.auth_user_id,
    active = a.is_active
  from auth_accounts a
  where a.metadata_staff_id = s.id
  returning s.id, s.auth_user_id
),
synced_existing_links as (
  update staff s
  set active = a.is_active
  from auth_accounts a
  where s.auth_user_id = a.auth_user_id
  returning s.id, s.auth_user_id
),
inserted_staff as (
  insert into staff (name, role, daily_rate_ghs, on_shift, active, auth_user_id)
  select
    a.display_name,
    a.staff_role,
    1,
    false,
    a.is_active,
    a.auth_user_id
  from auth_accounts a
  left join staff s
    on s.auth_user_id = a.auth_user_id
    or s.id = a.metadata_staff_id
  where s.id is null
  returning id, auth_user_id
)
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'staff_id', s.id::text,
    'name', s.name,
    'role', s.role,
    'active', s.active
  )
from staff s
where u.id = s.auth_user_id;