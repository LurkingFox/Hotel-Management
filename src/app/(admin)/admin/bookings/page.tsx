import { redirect } from 'next/navigation'

import { AdminBookingsClient } from '@/app/(admin)/admin/bookings/admin-bookings-client'
import { getBookingAccessPresentation } from '@/lib/access-provider/config'
import { createGuestPortalToken } from '@/lib/guest-portal-token'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']
type GuestProfileRow = Database['public']['Tables']['guest_profiles']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']

type BookingWithRoom = BookingRow & {
  guest_profiles:
    | Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>
    | Array<Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>>
    | null
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

  const [
    { data: rooms, error: roomsError },
    { data: bookings, error: bookingsError },
    { data: pendingAudits, error: pendingAuditsError },
    { data: accessCredentials, error: accessCredentialsError }
  ] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase
      .from('bookings')
      .select('*, rooms(id, number, type, rate_ghs, status), guest_profiles(id, full_name, phone, email, kyc_status, nationality)')
      .order('check_in', { ascending: false }),
    supabase
      .from('booking_extension_audits')
      .select('id, booking_id, requested_by, reason, created_at, incremental_amount_ghs, new_check_out_expected, confirmation_status')
      .eq('confirmation_status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('booking_access_credentials').select('booking_id, credential_code, status, valid_until').eq('status', 'active')
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

  if (accessCredentialsError) {
    throw new Error(accessCredentialsError.message)
  }

  return (
    <AdminBookingsClient
      accessPresentation={getBookingAccessPresentation()}
      accessCredentials={(accessCredentials ?? []) as Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>}
      bookings={(bookings ?? []) as BookingWithRoom[]}
      guestPortalLinks={new Map(
        ((accessCredentials ?? []) as Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>)
          .filter((credential) => credential.credential_code)
          .map((credential) => [
            credential.booking_id,
            `/guest?token=${encodeURIComponent(createGuestPortalToken({ bookingId: credential.booking_id, code: credential.credential_code as string }))}`
          ])
      )}
      pendingExtensionAudits={(pendingAudits ?? []) as PendingExtensionAudit[]}
      rooms={(rooms ?? []) as RoomRow[]}
    />
  )
}