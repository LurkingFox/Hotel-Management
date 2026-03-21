alter table public.notifications
  drop constraint if exists notifications_keycard_id_fkey;

alter table public.notifications
  drop column if exists keycard_id;

drop table if exists public.door_controllers;