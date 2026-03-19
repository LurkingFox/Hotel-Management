import { redirect } from 'next/navigation'

import { HotelProfileSettingsClient } from '@/app/(admin)/admin/settings/hotel-profile-settings-client'
import { buildHotelProfile } from '@/lib/hotel-info'
import { getSampleLogos } from '@/lib/sample-logos'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type HotelProfileRow = Database['public']['Tables']['hotel_profile']['Row']

export default async function AdminSettingsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }
  const { data, error } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return <HotelProfileSettingsClient initialProfile={buildHotelProfile((data ?? null) as HotelProfileRow | null)} sampleLogos={getSampleLogos()} />
}