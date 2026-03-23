create temp table seed_auth_accounts (
  account_key text primary key,
  email text not null,
  password text not null,
  display_name text not null,
  role text not null,
  user_id uuid
) on commit drop;

insert into seed_auth_accounts (account_key, email, password, display_name, role)
values
  ('manager', 'manager@universityhotel.com', 'UniversityHotelAdmin!2026', 'University Hotel Manager', 'admin'),
  ('receptionist', 'abena.frimpong@universityhotel.com', 'FrontDeskAbena!2026', 'Abena Frimpong', 'receptionist');

create temp table preserved_room_mappings on commit drop as
select
  rooms.number as room_number,
  devices.provider,
  devices.external_device_id,
  devices.display_name
from public.room_access_devices as devices
join public.rooms on rooms.id = devices.room_id
where rooms.number in ('1', '2', '3', '4', '5');

do $$
declare
  manager_user_id uuid;
  receptionist_user_id uuid;
begin
  select users.id
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

  update seed_auth_accounts
  set user_id = manager_user_id
  where account_key = 'manager';

  delete from auth.identities
  where user_id <> manager_user_id;

  delete from auth.users
  where id <> manager_user_id;

  receptionist_user_id := gen_random_uuid();

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
    receptionist_user_id,
    'authenticated',
    'authenticated',
    'abena.frimpong@universityhotel.com',
    extensions.crypt('FrontDeskAbena!2026', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"receptionist","name":"Abena Frimpong","active":true}'::jsonb,
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
    receptionist_user_id,
    jsonb_build_object('sub', receptionist_user_id::text, 'email', 'abena.frimpong@universityhotel.com'),
    'email',
    receptionist_user_id::text,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  );

  update seed_auth_accounts
  set user_id = receptionist_user_id
  where account_key = 'receptionist';
end;
$$;

truncate table
  public.service_request_events,
  public.operational_handoff_items,
  public.operational_handoffs,
  public.manager_approvals,
  public.booking_extension_audits,
  public.service_requests,
  public.notifications,
  public.access_log,
  public.booking_access_credentials,
  public.payments,
  public.service_charges,
  public.bookings,
  public.guest_identity_documents,
  public.guest_profiles,
  public.shifts;

delete from public.room_access_devices;
delete from public.rooms;
delete from public.staff;

create temp table seed_staff (
  staff_key text primary key,
  name text not null,
  role text not null,
  daily_rate_ghs numeric(10, 2) not null,
  on_shift boolean not null,
  active boolean not null,
  auth_account_key text
) on commit drop;

insert into seed_staff (staff_key, name, role, daily_rate_ghs, on_shift, active, auth_account_key)
values
  ('manager', 'University Hotel Manager', 'admin', 420, false, true, 'manager'),
  ('receptionist', 'Abena Frimpong', 'receptionist', 220, true, true, 'receptionist'),
  ('housekeeping_lead', 'Akosua Tandoh', 'housekeeping', 165, true, true, null),
  ('maintenance', 'Yaw Bediako', 'maintenance', 195, true, true, null),
  ('housekeeping_support', 'Esi Nunoo', 'housekeeping', 155, false, true, null),
  ('security', 'Kojo Nartey', 'security', 185, true, true, null),
  ('concierge', 'Mabel Ofori', 'concierge', 175, false, true, null);

insert into public.staff (name, role, daily_rate_ghs, on_shift, active, auth_user_id)
select
  seed_staff.name,
  seed_staff.role,
  seed_staff.daily_rate_ghs,
  seed_staff.on_shift,
  seed_staff.active,
  seed_auth_accounts.user_id
from seed_staff
left join seed_auth_accounts on seed_auth_accounts.account_key = seed_staff.auth_account_key;

update auth.users as users
set raw_user_meta_data = (coalesce(users.raw_user_meta_data, '{}'::jsonb) - 'staff_id') || jsonb_build_object(
  'staff_id',
  staff.id::text,
  'name',
  staff.name,
  'role',
  staff.role,
  'active',
  staff.active
)
from public.staff as staff
where staff.auth_user_id = users.id;

create temp table seed_rooms (
  room_number text primary key,
  room_type public.room_type not null,
  rate_ghs numeric(10, 2) not null,
  status public.room_status not null
) on commit drop;

insert into seed_rooms (room_number, room_type, rate_ghs, status)
values
  ('1', 'single', 240, 'occupied'),
  ('2', 'double', 360, 'occupied'),
  ('3', 'suite', 680, 'reserved'),
  ('4', 'double', 360, 'cleaning'),
  ('5', 'family', 540, 'vacant');

insert into public.rooms (number, type, rate_ghs, status)
select room_number, room_type, rate_ghs, status
from seed_rooms;

insert into public.room_access_devices (room_id, provider, external_device_id, display_name)
select
  rooms.id,
  preserved_room_mappings.provider,
  preserved_room_mappings.external_device_id,
  preserved_room_mappings.display_name
from preserved_room_mappings
join public.rooms on rooms.number = preserved_room_mappings.room_number
on conflict (room_id) do update
set provider = excluded.provider,
    external_device_id = excluded.external_device_id,
    display_name = excluded.display_name,
    updated_at = timezone('utc', now());

create temp table seed_guest_profiles (
  guest_key text primary key,
  full_name text not null,
  phone text,
  email text,
  nationality text,
  city text,
  date_of_birth date,
  kyc_status public.guest_kyc_status not null,
  kyc_notes text,
  last_stayed_at date,
  document_type public.identity_document_type,
  document_number text,
  issuing_country text,
  issued_on date,
  expires_on date,
  document_status public.identity_document_status,
  verification_notes text,
  verified_at timestamptz,
  verified_by text
) on commit drop;

insert into seed_guest_profiles (
  guest_key,
  full_name,
  phone,
  email,
  nationality,
  city,
  date_of_birth,
  kyc_status,
  kyc_notes,
  last_stayed_at,
  document_type,
  document_number,
  issuing_country,
  issued_on,
  expires_on,
  document_status,
  verification_notes,
  verified_at,
  verified_by
)
values
  (
    'room1_guest',
    'Nana Yaa Owusu',
    '0244123456',
    'nana.owusu@example.com',
    'Ghanaian',
    'Kumasi',
    date '1991-08-14',
    'verified',
    'Returning corporate guest with completed KYC.',
    current_date - 1,
    'ghana_card',
    'GHA-4921-5567',
    'Ghana',
    date '2021-06-05',
    date '2031-06-05',
    'verified',
    'Verified at reception during pre-arrival confirmation.',
    now() - interval '2 days',
    'University Hotel Manager'
  ),
  (
    'room2_guest',
    'Kojo Mensah Asiedu',
    '0203344556',
    'kojo.asiedu@example.com',
    'Ghanaian',
    'Accra',
    date '1988-11-02',
    'verified',
    'Frequent short-stay guest from the airport corridor.',
    current_date - 16,
    'drivers_license',
    'DL-AC-882145',
    'Ghana',
    date '2022-03-12',
    date '2028-03-12',
    'verified',
    'License verified against prior stay records.',
    now() - interval '20 days',
    'University Hotel Manager'
  ),
  (
    'room3_guest',
    'Esi Baffour Agyeman',
    '0551942201',
    'esi.agyeman@example.com',
    'Ghanaian',
    'Takoradi',
    date '1994-05-19',
    'pending',
    'Guest emailed ID copy; manager review is still pending before arrival handoff closes.',
    current_date - 92,
    'ghana_card',
    'GHA-6114-3208',
    'Ghana',
    date '2023-01-18',
    date '2033-01-18',
    'pending',
    'Front desk uploaded the document and requested manager review.',
    null,
    null
  ),
  (
    'room4_guest',
    'Adwoa Kusi Boateng',
    '0278893412',
    'adwoa.boateng@example.com',
    'Ghanaian',
    'Cape Coast',
    date '1986-02-27',
    'verified',
    'Recent checkout from a one-night transit stay.',
    current_date - 1,
    'passport',
    'G3148820',
    'Ghana',
    date '2020-09-10',
    date '2030-09-10',
    'verified',
    'Passport reviewed at desk during check-in.',
    now() - interval '5 days',
    'University Hotel Manager'
  );

insert into public.guest_profiles (
  full_name,
  phone,
  email,
  nationality,
  city,
  date_of_birth,
  kyc_status,
  kyc_notes,
  last_stayed_at
)
select
  full_name,
  phone,
  email,
  nationality,
  city,
  date_of_birth,
  kyc_status,
  kyc_notes,
  last_stayed_at
from seed_guest_profiles;

create temp table seeded_guest_profiles on commit drop as
select
  seed_guest_profiles.guest_key,
  guest_profiles.id,
  guest_profiles.full_name
from seed_guest_profiles
join public.guest_profiles on public.guest_profiles.full_name = seed_guest_profiles.full_name;

insert into public.guest_identity_documents (
  guest_profile_id,
  document_type,
  document_number,
  issuing_country,
  issued_on,
  expires_on,
  status,
  verification_notes,
  verified_at,
  verified_by
)
select
  seeded_guest_profiles.id,
  seed_guest_profiles.document_type,
  seed_guest_profiles.document_number,
  seed_guest_profiles.issuing_country,
  seed_guest_profiles.issued_on,
  seed_guest_profiles.expires_on,
  seed_guest_profiles.document_status,
  seed_guest_profiles.verification_notes,
  seed_guest_profiles.verified_at,
  seed_guest_profiles.verified_by
from seed_guest_profiles
join seeded_guest_profiles on seeded_guest_profiles.guest_key = seed_guest_profiles.guest_key
where seed_guest_profiles.document_type is not null
  and seed_guest_profiles.document_number is not null;

create temp table seed_bookings (
  booking_key text primary key,
  room_number text not null,
  guest_key text not null,
  check_in date not null,
  check_out_expected date not null,
  check_out_actual date,
  nights integer not null,
  base_total_ghs numeric(10, 2) not null,
  status public.booking_status not null,
  cancel_note text
) on commit drop;

insert into seed_bookings (
  booking_key,
  room_number,
  guest_key,
  check_in,
  check_out_expected,
  check_out_actual,
  nights,
  base_total_ghs,
  status,
  cancel_note
)
values
  ('room1_active', '1', 'room1_guest', current_date - 1, current_date + 2, null, 3, 720, 'active', null),
  ('room2_active', '2', 'room2_guest', current_date, current_date + 2, null, 2, 720, 'active', null),
  ('room3_reserved', '3', 'room3_guest', current_date + 1, current_date + 3, null, 2, 1360, 'reserved', null),
  ('room4_checked_out', '4', 'room4_guest', current_date - 2, current_date - 1, current_date - 1, 1, 360, 'checked_out', null);

insert into public.bookings (
  room_id,
  guest_profile_id,
  guest_name,
  guest_phone,
  check_in,
  check_out_expected,
  check_out_actual,
  nights,
  total_ghs,
  status,
  cancel_note
)
select
  rooms.id,
  seeded_guest_profiles.id,
  guest_profiles.full_name,
  guest_profiles.phone,
  seed_bookings.check_in,
  seed_bookings.check_out_expected,
  seed_bookings.check_out_actual,
  seed_bookings.nights,
  seed_bookings.base_total_ghs,
  seed_bookings.status,
  seed_bookings.cancel_note
from seed_bookings
join public.rooms on rooms.number = seed_bookings.room_number
join seeded_guest_profiles on seeded_guest_profiles.guest_key = seed_bookings.guest_key
join public.guest_profiles on guest_profiles.id = seeded_guest_profiles.id;

create temp table seeded_bookings on commit drop as
select
  seed_bookings.booking_key,
  bookings.id,
  rooms.number as room_number,
  bookings.guest_name
from seed_bookings
join public.rooms on rooms.number = seed_bookings.room_number
join public.bookings on bookings.room_id = rooms.id
  and bookings.guest_profile_id = (select id from seeded_guest_profiles where guest_key = seed_bookings.guest_key)
  and bookings.check_in = seed_bookings.check_in;

create temp table seed_service_charges (
  charge_key text primary key,
  booking_key text not null,
  charge_type public.charge_type not null,
  amount_ghs numeric(10, 2) not null,
  description text not null,
  requested_by text,
  resolved boolean not null,
  resolved_at timestamptz,
  resolved_by text
) on commit drop;

insert into seed_service_charges (
  charge_key,
  booking_key,
  charge_type,
  amount_ghs,
  description,
  requested_by,
  resolved,
  resolved_at,
  resolved_by
)
values
  ('room1_breakfast', 'room1_active', 'food', 95, 'Breakfast trays and coffee service for the conference guest.', 'Abena Frimpong', true, now() - interval '8 hours', 'Abena Frimpong'),
  ('room2_laundry', 'room2_active', 'laundry', 55, 'Express laundry completed before the guest asked for a late checkout.', 'Abena Frimpong', true, now() - interval '5 hours', 'Akosua Tandoh'),
  ('room4_airport', 'room4_checked_out', 'other', 140, 'Airport pickup arranged for the prior-night arrival.', 'Abena Frimpong', true, now() - interval '1 day 10 hours', 'Abena Frimpong');

insert into public.service_charges (
  booking_id,
  type,
  amount_ghs,
  description,
  requested_by,
  resolved,
  resolved_at,
  resolved_by,
  payment_confirmed,
  payment_confirmed_at,
  payment_confirmed_by,
  payment_id
)
select
  seeded_bookings.id,
  seed_service_charges.charge_type,
  seed_service_charges.amount_ghs,
  seed_service_charges.description,
  seed_service_charges.requested_by,
  seed_service_charges.resolved,
  seed_service_charges.resolved_at,
  seed_service_charges.resolved_by,
  false,
  null,
  null,
  null
from seed_service_charges
join seeded_bookings on seeded_bookings.booking_key = seed_service_charges.booking_key;

create temp table seeded_service_charges on commit drop as
select
  seed_service_charges.charge_key,
  service_charges.id,
  seeded_bookings.id as booking_id,
  seed_service_charges.amount_ghs
from seed_service_charges
join seeded_bookings on seeded_bookings.booking_key = seed_service_charges.booking_key
join public.service_charges on service_charges.booking_id = seeded_bookings.id
  and service_charges.description = seed_service_charges.description;

create temp table seed_payments (
  payment_key text primary key,
  booking_key text not null,
  amount_ghs numeric(10, 2) not null,
  method public.pay_method not null,
  reference text,
  received_by text not null,
  paid_at timestamptz not null,
  related_charge_key text
) on commit drop;

insert into seed_payments (
  payment_key,
  booking_key,
  amount_ghs,
  method,
  reference,
  received_by,
  paid_at,
  related_charge_key
)
values
  ('room1_deposit', 'room1_active', 600, 'momo', 'MOMO-712945', 'Abena Frimpong', now() - interval '10 hours', null),
  ('room1_breakfast_receipt', 'room1_active', 95, 'cash', null, 'University Hotel Manager', now() - interval '6 hours', 'room1_breakfast'),
  ('room2_deposit', 'room2_active', 500, 'cash', null, 'Abena Frimpong', now() - interval '4 hours', null),
  ('room3_deposit', 'room3_reserved', 700, 'bank_transfer', 'GT-ARR-1182', 'University Hotel Manager', now() - interval '2 hours', null),
  ('room4_room_payment', 'room4_checked_out', 360, 'bank_transfer', 'GCB-CHK-2041', 'University Hotel Manager', now() - interval '1 day 9 hours', null),
  ('room4_airport_receipt', 'room4_checked_out', 140, 'cash', null, 'University Hotel Manager', now() - interval '1 day 8 hours', 'room4_airport');

insert into public.payments (booking_id, amount_ghs, method, reference, received_by, paid_at)
select
  seeded_bookings.id,
  seed_payments.amount_ghs,
  seed_payments.method,
  seed_payments.reference,
  seed_payments.received_by,
  seed_payments.paid_at
from seed_payments
join seeded_bookings on seeded_bookings.booking_key = seed_payments.booking_key;

create temp table seeded_payments on commit drop as
select
  seed_payments.payment_key,
  payments.id,
  seed_payments.related_charge_key
from seed_payments
join seeded_bookings on seeded_bookings.booking_key = seed_payments.booking_key
join public.payments on payments.booking_id = seeded_bookings.id
  and payments.amount_ghs = seed_payments.amount_ghs
  and payments.paid_at = seed_payments.paid_at;

update public.service_charges as charges
set payment_confirmed = true,
    payment_confirmed_at = payments.paid_at,
    payment_confirmed_by = payments.received_by,
    payment_id = payments.id
from seeded_service_charges
join seeded_payments on seeded_payments.related_charge_key = seeded_service_charges.charge_key
join public.payments as payments on payments.id = seeded_payments.id
where charges.id = seeded_service_charges.id;

create temp table seed_shifts (
  shift_key text primary key,
  staff_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz
) on commit drop;

insert into seed_shifts (shift_key, staff_key, started_at, ended_at)
values
  ('reception_open', 'receptionist', now() - interval '6 hours 30 minutes', null),
  ('housekeeping_open', 'housekeeping_lead', now() - interval '7 hours', null),
  ('maintenance_open', 'maintenance', now() - interval '6 hours', null),
  ('security_open', 'security', now() - interval '8 hours', null),
  ('manager_review', 'manager', now() - interval '3 hours', now() - interval '1 hour');

insert into public.shifts (staff_id, started_at, ended_at)
select
  staff.id,
  seed_shifts.started_at,
  seed_shifts.ended_at
from seed_shifts
join seed_staff on seed_staff.staff_key = seed_shifts.staff_key
join public.staff as staff on staff.name = seed_staff.name;

create temp table seeded_shifts on commit drop as
select
  seed_shifts.shift_key,
  shifts.id,
  shifts.staff_id
from seed_shifts
join seed_staff on seed_staff.staff_key = seed_shifts.staff_key
join public.staff as staff on staff.name = seed_staff.name
join public.shifts as shifts on shifts.staff_id = staff.id
  and shifts.started_at = seed_shifts.started_at;

create temp table seed_service_requests (
  request_key text primary key,
  booking_key text,
  room_number text,
  charge_key text,
  category public.service_request_category not null,
  priority public.service_request_priority not null,
  source public.service_request_source not null,
  status public.service_request_status not null,
  title text not null,
  description text,
  guest_name text,
  requested_by text not null,
  requested_by_role text,
  assigned_staff_key text,
  due_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  completed_at timestamptz,
  completed_by text,
  resolution_note text,
  created_at timestamptz not null
) on commit drop;

insert into seed_service_requests (
  request_key,
  booking_key,
  room_number,
  charge_key,
  category,
  priority,
  source,
  status,
  title,
  description,
  guest_name,
  requested_by,
  requested_by_role,
  assigned_staff_key,
  due_at,
  acknowledged_at,
  acknowledged_by,
  completed_at,
  completed_by,
  resolution_note,
  created_at
)
values
  (
    'room1_housekeeping',
    'room1_active',
    '1',
    null,
    'housekeeping',
    'normal',
    'reception',
    'assigned',
    'Deliver extra towels to room 1',
    'Guest asked for fresh towels before leaving for the conference hall.',
    'Nana Yaa Owusu',
    'Abena Frimpong',
    'receptionist',
    'housekeeping_lead',
    now() + interval '45 minutes',
    now() - interval '40 minutes',
    'Abena Frimpong',
    null,
    null,
    null,
    now() - interval '55 minutes'
  ),
  (
    'room2_maintenance',
    'room2_active',
    '2',
    null,
    'maintenance',
    'urgent',
    'reception',
    'in_progress',
    'Inspect room 2 air-conditioner',
    'Guest reported weak cooling during the afternoon.',
    'Kojo Mensah Asiedu',
    'Abena Frimpong',
    'receptionist',
    'maintenance',
    now() + interval '30 minutes',
    now() - interval '2 hours 15 minutes',
    'Abena Frimpong',
    null,
    null,
    null,
    now() - interval '2 hours 30 minutes'
  ),
  (
    'room2_laundry',
    'room2_active',
    '2',
    'room2_laundry',
    'laundry',
    'high',
    'reception',
    'completed',
    'Return express laundry to room 2',
    'Laundry was completed and receipt now awaits manager confirmation.',
    'Kojo Mensah Asiedu',
    'Abena Frimpong',
    'receptionist',
    'housekeeping_lead',
    now() - interval '5 hours 30 minutes',
    now() - interval '6 hours',
    'Abena Frimpong',
    now() - interval '5 hours',
    'Akosua Tandoh',
    'Laundry delivered and the signed docket was left with reception.',
    now() - interval '6 hours 20 minutes'
  ),
  (
    'room3_arrival_support',
    'room3_reserved',
    '3',
    null,
    'other',
    'normal',
    'manager',
    'new',
    'Confirm airport pickup and pre-arrival call for room 3',
    'VIP arrival tomorrow morning once KYC review is cleared.',
    'Esi Baffour Agyeman',
    'University Hotel Manager',
    'admin',
    null,
    now() + interval '12 hours',
    null,
    null,
    null,
    null,
    null,
    now() - interval '90 minutes'
  );

insert into public.service_requests (
  booking_id,
  room_id,
  service_charge_id,
  category,
  priority,
  source,
  status,
  title,
  description,
  guest_name,
  requested_by,
  requested_by_role,
  assigned_staff_id,
  due_at,
  acknowledged_at,
  acknowledged_by,
  completed_at,
  completed_by,
  resolution_note,
  created_at,
  updated_at
)
select
  seeded_bookings.id,
  rooms.id,
  seeded_service_charges.id,
  seed_service_requests.category,
  seed_service_requests.priority,
  seed_service_requests.source,
  seed_service_requests.status,
  seed_service_requests.title,
  seed_service_requests.description,
  seed_service_requests.guest_name,
  seed_service_requests.requested_by,
  seed_service_requests.requested_by_role,
  assigned_staff.id,
  seed_service_requests.due_at,
  seed_service_requests.acknowledged_at,
  seed_service_requests.acknowledged_by,
  seed_service_requests.completed_at,
  seed_service_requests.completed_by,
  seed_service_requests.resolution_note,
  seed_service_requests.created_at,
  greatest(seed_service_requests.created_at, coalesce(seed_service_requests.completed_at, seed_service_requests.acknowledged_at, seed_service_requests.created_at))
from seed_service_requests
left join seeded_bookings on seeded_bookings.booking_key = seed_service_requests.booking_key
left join public.rooms on rooms.number = seed_service_requests.room_number
left join seeded_service_charges on seeded_service_charges.charge_key = seed_service_requests.charge_key
left join seed_staff as assigned_seed_staff on assigned_seed_staff.staff_key = seed_service_requests.assigned_staff_key
left join public.staff as assigned_staff on assigned_staff.name = assigned_seed_staff.name;

create temp table seeded_service_requests on commit drop as
select
  seed_service_requests.request_key,
  service_requests.id,
  service_requests.title
from seed_service_requests
join public.service_requests on public.service_requests.title = seed_service_requests.title;

create temp table seed_service_request_events (
  request_key text not null,
  event_type text not null,
  message text not null,
  actor_name text,
  actor_role text,
  metadata jsonb,
  created_at timestamptz not null
) on commit drop;

insert into seed_service_request_events (request_key, event_type, message, actor_name, actor_role, metadata, created_at)
values
  ('room1_housekeeping', 'created', 'Service request created: Deliver extra towels to room 1', 'Abena Frimpong', 'receptionist', '{"priority":"normal","source":"reception"}'::jsonb, now() - interval '55 minutes'),
  ('room1_housekeeping', 'acknowledge', 'Service request acknowledged: Deliver extra towels to room 1', 'Abena Frimpong', 'receptionist', '{"status":"assigned"}'::jsonb, now() - interval '40 minutes'),
  ('room1_housekeeping', 'assign', 'Service request assigned: Deliver extra towels to room 1', 'Abena Frimpong', 'receptionist', '{"assigned_staff":"Akosua Tandoh","status":"assigned"}'::jsonb, now() - interval '35 minutes'),
  ('room2_maintenance', 'created', 'Service request created: Inspect room 2 air-conditioner', 'Abena Frimpong', 'receptionist', '{"priority":"urgent","source":"reception"}'::jsonb, now() - interval '2 hours 30 minutes'),
  ('room2_maintenance', 'assign', 'Service request assigned: Inspect room 2 air-conditioner', 'Abena Frimpong', 'receptionist', '{"assigned_staff":"Yaw Bediako","status":"assigned"}'::jsonb, now() - interval '2 hours 10 minutes'),
  ('room2_maintenance', 'start', 'Work started on request: Inspect room 2 air-conditioner', 'Yaw Bediako', 'maintenance', '{"status":"in_progress"}'::jsonb, now() - interval '105 minutes'),
  ('room2_laundry', 'created', 'Service request created: Return express laundry to room 2', 'Abena Frimpong', 'receptionist', '{"priority":"high","source":"reception"}'::jsonb, now() - interval '6 hours 20 minutes'),
  ('room2_laundry', 'complete', 'Service request completed: Return express laundry to room 2', 'Akosua Tandoh', 'housekeeping', '{"status":"completed"}'::jsonb, now() - interval '5 hours'),
  ('room3_arrival_support', 'created', 'Service request created: Confirm airport pickup and pre-arrival call for room 3', 'University Hotel Manager', 'admin', '{"priority":"normal","source":"manager"}'::jsonb, now() - interval '90 minutes');

insert into public.service_request_events (service_request_id, event_type, message, actor_name, actor_role, metadata, created_at)
select
  seeded_service_requests.id,
  seed_service_request_events.event_type,
  seed_service_request_events.message,
  seed_service_request_events.actor_name,
  seed_service_request_events.actor_role,
  coalesce(seed_service_request_events.metadata, '{}'::jsonb),
  seed_service_request_events.created_at
from seed_service_request_events
join seeded_service_requests on seeded_service_requests.request_key = seed_service_request_events.request_key;

create temp table seed_credentials (
  credential_key text primary key,
  booking_key text not null,
  provider_reference text not null,
  credential_code text not null,
  issued_by text not null,
  note text,
  status text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null
) on commit drop;

insert into seed_credentials (
  credential_key,
  booking_key,
  provider_reference,
  credential_code,
  issued_by,
  note,
  status,
  valid_from,
  valid_until
)
values
  ('room1_code', 'room1_active', 'seed-room1-seam-access', '482915', 'Abena Frimpong', 'Primary access code for the active room 1 stay.', 'active', now() - interval '1 day', now() + interval '2 days'),
  ('room2_code', 'room2_active', 'seed-room2-seam-access', '614288', 'Abena Frimpong', 'Primary access code for the active room 2 stay.', 'active', now() - interval '4 hours', now() + interval '2 days'),
  ('room3_code', 'room3_reserved', 'seed-room3-seam-access', '730441', 'Abena Frimpong', 'Access code staged for tomorrow''s arrival once KYC clears.', 'active', now() + interval '18 hours', now() + interval '3 days'),
  ('room4_code', 'room4_checked_out', 'seed-room4-seam-access', '905173', 'Abena Frimpong', 'Revoked after checkout for the cleaning turnover.', 'revoked', now() - interval '2 days', now() - interval '1 day');

insert into public.booking_access_credentials (
  booking_id,
  room_id,
  provider,
  status,
  provider_reference,
  provider_device_id,
  credential_code,
  issued_to,
  issued_by,
  note,
  valid_from,
  valid_until
)
select
  seeded_bookings.id,
  rooms.id,
  'seam',
  seed_credentials.status,
  seed_credentials.provider_reference,
  devices.external_device_id,
  seed_credentials.credential_code,
  bookings.guest_name,
  seed_credentials.issued_by,
  seed_credentials.note,
  seed_credentials.valid_from,
  seed_credentials.valid_until
from seed_credentials
join seeded_bookings on seeded_bookings.booking_key = seed_credentials.booking_key
join public.bookings as bookings on bookings.id = seeded_bookings.id
join public.rooms on rooms.id = bookings.room_id
left join public.room_access_devices as devices on devices.room_id = rooms.id and devices.provider = 'seam';

create temp table seeded_credentials on commit drop as
select
  seed_credentials.credential_key,
  booking_access_credentials.id,
  booking_access_credentials.credential_code
from seed_credentials
join public.booking_access_credentials on booking_access_credentials.provider_reference = seed_credentials.provider_reference;

insert into public.access_log (room_id, credential_identifier, guest_name, issued_by, result, note, accessed_at)
select
  rooms.id,
  event.credential_identifier,
  event.guest_name,
  event.issued_by,
  event.result,
  event.note,
  event.accessed_at
from (
  values
    ('1', '482915', 'Nana Yaa Owusu', 'Abena Frimpong', 'granted'::public.access_result, 'Guest returned from the breakfast meeting.', now() - interval '2 hours 20 minutes'),
    ('2', '614288', 'Kojo Mensah Asiedu', 'Abena Frimpong', 'granted'::public.access_result, 'Guest re-entered after the maintenance check started.', now() - interval '65 minutes'),
    ('3', 'PRECHECK-7319', 'Esi Baffour Agyeman', 'Abena Frimpong', 'denied'::public.access_result, 'Pre-arrival tap rejected before tomorrow''s check-in window.', now() - interval '35 minutes'),
    ('4', '905173', 'Adwoa Kusi Boateng', 'Abena Frimpong', 'expired'::public.access_result, 'Old code rejected after checkout and room handover to housekeeping.', now() - interval '23 hours')
) as event(room_number, credential_identifier, guest_name, issued_by, result, note, accessed_at)
join public.rooms on rooms.number = event.room_number;

insert into public.booking_extension_audits (
  booking_id,
  requested_by,
  requester_role,
  authorization_mode,
  authorized_by,
  reason,
  previous_check_out_expected,
  new_check_out_expected,
  previous_total_ghs,
  new_total_ghs,
  incremental_amount_ghs,
  payment_recorded_ghs,
  payment_method,
  payment_reference,
  created_at,
  confirmation_status,
  confirmed_by,
  confirmed_at,
  confirmation_note
)
select
  seeded_bookings.id,
  'Abena Frimpong',
  'receptionist',
  'reception_confirmed',
  null,
  'Guest requested a one-night extension because the next morning meeting moved to Kumasi.',
  bookings.check_out_expected,
  bookings.check_out_expected + 1,
  bookings.total_ghs,
  bookings.total_ghs + rooms.rate_ghs,
  rooms.rate_ghs,
  0,
  'cash',
  null,
  now() - interval '70 minutes',
  'pending',
  null,
  null,
  null
from seeded_bookings
join public.bookings as bookings on bookings.id = seeded_bookings.id
join public.rooms on rooms.id = bookings.room_id
where seeded_bookings.booking_key = 'room2_active';

create temp table seeded_extension_audits on commit drop as
select
  booking_extension_audits.id,
  booking_extension_audits.booking_id
from public.booking_extension_audits
join seeded_bookings on seeded_bookings.id = booking_extension_audits.booking_id
where seeded_bookings.booking_key = 'room2_active';

insert into public.manager_approvals (
  approval_type,
  status,
  booking_id,
  target_id,
  target_table,
  title,
  detail,
  requested_by,
  requested_by_role,
  requested_at,
  reviewed_at,
  reviewed_by,
  review_note,
  metadata
)
select
  'booking_extension',
  'pending',
  seeded_extension_audits.booking_id,
  seeded_extension_audits.id,
  'booking_extension_audits',
  'Review late checkout extension for room 2',
  'Reception recorded a one-night stay extension for Kojo Mensah Asiedu. Manager confirmation is still required.',
  'Abena Frimpong',
  'receptionist',
  now() - interval '68 minutes',
  null,
  null,
  null,
  jsonb_build_object('room_number', '2', 'incremental_amount_ghs', 360)
from seeded_extension_audits;

insert into public.manager_approvals (
  approval_type,
  status,
  booking_id,
  target_id,
  target_table,
  title,
  detail,
  requested_by,
  requested_by_role,
  requested_at,
  reviewed_at,
  reviewed_by,
  review_note,
  metadata
)
select
  'service_receipt_confirmation',
  'pending',
  seeded_bookings.id,
  seeded_service_charges.id,
  'service_charges',
  'Confirm express laundry receipt for room 2',
  'Laundry delivery was completed and the signed docket is awaiting manager receipt confirmation.',
  'Abena Frimpong',
  'receptionist',
  now() - interval '4 hours 45 minutes',
  null,
  null,
  null,
  jsonb_build_object('service_charge_id', seeded_service_charges.id, 'amount_ghs', seeded_service_charges.amount_ghs, 'charge_type', 'laundry')
from seeded_service_charges
join seeded_bookings on seeded_bookings.id = seeded_service_charges.booking_id
where seeded_service_charges.charge_key = 'room2_laundry';

insert into public.manager_approvals (
  approval_type,
  status,
  booking_id,
  target_id,
  target_table,
  title,
  detail,
  requested_by,
  requested_by_role,
  requested_at,
  reviewed_at,
  reviewed_by,
  review_note,
  metadata
)
select
  'guest_kyc_review',
  'pending',
  seeded_bookings.id,
  documents.id,
  'guest_identity_documents',
  'Review KYC for Esi Baffour Agyeman',
  'Front desk uploaded a Ghana Card copy for the room 3 arrival and requested manager verification.',
  'Abena Frimpong',
  'receptionist',
  now() - interval '80 minutes',
  null,
  null,
  null,
  jsonb_build_object('guest_name', guest_profiles.full_name, 'document_type', documents.document_type, 'document_status', documents.status, 'room_number', '3')
from public.guest_identity_documents as documents
join public.guest_profiles on guest_profiles.id = documents.guest_profile_id
join seeded_guest_profiles on seeded_guest_profiles.id = guest_profiles.id and seeded_guest_profiles.guest_key = 'room3_guest'
join seeded_bookings on seeded_bookings.booking_key = 'room3_reserved';

insert into public.operational_handoffs (
  shift_id,
  created_by_staff_id,
  created_by_name,
  created_by_role,
  summary,
  handoff_scope,
  status,
  acknowledged_at,
  acknowledged_by,
  acknowledged_by_staff_id,
  closed_at,
  created_at,
  updated_at
)
select
  seeded_shifts.id,
  staff.id,
  'Abena Frimpong',
  'receptionist',
  'Carry over the room 2 extension request, the pending room 2 laundry receipt review, and the room 3 VIP arrival once KYC clears.',
  'reception',
  'open',
  null,
  null,
  null,
  null,
  now() - interval '25 minutes',
  now() - interval '25 minutes'
from seeded_shifts
join public.staff as staff on staff.id = seeded_shifts.staff_id
where seeded_shifts.shift_key = 'reception_open';

create temp table seeded_handoffs on commit drop as
select id
from public.operational_handoffs
where created_by_name = 'Abena Frimpong'
  and created_at >= now() - interval '30 minutes'
order by created_at desc
limit 1;

insert into public.operational_handoff_items (
  handoff_id,
  item_type,
  priority,
  title,
  detail,
  booking_id,
  room_id,
  service_request_id,
  owner_role,
  due_at,
  resolved,
  resolved_at,
  resolved_by,
  created_at,
  updated_at
)
select
  seeded_handoffs.id,
  item_seed.item_type,
  item_seed.priority,
  item_seed.title,
  item_seed.detail,
  seeded_bookings.id,
  rooms.id,
  seeded_service_requests.id,
  item_seed.owner_role,
  item_seed.due_at,
  false,
  null,
  null,
  item_seed.created_at,
  item_seed.created_at
from seeded_handoffs
cross join (
  values
    ('carryover_guest'::public.operational_handoff_item_type, 'high'::public.operational_handoff_priority, 'Confirm room 2 late checkout', 'Manager still needs to confirm the extra night before evening cutoff.', 'room2_active', '2', null, 'admin', now() + interval '3 hours', now() - interval '24 minutes'),
    ('unresolved_request'::public.operational_handoff_item_type, 'urgent'::public.operational_handoff_priority, 'Finish room 2 AC follow-up', 'Maintenance has started work but reception should confirm the guest is satisfied before close of shift.', 'room2_active', '2', 'room2_maintenance', 'maintenance', now() + interval '45 minutes', now() - interval '23 minutes'),
    ('vip_arrival'::public.operational_handoff_item_type, 'high'::public.operational_handoff_priority, 'Prepare room 3 VIP arrival', 'Guest arrives tomorrow morning after KYC review and airport pickup confirmation.', 'room3_reserved', '3', 'room3_arrival_support', 'reception', now() + interval '12 hours', now() - interval '22 minutes')
) as item_seed(item_type, priority, title, detail, booking_key, room_number, request_key, owner_role, due_at, created_at)
left join seeded_bookings on seeded_bookings.booking_key = item_seed.booking_key
left join public.rooms on rooms.number = item_seed.room_number
left join seeded_service_requests on seeded_service_requests.request_key = item_seed.request_key;

insert into public.notifications (type, message, triggered_by, booking_id, read, created_at)
select
  notice.notice_type,
  notice.message,
  notice.triggered_by,
  seeded_bookings.id,
  notice.was_read,
  notice.created_at
from (
  values
    ('request_assigned', 'Housekeeping is heading to room 1 with fresh towels.', 'Abena Frimpong', 'room1_active', false, now() - interval '30 minutes'),
    ('request_started', 'Maintenance started inspecting the room 2 air-conditioner.', 'Yaw Bediako', 'room2_active', false, now() - interval '100 minutes'),
    ('service_charge_receipt_review_required', 'Laundry receipt for room 2 awaits manager confirmation.', 'Abena Frimpong', 'room2_active', false, now() - interval '4 hours 40 minutes'),
    ('guest_kyc_review_requested', 'Guest KYC for room 3 is pending before arrival handoff closes.', 'Abena Frimpong', 'room3_reserved', false, now() - interval '78 minutes'),
    ('extension_confirmation_pending', 'Late checkout extension for room 2 was recorded and is pending manager confirmation.', 'Abena Frimpong', 'room2_active', false, now() - interval '66 minutes'),
    ('shift_handoff_created', 'Abena Frimpong created the current reception handoff with three carryover items.', 'Abena Frimpong', 'room2_active', true, now() - interval '24 minutes'),
    ('access_code_issued', 'Seam access code issued for room 1 and shared with the guest.', 'Abena Frimpong', 'room1_active', true, now() - interval '1 day'),
    ('arrival_prepared', 'Room 3 pre-arrival call is scheduled once the pending KYC review clears.', 'University Hotel Manager', 'room3_reserved', false, now() - interval '75 minutes')
) as notice(notice_type, message, triggered_by, booking_key, was_read, created_at)
join seeded_bookings on seeded_bookings.booking_key = notice.booking_key;