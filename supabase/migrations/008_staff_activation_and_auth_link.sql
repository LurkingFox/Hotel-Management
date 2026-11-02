alter table staff
add column if not exists active boolean not null default true;

alter table staff
add column if not exists auth_user_id uuid unique;

update staff
set active = true
where active is distinct from true;