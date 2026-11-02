insert into public.staff (name, role, daily_rate_ghs, on_shift, active, auth_user_id)
select
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(u.email, u.id::text), '@', 1)),
  'admin',
  320,
  false,
  true,
  u.id
from auth.users u
where coalesce(u.raw_user_meta_data ->> 'role', '') = 'admin'
  and not exists (
    select 1
    from public.staff s
    where s.auth_user_id = u.id
  );

create temp table preserved_manager_staff on commit drop as
select s.id
from public.staff s
where s.role = 'admin'
   or exists (
    select 1
    from auth.users u
    where u.id = s.auth_user_id
      and coalesce(u.raw_user_meta_data ->> 'role', '') = 'admin'
  );

update auth.users
set raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'staff_id') || jsonb_build_object('active', false)
where coalesce(raw_user_meta_data ->> 'role', '') <> 'admin';

truncate table
  public.access_log,
  public.notifications,
  public.shifts,
  public.door_controllers,
  public.keycards,
  public.payments,
  public.service_charges,
  public.bookings,
  public.rooms;

delete from public.staff
where id not in (select id from preserved_manager_staff);

update public.staff
set on_shift = false,
    active = true
where id in (select id from preserved_manager_staff);

insert into public.staff (name, role, daily_rate_ghs, on_shift, active)
values
  ('Adwoa Koomson', 'receptionist', 185, true, true),
  ('Kojo Bediako', 'receptionist', 180, false, true),
  ('Akua Mensimah', 'housekeeping', 150, true, true),
  ('Yaw Sarpong', 'night auditor', 195, false, true),
  ('Efua Tetteh', 'security', 175, true, true),
  ('Kwesi Nkrumah', 'maintenance', 170, false, true),
  ('Nana Ama Quaye', 'concierge', 165, false, true),
  ('Kofi Addae', 'accounts', 200, false, true),
  ('Beatrice Osei', 'housekeeping', 145, false, true);

insert into public.rooms (number, type, rate_ghs, status)
values
  ('1', 'single', 220, 'occupied'),
  ('2', 'double', 320, 'occupied'),
  ('3', 'double', 320, 'reserved'),
  ('4', 'single', 220, 'cleaning'),
  ('5', 'family', 480, 'vacant'),
  ('6', 'single', 220, 'vacant'),
  ('7', 'suite', 650, 'occupied'),
  ('8', 'double', 320, 'reserved'),
  ('9', 'single', 220, 'vacant'),
  ('10', 'family', 480, 'vacant'),
  ('11', 'single', 220, 'occupied'),
  ('12', 'double', 320, 'cleaning'),
  ('13', 'suite', 650, 'vacant'),
  ('14', 'single', 220, 'vacant'),
  ('15', 'double', 320, 'occupied'),
  ('16', 'family', 480, 'reserved'),
  ('17', 'single', 220, 'vacant'),
  ('18', 'double', 320, 'vacant'),
  ('19', 'suite', 650, 'vacant'),
  ('20', 'single', 220, 'maintenance');

with booking_seed(room_number, guest_name, guest_phone, check_in, check_out_expected, check_out_actual, nights, total_ghs, status, cancel_note) as (
  values
    ('1', 'Ama Serwaa Asare', '0244123456', current_date - 2, current_date + 2, null, 4, 880, 'active'::public.booking_status, null),
    ('2', 'Kwesi Tandoh', '0203344556', current_date - 1, current_date + 2, null, 3, 960, 'active'::public.booking_status, null),
    ('3', 'Abena Nyamekye', '0542211789', current_date + 1, current_date + 4, null, 3, 960, 'reserved'::public.booking_status, null),
    ('4', 'Michael Lartey', '0278893412', current_date - 5, current_date - 2, current_date - 2, 3, 660, 'checked_out'::public.booking_status, null),
    ('7', 'Naa Ayele Quaye', '0551942201', current_date - 1, current_date + 2, null, 3, 1950, 'active'::public.booking_status, null),
    ('8', 'Yaw Ofori-Atta', '0509921145', current_date + 2, current_date + 5, null, 3, 960, 'reserved'::public.booking_status, null),
    ('11', 'Efua Nkrumah', '0249056112', current_date - 3, current_date + 1, null, 4, 880, 'active'::public.booking_status, null),
    ('12', 'Kojo Adusei', '0261187345', current_date - 4, current_date - 1, current_date - 1, 3, 960, 'checked_out'::public.booking_status, null),
    ('15', 'Akosua Bekoe', '0594432210', current_date - 2, current_date + 1, null, 3, 960, 'active'::public.booking_status, null),
    ('16', 'Daniel Opoku', '0246678811', current_date + 3, current_date + 6, null, 3, 1440, 'reserved'::public.booking_status, null),
    ('18', 'Rita Agyapong', '0205512298', current_date + 1, current_date + 3, null, 2, 640, 'cancelled'::public.booking_status, 'Guest moved the trip to next month')
),
room_lookup as (
  select id, number
  from public.rooms
)
insert into public.bookings (room_id, guest_name, guest_phone, check_in, check_out_expected, check_out_actual, nights, total_ghs, status, cancel_note)
select
  room_lookup.id,
  booking_seed.guest_name,
  booking_seed.guest_phone,
  booking_seed.check_in,
  booking_seed.check_out_expected,
  booking_seed.check_out_actual,
  booking_seed.nights,
  booking_seed.total_ghs,
  booking_seed.status,
  booking_seed.cancel_note
from booking_seed
join room_lookup on room_lookup.number = booking_seed.room_number;

with service_seed(guest_name, type, amount_ghs, description, resolved, created_at) as (
  values
    ('Ama Serwaa Asare', 'food'::public.charge_type, 90, 'Late dinner tray and bottled water', false, now() - interval '18 hours'),
    ('Kwesi Tandoh', 'laundry'::public.charge_type, 45, 'Same-day ironing and laundry', true, now() - interval '1 day 3 hours'),
    ('Naa Ayele Quaye', 'minibar'::public.charge_type, 120, 'Mini fridge restock after arrival', false, now() - interval '9 hours'),
    ('Efua Nkrumah', 'food'::public.charge_type, 60, 'Breakfast for two', true, now() - interval '2 days'),
    ('Michael Lartey', 'laundry'::public.charge_type, 35, 'Pressed conference shirts', true, now() - interval '4 days'),
    ('Akosua Bekoe', 'other'::public.charge_type, 80, 'Airport shuttle arrangement', false, now() - interval '7 hours')
),
booking_lookup as (
  select id, guest_name
  from public.bookings
)
insert into public.service_charges (booking_id, type, amount_ghs, description, resolved, created_at)
select
  booking_lookup.id,
  service_seed.type,
  service_seed.amount_ghs,
  service_seed.description,
  service_seed.resolved,
  service_seed.created_at
from service_seed
join booking_lookup on booking_lookup.guest_name = service_seed.guest_name;

with payment_seed(guest_name, amount_ghs, method, reference, received_by, paid_at) as (
  values
    ('Michael Lartey', 695, 'cash'::public.pay_method, null, 'Kojo Bediako', now() - interval '3 days 20 hours'),
    ('Kojo Adusei', 960, 'bank_transfer'::public.pay_method, 'GT-CHK-2041', 'Kofi Addae', now() - interval '2 days 16 hours'),
    ('Ama Serwaa Asare', 400, 'momo'::public.pay_method, 'MOMO-447128', 'Adwoa Koomson', now() - interval '1 day 5 hours'),
    ('Kwesi Tandoh', 960, 'cash'::public.pay_method, null, 'Adwoa Koomson', now() - interval '19 hours'),
    ('Naa Ayele Quaye', 1500, 'bank_transfer'::public.pay_method, 'GCB-778214', 'Kofi Addae', now() - interval '12 hours'),
    ('Efua Nkrumah', 500, 'cash'::public.pay_method, null, 'Kojo Bediako', now() - interval '2 days 4 hours'),
    ('Akosua Bekoe', 700, 'momo'::public.pay_method, 'MOMO-552930', 'Adwoa Koomson', now() - interval '6 hours'),
    ('Abena Nyamekye', 320, 'cheque'::public.pay_method, 'ADB-004821', 'Kofi Addae', now() - interval '4 hours'),
    ('Daniel Opoku', 480, 'bank_transfer'::public.pay_method, 'GT-RES-1182', 'Kofi Addae', now() - interval '90 minutes')
),
booking_lookup as (
  select id, guest_name
  from public.bookings
)
insert into public.payments (booking_id, amount_ghs, method, reference, received_by, paid_at)
select
  booking_lookup.id,
  payment_seed.amount_ghs,
  payment_seed.method,
  payment_seed.reference,
  payment_seed.received_by,
  payment_seed.paid_at
from payment_seed
join booking_lookup on booking_lookup.guest_name = payment_seed.guest_name;

with keycard_seed(card_uid, room_number, guest_name, issued_to, issued_by, valid_from, valid_until, status, scope) as (
  values
    ('A1:B2:C3:D4', '1', 'Ama Serwaa Asare', 'Ama Serwaa Asare', 'Adwoa Koomson', current_date - 2, current_date + 2, 'active', 'room'),
    ('B2:C3:D4:E5', '2', 'Kwesi Tandoh', 'Kwesi Tandoh', 'Kojo Bediako', current_date - 1, current_date + 2, 'active', 'room'),
    ('C3:D4:E5:F6', '7', 'Naa Ayele Quaye', 'Naa Ayele Quaye', 'Adwoa Koomson', current_date - 1, current_date + 2, 'active', 'room'),
    ('D4:E5:F6:A7', '11', 'Efua Nkrumah', 'Efua Nkrumah', 'Kojo Bediako', current_date - 3, current_date + 1, 'active', 'room'),
    ('E5:F6:A7:B8', '15', 'Akosua Bekoe', 'Akosua Bekoe', 'Adwoa Koomson', current_date - 2, current_date + 1, 'active', 'room'),
    ('F6:A7:B8:C9', '12', 'Kojo Adusei', 'Kojo Adusei', 'Kojo Bediako', current_date - 4, current_date - 1, 'revoked', 'room'),
    ('FF:EE:DD:CC', null, null, coalesce((select name from public.staff where id in (select id from preserved_manager_staff) order by created_at asc limit 1), 'Hotel Manager'), coalesce((select name from public.staff where id in (select id from preserved_manager_staff) order by created_at asc limit 1), 'Hotel Manager'), current_date - 30, current_date + 180, 'active', 'master')
),
room_lookup as (
  select id, number
  from public.rooms
),
booking_lookup as (
  select id, guest_name
  from public.bookings
)
insert into public.keycards (card_uid, room_id, booking_id, issued_to, issued_by, issued_at, valid_from, valid_until, status, scope)
select
  keycard_seed.card_uid,
  room_lookup.id,
  booking_lookup.id,
  keycard_seed.issued_to,
  keycard_seed.issued_by,
  now() - interval '1 day',
  keycard_seed.valid_from,
  keycard_seed.valid_until,
  keycard_seed.status,
  keycard_seed.scope
from keycard_seed
left join room_lookup on room_lookup.number = keycard_seed.room_number
left join booking_lookup on booking_lookup.guest_name = keycard_seed.guest_name;

with notification_seed(type, message, triggered_by, booking_guest_name, keycard_uid, created_at) as (
  values
    ('reservation_created', 'Reservation secured for Abena Nyamekye in room 3.', 'Adwoa Koomson', 'Abena Nyamekye', null, now() - interval '5 hours'),
    ('reservation_created', 'Family booking blocked for Daniel Opoku in room 16.', 'Kojo Bediako', 'Daniel Opoku', null, now() - interval '2 hours'),
    ('booking_checked_in', 'Ama Serwaa Asare checked in and room 1 was handed over.', 'Adwoa Koomson', 'Ama Serwaa Asare', null, now() - interval '1 day 6 hours'),
    ('walk_in_checked_in', 'Kwesi Tandoh completed a walk-in check-in for room 2.', 'Kojo Bediako', 'Kwesi Tandoh', null, now() - interval '20 hours'),
    ('booking_checked_in', 'Naa Ayele Quaye checked in for the executive suite.', 'Adwoa Koomson', 'Naa Ayele Quaye', null, now() - interval '13 hours'),
    ('booking_checked_out', 'Michael Lartey checked out after conference stay.', 'Kojo Bediako', 'Michael Lartey', null, now() - interval '3 days 18 hours'),
    ('booking_checked_out', 'Kojo Adusei checked out and room 12 moved to cleaning.', 'Adwoa Koomson', 'Kojo Adusei', null, now() - interval '1 day 8 hours'),
    ('booking_cancelled', 'Rita Agyapong cancelled her reservation for room 18.', 'Adwoa Koomson', 'Rita Agyapong', null, now() - interval '80 minutes'),
    ('service_charge_added', 'Airport shuttle charge posted to Akosua Bekoe.', 'Adwoa Koomson', 'Akosua Bekoe', null, now() - interval '7 hours'),
    ('service_charge_added', 'Mini bar charge posted to Naa Ayele Quaye.', 'Adwoa Koomson', 'Naa Ayele Quaye', null, now() - interval '9 hours'),
    ('keycard_issued', 'Keycard issued to Ama Serwaa Asare.', 'Adwoa Koomson', 'Ama Serwaa Asare', 'A1:B2:C3:D4', now() - interval '1 day 6 hours'),
    ('master_key_issued', 'Master key issued to the hotel manager.', coalesce((select name from public.staff where id in (select id from preserved_manager_staff) order by created_at asc limit 1), 'Hotel Manager'), null, 'FF:EE:DD:CC', now() - interval '30 minutes')
),
booking_lookup as (
  select id, guest_name
  from public.bookings
),
keycard_lookup as (
  select id, card_uid
  from public.keycards
)
insert into public.notifications (type, message, triggered_by, booking_id, keycard_id, read, created_at)
select
  notification_seed.type,
  notification_seed.message,
  notification_seed.triggered_by,
  booking_lookup.id,
  keycard_lookup.id,
  false,
  notification_seed.created_at
from notification_seed
left join booking_lookup on booking_lookup.guest_name = notification_seed.booking_guest_name
left join keycard_lookup on keycard_lookup.card_uid = notification_seed.keycard_uid;

with access_seed(room_number, card_uid, guest_name, issued_by, result, note, accessed_at, keycard_uid) as (
  values
    ('1', 'A1:B2:C3:D4', 'Ama Serwaa Asare', 'Adwoa Koomson', 'granted'::public.access_result, 'Guest returned from evening meeting', now() - interval '5 hours', 'A1:B2:C3:D4'),
    ('2', 'B2:C3:D4:E5', 'Kwesi Tandoh', 'Kojo Bediako', 'granted'::public.access_result, 'Guest entered after lunch', now() - interval '3 hours', 'B2:C3:D4:E5'),
    ('7', 'C3:D4:E5:F6', 'Naa Ayele Quaye', 'Adwoa Koomson', 'granted'::public.access_result, 'Suite access successful', now() - interval '2 hours', 'C3:D4:E5:F6'),
    ('11', 'D4:E5:F6:A7', 'Efua Nkrumah', 'Kojo Bediako', 'granted'::public.access_result, 'Guest returned from breakfast', now() - interval '1 day', 'D4:E5:F6:A7'),
    ('15', 'E5:F6:A7:B8', 'Akosua Bekoe', 'Adwoa Koomson', 'granted'::public.access_result, 'Guest accessed room after shuttle booking', now() - interval '4 hours', 'E5:F6:A7:B8'),
    ('12', 'F6:A7:B8:C9', 'Kojo Adusei', 'Kojo Bediako', 'expired'::public.access_result, 'Old card tapped after checkout', now() - interval '18 hours', 'F6:A7:B8:C9'),
    ('3', '0A:0B:0C:0D', 'Unknown guest', 'Adwoa Koomson', 'denied'::public.access_result, 'Attempted entry before reservation check-in', now() - interval '70 minutes', null),
    ('20', 'FF:EE:DD:CC', null, coalesce((select name from public.staff where id in (select id from preserved_manager_staff) order by created_at asc limit 1), 'Hotel Manager'), 'granted'::public.access_result, 'Manager inspected maintenance room', now() - interval '25 minutes', 'FF:EE:DD:CC')
),
room_lookup as (
  select id, number
  from public.rooms
),
keycard_lookup as (
  select id, card_uid
  from public.keycards
)
insert into public.access_log (room_id, card_uid, keycard_id, guest_name, issued_by, result, note, accessed_at)
select
  room_lookup.id,
  access_seed.card_uid,
  keycard_lookup.id,
  access_seed.guest_name,
  access_seed.issued_by,
  access_seed.result,
  access_seed.note,
  access_seed.accessed_at
from access_seed
join room_lookup on room_lookup.number = access_seed.room_number
left join keycard_lookup on keycard_lookup.card_uid = access_seed.keycard_uid;

with controller_seed(room_number, controller_id, heartbeat_status, last_seen_at, last_card_uid, last_result, last_note, last_error, firmware_version) as (
  values
    ('1', 'CTRL-001', 'online', now() - interval '1 minute', 'A1:B2:C3:D4', 'granted'::public.access_result, 'Room 1 controller healthy', null, 'v1.4.2'),
    ('2', 'CTRL-002', 'online', now() - interval '2 minutes', 'B2:C3:D4:E5', 'granted'::public.access_result, 'Room 2 controller healthy', null, 'v1.4.2'),
    ('3', 'CTRL-003', 'degraded', now() - interval '7 minutes', '0A:0B:0C:0D', 'denied'::public.access_result, 'Reservation room awaiting guest check-in', 'Intermittent lock response', 'v1.4.0'),
    ('4', 'CTRL-004', 'online', now() - interval '3 minutes', null, null, 'Cleaning mode', null, 'v1.4.2'),
    ('5', 'CTRL-005', 'online', now() - interval '4 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('6', 'CTRL-006', 'online', now() - interval '3 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('7', 'CTRL-007', 'online', now() - interval '1 minute', 'C3:D4:E5:F6', 'granted'::public.access_result, 'Suite controller healthy', null, 'v1.4.3'),
    ('8', 'CTRL-008', 'online', now() - interval '6 minutes', null, null, 'Reserved for late-night arrival', null, 'v1.4.1'),
    ('9', 'CTRL-009', 'online', now() - interval '5 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('10', 'CTRL-010', 'online', now() - interval '5 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('11', 'CTRL-011', 'online', now() - interval '2 minutes', 'D4:E5:F6:A7', 'granted'::public.access_result, 'Room 11 controller healthy', null, 'v1.4.2'),
    ('12', 'CTRL-012', 'degraded', now() - interval '11 minutes', 'F6:A7:B8:C9', 'expired'::public.access_result, 'Old card rejected correctly', 'Battery replacement due', 'v1.3.9'),
    ('13', 'CTRL-013', 'online', now() - interval '4 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('14', 'CTRL-014', 'online', now() - interval '4 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('15', 'CTRL-015', 'online', now() - interval '2 minutes', 'E5:F6:A7:B8', 'granted'::public.access_result, 'Room 15 controller healthy', null, 'v1.4.2'),
    ('16', 'CTRL-016', 'online', now() - interval '6 minutes', null, null, 'Reserved for family arrival', null, 'v1.4.1'),
    ('17', 'CTRL-017', 'online', now() - interval '5 minutes', null, null, 'No recent taps', null, 'v1.4.2'),
    ('18', 'CTRL-018', 'online', now() - interval '5 minutes', null, null, 'Vacant room', null, 'v1.4.2'),
    ('19', 'CTRL-019', 'offline', now() - interval '45 minutes', null, null, 'Controller offline for observation', 'Network signal lost', 'v1.3.8'),
    ('20', 'CTRL-020', 'degraded', now() - interval '9 minutes', 'FF:EE:DD:CC', 'granted'::public.access_result, 'Maintenance room inspected by manager', 'Panel tamper warning cleared', 'v1.4.0')
),
room_lookup as (
  select id, number
  from public.rooms
)
insert into public.door_controllers (controller_id, room_id, heartbeat_status, last_seen_at, last_card_uid, last_result, last_note, last_error, firmware_version)
select
  controller_seed.controller_id,
  room_lookup.id,
  controller_seed.heartbeat_status,
  controller_seed.last_seen_at,
  controller_seed.last_card_uid,
  controller_seed.last_result,
  controller_seed.last_note,
  controller_seed.last_error,
  controller_seed.firmware_version
from controller_seed
join room_lookup on room_lookup.number = controller_seed.room_number;

with shift_seed(staff_name, started_at, ended_at) as (
  values
    ('Adwoa Koomson', now() - interval '7 hours', null),
    ('Akua Mensimah', now() - interval '6 hours 30 minutes', null),
    ('Efua Tetteh', now() - interval '8 hours', null),
    ('Kojo Bediako', now() - interval '1 day 9 hours', now() - interval '1 day 1 hour'),
    ('Yaw Sarpong', now() - interval '12 hours', now() - interval '4 hours'),
    ('Kwesi Nkrumah', now() - interval '2 days 8 hours', now() - interval '2 days 2 hours'),
    ('Nana Ama Quaye', now() - interval '1 day 6 hours', now() - interval '23 hours'),
    ('Kofi Addae', now() - interval '9 hours', now() - interval '2 hours'),
    ('Beatrice Osei', now() - interval '2 days 7 hours', now() - interval '2 days 1 hour')
),
staff_lookup as (
  select id, name
  from public.staff
)
insert into public.shifts (staff_id, started_at, ended_at)
select
  staff_lookup.id,
  shift_seed.started_at,
  shift_seed.ended_at
from shift_seed
join staff_lookup on staff_lookup.name = shift_seed.staff_name;