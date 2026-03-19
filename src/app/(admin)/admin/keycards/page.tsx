import { redirect } from 'next/navigation'

import { AdminKeycardsClient } from '@/app/(admin)/admin/keycards/admin-keycards-client'
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

type KeycardsFilters = {
  fromDate: string
  query: string
  status: 'all' | KeycardStatus
  toDate: string
}

const PAGE_SIZE = 12
const VALID_STATUSES = new Set<KeycardStatus>(['active', 'revoked'])

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getPage(value: string | string[] | undefined) {
  const page = Number.parseInt(getSingleParam(value), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toStartOfDayIso(value: string) {
  return `${value}T00:00:00.000Z`
}

function toExclusiveEndOfDayIso(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

function buildKeycardsQueryString(filters: KeycardsFilters, page: number) {
  const params = new URLSearchParams()

  if (filters.query) {
    params.set('query', filters.query)
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status)
  }

  if (filters.fromDate) {
    params.set('from', filters.fromDate)
  }

  if (filters.toDate) {
    params.set('to', filters.toDate)
  }

  if (page > 1) {
    params.set('page', String(page))
  }

  return params.toString()
}

async function getMatchingRoomIds(supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'], query: string) {
  if (!query) {
    return [] as string[]
  }

  const { data, error } = await supabase.from('rooms').select('id').ilike('number', `%${query}%`).limit(30)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((room) => room.id)
}

async function getMatchingBookingIds(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  query: string,
  roomIds: string[]
) {
  if (!query && roomIds.length === 0) {
    return [] as string[]
  }

  let bookingQuery = supabase.from('bookings').select('id').limit(50)

  if (query && roomIds.length > 0) {
    bookingQuery = bookingQuery.or(`guest_name.ilike.%${query}%,room_id.in.(${roomIds.join(',')})`)
  } else if (query) {
    bookingQuery = bookingQuery.ilike('guest_name', `%${query}%`)
  } else if (roomIds.length > 0) {
    bookingQuery = bookingQuery.in('room_id', roomIds)
  }

  const { data, error } = await bookingQuery

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((booking) => booking.id)
}

function applyKeycardFilters(query: any, filters: KeycardsFilters, bookingIds: string[], roomIds: string[]) {
  let nextQuery = query

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('issued_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('issued_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.status !== 'all') {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  if (filters.query) {
    const escapedQuery = filters.query.replace(/[,%()]/g, ' ').trim()
    const orParts = [
      `card_uid.ilike.%${escapedQuery}%`,
      `issued_to.ilike.%${escapedQuery}%`,
      `issued_by.ilike.%${escapedQuery}%`,
      `status.ilike.%${escapedQuery}%`,
      `scope.ilike.%${escapedQuery}%`
    ]

    if (bookingIds.length > 0) {
      orParts.push(`booking_id.in.(${bookingIds.join(',')})`)
    }

    if (roomIds.length > 0) {
      orParts.push(`room_id.in.(${roomIds.join(',')})`)
    }

    nextQuery = nextQuery.or(orParts.join(','))
  }

  return nextQuery
}

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
  const status: 'all' | KeycardStatus = VALID_STATUSES.has(statusParam as KeycardStatus) ? (statusParam as KeycardStatus) : 'all'

  const filters: KeycardsFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    status,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingRoomIds(supabase, filters.query)
  const bookingIds = await getMatchingBookingIds(supabase, filters.query, roomIds)
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