import { redirect } from 'next/navigation'

import { AdminKeycardsClient } from '@/app/(admin)/admin/keycards/admin-keycards-client'
import {
  applyKeycardFilters,
  buildKeycardsQueryString,
  getMatchingKeycardBookingIds,
  getMatchingKeycardRoomIds,
  parseKeycardStatus,
  type KeycardsFilters
} from '@/lib/admin-history/keycards'
import { getPage, getSingleParam, isDateInput } from '@/lib/admin-history/shared'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type KeycardRow = Database['public']['Tables']['keycards']['Row']
type KeycardScope = 'room' | 'master'
type KeycardStatus = 'active' | 'revoked'

type KeycardWithRelations = KeycardRow & {
  scope?: KeycardScope | null
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type KeycardsSearchParams = {
  from?: string | string[]
  page?: string | string[]
  query?: string | string[]
  status?: string | string[]
  to?: string | string[]
}

const PAGE_SIZE = 12

export default async function AdminKeycardsPage({ searchParams }: { searchParams?: KeycardsSearchParams }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const query = getSingleParam(searchParams?.query).trim()
  const fromDate = getSingleParam(searchParams?.from)
  const toDate = getSingleParam(searchParams?.to)
  const statusParam = getSingleParam(searchParams?.status)
  const requestedPage = getPage(searchParams?.page)
  const status: 'all' | KeycardStatus = parseKeycardStatus(statusParam)

  const filters: KeycardsFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    status,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingKeycardRoomIds(supabase, filters.query)
  const bookingIds = await getMatchingKeycardBookingIds(supabase, filters.query, roomIds)
  const rangeFrom = (requestedPage - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  let keycardsQuery = supabase
    .from('keycards')
    .select('*, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status)', { count: 'exact' })
    .order('issued_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  keycardsQuery = applyKeycardFilters(keycardsQuery, filters, bookingIds, roomIds)

  const [keycardsResponse, summaryResponse, roomsResponse, liveCoverageResponse] = await Promise.all([
    keycardsQuery,
    applyKeycardFilters(supabase.from('keycards').select('status, scope, access_count, room_id'), filters, bookingIds, roomIds),
    supabase.from('rooms').select('*').order('number'),
    supabase.from('keycards').select('room_id, scope, status').eq('status', 'active')
  ])

  if (keycardsResponse.error) {
    throw new Error(keycardsResponse.error.message)
  }

  if (summaryResponse.error) {
    throw new Error(summaryResponse.error.message)
  }

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message)
  }

  if (liveCoverageResponse.error) {
    throw new Error(liveCoverageResponse.error.message)
  }

  const totalCount = keycardsResponse.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(requestedPage, totalPages)

  if (safePage !== requestedPage) {
    const queryString = buildKeycardsQueryString(filters, safePage)
    redirect(queryString ? `/admin/keycards?${queryString}` : '/admin/keycards')
  }

  const rooms = (roomsResponse.data ?? []) as RoomRow[]
  const summaryRows = (summaryResponse.data ?? []) as Array<Pick<KeycardRow, 'access_count' | 'room_id' | 'status'> & { scope?: string | null }>
  const liveCoverageRows = (liveCoverageResponse.data ?? []) as Array<Pick<KeycardRow, 'room_id' | 'status'> & { scope?: string | null }>

  const roomCoverage = rooms.map((room) => ({
    activeCards: liveCoverageRows.filter((keycard) => keycard.room_id === room.id && (keycard.scope ?? 'room') !== 'master').length,
    room
  }))

  return (
    <AdminKeycardsClient
      currentPage={safePage}
      filters={filters}
      keycards={(keycardsResponse.data ?? []) as KeycardWithRelations[]}
      liveActiveMasterCount={liveCoverageRows.filter((keycard) => (keycard.scope ?? 'room') === 'master').length}
      roomCoverage={roomCoverage}
      summary={{
        active: summaryRows.filter((keycard) => keycard.status === 'active').length,
        master: summaryRows.filter((keycard) => (keycard.scope ?? 'room') === 'master' && keycard.status === 'active').length,
        revoked: summaryRows.filter((keycard) => keycard.status === 'revoked').length,
        roomsCovered: new Set(summaryRows.map((keycard) => keycard.room_id).filter(Boolean)).size,
        taps: summaryRows.reduce((sum, keycard) => sum + keycard.access_count, 0)
      }}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}