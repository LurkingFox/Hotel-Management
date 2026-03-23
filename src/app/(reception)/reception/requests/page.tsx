import { redirect } from 'next/navigation'

import { ReceptionRequestsClient } from '@/app/(reception)/reception/requests/reception-requests-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ServiceRequestEventRow = Database['public']['Tables']['service_request_events']['Row']

type ActiveBooking = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type ServiceRequestEventSummary = Pick<ServiceRequestEventRow, 'id' | 'service_request_id' | 'event_type' | 'message' | 'actor_name' | 'actor_role' | 'created_at'>

type ServiceRequestWithRelations = ServiceRequestRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

export default async function ReceptionRequestsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: requests, error: requestsError }, { data: bookings, error: bookingsError }, { data: rooms, error: roomsError }, { data: requestEvents, error: requestEventsError }] = await Promise.all([
    supabase
      .from('service_requests')
      .select('*, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status)')
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('*, rooms(id, number, type, status)')
      .eq('status', 'active')
      .order('check_in', { ascending: true }),
    supabase.from('rooms').select('id, number, type, status').order('number', { ascending: true }),
    supabase
      .from('service_request_events')
      .select('id, service_request_id, event_type, message, actor_name, actor_role, created_at')
      .order('created_at', { ascending: false })
  ])

  if (requestsError) {
    throw new Error(requestsError.message)
  }

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  if (requestEventsError) {
    throw new Error(requestEventsError.message)
  }

  return (
    <ReceptionRequestsClient
      activeBookings={(bookings ?? []) as ActiveBooking[]}
      requestEvents={(requestEvents ?? []) as ServiceRequestEventSummary[]}
      requests={(requests ?? []) as ServiceRequestWithRelations[]}
      rooms={(rooms ?? []) as Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>[]}
    />
  )
}