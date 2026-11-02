import { redirect } from 'next/navigation'

import { GuestProfilesWorkbench, type GuestProfileWithRelations } from '@/components/guest-profiles-workbench'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']

type UnlinkedBooking = Pick<BookingRow, 'id' | 'guest_name' | 'guest_phone' | 'check_in' | 'check_out_expected' | 'status'> & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

export default async function AdminGuestsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profiles, error: profilesError }, { data: unlinkedBookings, error: unlinkedError }] = await Promise.all([
    supabase
      .from('guest_profiles')
      .select(
        'id, full_name, phone, email, nationality, city, date_of_birth, kyc_status, kyc_notes, last_stayed_at, created_at, updated_at, guest_identity_documents(id, document_type, document_number, issuing_country, issued_on, expires_on, status, verification_notes, verified_at, verified_by, created_at, updated_at), bookings(id, guest_name, guest_phone, guest_profile_id, check_in, check_out_expected, status, rooms(number, type))'
      )
      .order('updated_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, guest_name, guest_phone, check_in, check_out_expected, status, rooms(number, type)')
      .is('guest_profile_id', null)
      .order('check_in', { ascending: false })
      .limit(8)
  ])

  if (profilesError) {
    throw new Error(profilesError.message)
  }

  if (unlinkedError) {
    throw new Error(unlinkedError.message)
  }

  return <GuestProfilesWorkbench mode="admin" profiles={(profiles ?? []) as GuestProfileWithRelations[]} unlinkedBookings={(unlinkedBookings ?? []) as UnlinkedBooking[]} />
}