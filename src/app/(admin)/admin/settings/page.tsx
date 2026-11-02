import { redirect } from 'next/navigation'

import { HotelProfileSettingsClient } from '@/app/(admin)/admin/settings/hotel-profile-settings-client'
import { buildHotelProfile } from '@/lib/hotel-info'
import { getSampleLogos } from '@/lib/sample-logos'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type HotelProfileRow = Database['public']['Tables']['hotel_profile']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type RoomAccessDeviceRow = Database['public']['Tables']['room_access_devices']['Row']

export default async function AdminSettingsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [hotelProfileResult, roomsResult, mappingsResult] = await Promise.all([
    supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle(),
    supabase.from('rooms').select('id, number, type, status').order('number'),
    supabase.from('room_access_devices').select('id, room_id, provider, external_device_id, display_name, updated_at').eq('provider', 'seam')
  ])

  if (hotelProfileResult.error) {
    throw new Error(hotelProfileResult.error.message)
  }

  if (roomsResult.error) {
    throw new Error(roomsResult.error.message)
  }

  if (mappingsResult.error) {
    throw new Error(mappingsResult.error.message)
  }

  const mappingsByRoomId = new Map((mappingsResult.data ?? []).map((mapping) => [mapping.room_id, mapping]))

  return (
    <HotelProfileSettingsClient
      initialMappings={((roomsResult.data ?? []) as Pick<RoomRow, 'id' | 'number' | 'status' | 'type'>[]).map((room) => {
        const mapping = mappingsByRoomId.get(room.id) as Pick<RoomAccessDeviceRow, 'display_name' | 'external_device_id' | 'id' | 'provider' | 'updated_at'> | undefined

        return {
          displayName: mapping?.display_name ?? '',
          externalDeviceId: mapping?.external_device_id ?? '',
          provider: mapping?.provider ?? 'seam',
          room,
          roomAccessDeviceId: mapping?.id ?? null,
          updatedAt: mapping?.updated_at ?? null
        }
      })}
      initialProfile={buildHotelProfile((hotelProfileResult.data ?? null) as HotelProfileRow | null)}
      sampleLogos={getSampleLogos()}
    />
  )
}