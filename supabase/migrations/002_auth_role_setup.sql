update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin","name":"University Hotel Manager"}'::jsonb
where email = 'manager@universityhotel.com';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"receptionist","name":"University Hotel Reception"}'::jsonb
where email = 'reception@universityhotel.com';