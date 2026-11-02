import { redirect } from 'next/navigation'

import { AdminHandoffsClient } from '@/app/(admin)/admin/handoffs/admin-handoffs-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type OperationalHandoffRow = Database['public']['Tables']['operational_handoffs']['Row']
type OperationalHandoffItemRow = Database['public']['Tables']['operational_handoff_items']['Row']

type HandoffItemWithRelations = OperationalHandoffItemRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  service_requests: Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'> | Array<Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'>> | null
}

type HandoffWithItems = OperationalHandoffRow & {
  operational_handoff_items: HandoffItemWithRelations[] | null
}

export default async function AdminHandoffsPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const [handoffsResult, unresolvedCountResult] = await Promise.all([
    supabase
      .from('operational_handoffs')
      .select('*, operational_handoff_items(*, bookings(id, guest_name, status), rooms(id, number, type, status), service_requests(id, title, status, priority))')
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false }),
    supabase.from('operational_handoff_items').select('id', { count: 'exact', head: true }).eq('resolved', false)
  ])

  if (handoffsResult.error) {
    throw new Error(handoffsResult.error.message)
  }

  if (unresolvedCountResult.error) {
    throw new Error(unresolvedCountResult.error.message)
  }

  return <AdminHandoffsClient handoffs={(handoffsResult.data ?? []) as HandoffWithItems[]} unresolvedCount={unresolvedCountResult.count ?? 0} />
}