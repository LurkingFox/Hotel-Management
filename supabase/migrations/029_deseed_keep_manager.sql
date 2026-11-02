-- Migration: 029_deseed_keep_manager.sql
-- Purpose: Remove all application data and seed a single manager account
-- WARNING: Run only after taking a full DB backup. This will delete data.

create temp table seed_manager (email text primary key, password text, display_name text) on commit drop;
insert into seed_manager (email, password, display_name)
values ('manager@universityhotel.com', 'UniversityHotelAdmin!2026', 'University Hotel Manager');

do $$
declare
  manager_user_id uuid;
  manager_staff_id uuid;
  tables_to_truncate text;
begin
  select id
  into manager_user_id
  from auth.users as users
  where lower(users.email) = 'manager@universityhotel.com'
  order by users.created_at asc
  limit 1;

  if manager_user_id is null then
    manager_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      manager_user_id,
      'authenticated',
      'authenticated',
      'manager@universityhotel.com',
      extensions.crypt('UniversityHotelAdmin!2026', extensions.gen_salt('bf')),
      timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"admin","name":"University Hotel Manager","active":true}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      manager_user_id,
      jsonb_build_object('sub', manager_user_id::text, 'email', 'manager@universityhotel.com'),
      'email',
      manager_user_id::text,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    );
  else
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'staff_id') || jsonb_build_object(
          'role',
          'admin',
          'name',
          coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), 'University Hotel Manager'),
          'active',
          true
        ),
        email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = manager_user_id;
  end if;

  -- Remove all other auth accounts
  delete from auth.identities where user_id <> manager_user_id;
  delete from auth.users where id <> manager_user_id;

  -- Truncate most application tables (restart identities and cascade to satisfy FKs)
  -- Only truncate tables that actually exist to avoid failures when optional
  -- tables are missing in some environments.
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
  into tables_to_truncate
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'service_request_events', 'operational_handoff_items', 'operational_handoffs', 'manager_approvals',
      'booking_extension_audits', 'service_requests', 'notifications', 'access_log', 'booking_access_credentials',
      'payments', 'service_charges', 'bookings', 'guest_identity_documents', 'guest_profiles', 'shifts',
      'room_access_devices', 'keycards', 'rooms', 'staff', 'door_controllers', 'hotel_profile'
    );

  if tables_to_truncate is not null then
    execute 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
  end if;

  -- Add a minimal staff record for the manager so app RLS/meta mappings still work
  manager_staff_id := gen_random_uuid();
  insert into public.staff (id, name, role, daily_rate_ghs, on_shift, created_at)
  values (manager_staff_id, 'University Hotel Manager', 'admin', 0, false, timezone('utc', now()))
  on conflict do nothing;

  update auth.users
  set raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'staff_id') || jsonb_build_object(
    'staff_id',
    manager_staff_id::text,
    'role',
    'admin',
    'name',
    'University Hotel Manager',
    'active',
    true
  )
  where id = manager_user_id;
end;
$$;
