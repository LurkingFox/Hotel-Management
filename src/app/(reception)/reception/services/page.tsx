import { redirect } from 'next/navigation'

import { ReceptionServicesClient } from '@/app/(reception)/reception/services/reception-services-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']

type ActiveBooking = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type ServiceChargeWithBooking = ServiceChargeRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | null
      })
    | null
}

export default async function ReceptionServicesPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: bookings, error: bookingsError }, { data: serviceCharges, error: serviceChargesError }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, rooms(id, number, type, rate_ghs, status)')
      .eq('status', 'active')
      .order('check_in', { ascending: true }),
    supabase
      .from('service_charges')
      .select('*, bookings(id, guest_name, status, check_in, check_out_expected, rooms(number, type))')
      .order('created_at', { ascending: false })
  ])

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }

  if (serviceChargesError) {
    throw new Error(serviceChargesError.message)
  }

  return (
    <ReceptionServicesClient
      activeBookings={(bookings ?? []) as ActiveBooking[]}
      serviceCharges={(serviceCharges ?? []) as ServiceChargeWithBooking[]}
    />
  )
}