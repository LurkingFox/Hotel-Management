import { redirect } from 'next/navigation'

import { AdminBookingsClient } from '@/app/(admin)/admin/bookings/admin-bookings-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

type BookingWithRoom = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

export default async function AdminBookingsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase.from('bookings').select('*, rooms(id, number, type, rate_ghs, status)').order('check_in', { ascending: false })
  ])

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }

  return <AdminBookingsClient bookings={(bookings ?? []) as BookingWithRoom[]} rooms={(rooms ?? []) as RoomRow[]} />
}