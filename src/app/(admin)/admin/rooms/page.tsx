import { redirect } from 'next/navigation'

import { AdminRoomsClient } from '@/app/(admin)/admin/rooms/admin-rooms-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']

export default async function AdminRoomsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const { data: rooms, error } = await supabase.from('rooms').select('*').order('number')

  if (error) {
    throw new Error(error.message)
  }

  return <AdminRoomsClient rooms={(rooms ?? []) as RoomRow[]} />
}