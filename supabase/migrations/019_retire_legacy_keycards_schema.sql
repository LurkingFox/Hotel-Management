alter table public.access_log
  rename column card_uid to credential_identifier;

alter table public.access_log
  drop constraint if exists access_log_keycard_id_fkey;

alter table public.access_log
  drop column if exists keycard_id;

alter table public.booking_access_credentials
  drop constraint if exists booking_access_credentials_local_keycard_id_fkey;

alter table public.booking_access_credentials
  drop column if exists local_keycard_id;

drop policy if exists keycards_admin_read on public.keycards;
drop policy if exists keycards_write on public.keycards;

drop table if exists public.keycards;