import { redirect } from 'next/navigation'

import { ReceptionDeskClient } from '@/app/(reception)/reception/desk/reception-desk-client'
import { getBookingAccessPresentation } from '@/lib/access-provider/config'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

type BookingWithRoom = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

export default async function ReceptionDeskPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase.from('bookings').select('*, rooms(id, number, type, rate_ghs, status)').order('check_in', { ascending: true })
  ])

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }
  return (
    <ReceptionDeskClient
      accessPresentation={getBookingAccessPresentation()}
      bookings={(bookings ?? []) as BookingWithRoom[]}
      currentRole={typeof user.user_metadata.role === 'string' ? user.user_metadata.role : null}
      rooms={(rooms ?? []) as RoomRow[]}
    />
  )
}