import { redirect } from 'next/navigation'

import { ReceptionDeskClient } from '@/app/(reception)/reception/desk/reception-desk-client'
import { getBookingAccessPresentation } from '@/lib/access-provider/config'
import { createGuestPortalToken } from '@/lib/guest-portal-token'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type GuestProfileRow = Database['public']['Tables']['guest_profiles']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']

type BookingWithRoom = BookingRow & {
  guest_profiles:
    | Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>
    | Array<Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>>
    | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

export default async function ReceptionDeskPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }, { data: accessCredentials, error: accessCredentialsError }] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase
      .from('bookings')
      .select('*, rooms(id, number, type, rate_ghs, status), guest_profiles(id, full_name, phone, email, kyc_status, nationality)')
      .order('check_in', { ascending: true }),
    supabase.from('booking_access_credentials').select('booking_id, credential_code, status, valid_until').eq('status', 'active')
  ])

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  if (bookingsError) {
    throw new Error(bookingsError.message)
  }

  if (accessCredentialsError) {
    throw new Error(accessCredentialsError.message)
  }

  return (
    <ReceptionDeskClient
      accessPresentation={getBookingAccessPresentation()}
      accessCredentials={(accessCredentials ?? []) as Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>}
      guestPortalLinks={new Map(
        ((accessCredentials ?? []) as Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>)
          .filter((credential) => credential.credential_code)
          .map((credential) => [
            credential.booking_id,
            `/guest?token=${encodeURIComponent(createGuestPortalToken({ bookingId: credential.booking_id, code: credential.credential_code as string }))}`
          ])
      )}
      bookings={(bookings ?? []) as BookingWithRoom[]}
      currentRole={typeof user.user_metadata.role === 'string' ? user.user_metadata.role : null}
      rooms={(rooms ?? []) as RoomRow[]}
    />
  )
}