create or replace function sync_booking_paid_ghs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update bookings
  set paid_ghs = coalesce((
    select sum(amount_ghs)
    from payments
    where booking_id = new.booking_id
  ), 0)
  where id = new.booking_id;

  return new;
end;
$$;