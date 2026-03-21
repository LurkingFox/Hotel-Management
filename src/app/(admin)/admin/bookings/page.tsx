import { redirect } from 'next/navigation'

import { AdminBookingsClient } from '@/app/(admin)/admin/bookings/admin-bookings-client'
import { getBookingAccessPresentation } from '@/lib/access-provider/config'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']

type BookingWithRoom = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type PendingExtensionAudit = Pick<
  ExtensionAuditRow,
  'id' | 'booking_id' | 'requested_by' | 'reason' | 'created_at' | 'incremental_amount_ghs' | 'new_check_out_expected' | 'confirmation_status'
>

export default async function AdminBookingsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }, { data: pendingAudits, error: pendingAuditsError }] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase.from('bookings').select('*, rooms(id, number, type, rate_ghs, status)').order('check_in', { ascending: false }),
    supabase
      .from('booking_extension_audits')
      .select('id, booking_id, requested_by, reason, created_at, incremental_amount_ghs, new_check_out_expected, confirmation_status')
      .eq('confirmation_status', 'pending')
      .order('created_at', { ascending: false })
  ])

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }

  if (pendingAuditsError) {
    throw new Error(pendingAuditsError.message)
  }

  return (
    <AdminBookingsClient
      accessPresentation={getBookingAccessPresentation()}
      bookings={(bookings ?? []) as BookingWithRoom[]}
      pendingExtensionAudits={(pendingAudits ?? []) as PendingExtensionAudit[]}
      rooms={(rooms ?? []) as RoomRow[]}
    />
  )
}