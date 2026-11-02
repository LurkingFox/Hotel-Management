create or replace function sync_booking_total_ghs_from_service_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update bookings
  set total_ghs = total_ghs + new.amount_ghs
  where id = new.booking_id;

  return new;
end;
$$;

drop trigger if exists service_charges_sync_booking_total_ghs on service_charges;

create trigger service_charges_sync_booking_total_ghs
after insert on service_charges
for each row execute function sync_booking_total_ghs_from_service_charge();