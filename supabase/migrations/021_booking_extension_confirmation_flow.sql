alter table public.booking_extension_audits
  add column if not exists confirmation_status text not null default 'confirmed',
  add column if not exists confirmed_by text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_note text;

update public.booking_extension_audits
set
  authorization_mode = case
    when authorization_mode = 'admin_direct' then 'admin_direct'
    else 'reception_confirmed'
  end,
  confirmation_status = case
    when authorization_mode = 'admin_direct' then 'confirmed'
    else 'pending'
  end,
  confirmed_by = case
    when authorization_mode = 'admin_direct' then coalesce(confirmed_by, requested_by)
    else confirmed_by
  end,
  confirmed_at = case
    when authorization_mode = 'admin_direct' then coalesce(confirmed_at, created_at)
    else confirmed_at
  end,
  confirmation_note = case
    when authorization_mode = 'admin_direct' then coalesce(confirmation_note, 'Confirmed directly at extension time.')
    else confirmation_note
  end
where authorization_mode in ('admin_direct', 'manager_approved', 'emergency_override');

alter table public.booking_extension_audits
  drop constraint if exists booking_extension_audits_authorization_mode_check;

alter table public.booking_extension_audits
  add constraint booking_extension_audits_authorization_mode_check
  check (authorization_mode in ('admin_direct', 'reception_confirmed'));

alter table public.booking_extension_audits
  drop constraint if exists booking_extension_audits_confirmation_status_check;

alter table public.booking_extension_audits
  add constraint booking_extension_audits_confirmation_status_check
  check (confirmation_status in ('pending', 'confirmed', 'disputed'));

create index if not exists booking_extension_audits_confirmation_status_created_at_idx
  on public.booking_extension_audits (confirmation_status, created_at desc);