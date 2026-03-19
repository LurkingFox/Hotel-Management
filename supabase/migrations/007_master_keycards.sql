alter table keycards
add column if not exists scope text not null default 'room';

update keycards
set scope = 'room'
where scope is distinct from 'room' and scope is not null;

alter table keycards
drop constraint if exists keycards_scope_valid;

alter table keycards
add constraint keycards_scope_valid check (scope in ('room', 'master'));