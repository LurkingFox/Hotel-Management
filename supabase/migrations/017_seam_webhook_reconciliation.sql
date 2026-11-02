alter table public.booking_access_credentials
  add column if not exists provider_event_id text,
  add column if not exists provider_event_type text,
  add column if not exists provider_event_occurred_at timestamptz,
  add column if not exists provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text;

create index if not exists booking_access_credentials_provider_event_id_idx
  on public.booking_access_credentials (provider_event_id)
  where provider_event_id is not null;

create index if not exists booking_access_credentials_provider_status_idx
  on public.booking_access_credentials (provider, provider_status);