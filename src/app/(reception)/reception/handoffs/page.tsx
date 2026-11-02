import { redirect } from 'next/navigation'

import { ReceptionHandoffsClient } from '@/app/(reception)/reception/handoffs/reception-handoffs-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type OperationalHandoffRow = Database['public']['Tables']['operational_handoffs']['Row']
type OperationalHandoffItemRow = Database['public']['Tables']['operational_handoff_items']['Row']

type ActiveBooking = Pick<BookingRow, 'id' | 'guest_name' | 'balance_ghs' | 'check_out_expected' | 'status'> & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

type OpenRequest = Pick<ServiceRequestRow, 'id' | 'title' | 'priority' | 'status' | 'guest_name'> & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

type RoomIssue = Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>

type HandoffItemWithRelations = OperationalHandoffItemRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  service_requests: Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'> | Array<Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'>> | null
}

type HandoffWithItems = OperationalHandoffRow & {
  operational_handoff_items: HandoffItemWithRelations[] | null
}

function getDateParts(offsetDays = 0) {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() + offsetDays)
  return value.toISOString().split('T')[0]
}

export default async function ReceptionHandoffsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const tomorrow = getDateParts(1)
  const dayAfterTomorrow = getDateParts(2)

  const [balancesResult, requestsResult, roomsResult, handoffsResult, upcomingResult] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, guest_name, balance_ghs, check_out_expected, status, rooms(id, number, type, status)')
      .eq('status', 'active')
      .gt('balance_ghs', 0)
      .order('check_out_expected', { ascending: true })
      .limit(8),
    supabase
      .from('service_requests')
      .select('id, title, priority, status, guest_name, rooms(id, number, type, status)')
      .in('status', ['new', 'acknowledged', 'assigned', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('rooms').select('id, number, type, status').in('status', ['maintenance', 'cleaning']).order('number'),
    supabase
      .from('operational_handoffs')
      .select('*, operational_handoff_items(*, bookings(id, guest_name, status), rooms(id, number, type, status), service_requests(id, title, status, priority))')
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('bookings')
      .select('id, guest_name, balance_ghs, check_out_expected, status, rooms(id, number, type, status)')
      .eq('status', 'reserved')
      .gte('check_in', tomorrow)
      .lte('check_in', dayAfterTomorrow)
      .order('check_in', { ascending: true })
      .limit(8)
  ])

  if (balancesResult.error) throw new Error(balancesResult.error.message)
  if (requestsResult.error) throw new Error(requestsResult.error.message)
  if (roomsResult.error) throw new Error(roomsResult.error.message)
  if (handoffsResult.error) throw new Error(handoffsResult.error.message)
  if (upcomingResult.error) throw new Error(upcomingResult.error.message)

  return (
    <ReceptionHandoffsClient
      activeBalances={(balancesResult.data ?? []) as ActiveBooking[]}
      handoffs={(handoffsResult.data ?? []) as HandoffWithItems[]}
      openRequests={(requestsResult.data ?? []) as OpenRequest[]}
      roomIssues={(roomsResult.data ?? []) as RoomIssue[]}
      upcomingBookings={(upcomingResult.data ?? []) as ActiveBooking[]}
    />
  )
}