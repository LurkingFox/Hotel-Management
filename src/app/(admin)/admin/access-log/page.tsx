import { redirect } from 'next/navigation'

import { AdminAccessLogClient } from '@/app/(admin)/admin/access-log/admin-access-log-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type AccessLogRow = Database['public']['Tables']['access_log']['Row']
type AccessResult = Database['public']['Enums']['access_result']

type AccessLogWithRoom = AccessLogRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'status' | 'type'> | null
}

type AccessLogSearchParams = {
  from?: string | string[]
  page?: string | string[]
  query?: string | string[]
  result?: string | string[]
  to?: string | string[]
}

type QueryFilters = {
  fromDate: string
  query: string
  result: 'all' | AccessResult
  toDate: string
}

const PAGE_SIZE = 12
const VALID_RESULTS = new Set<AccessResult>(['granted', 'denied', 'expired'])

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

function buildAccessLogQueryString(filters: QueryFilters, page: number) {
  const params = new URLSearchParams()

  if (filters.query) {
    params.set('query', filters.query)
  }

  if (filters.result !== 'all') {
    params.set('result', filters.result)
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

  const { data, error } = await supabase.from('rooms').select('id').ilike('number', `%${query}%`).limit(20)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((room) => room.id)
}

function applyAccessFilters(query: any, filters: QueryFilters, roomIds: string[], includeResultFilter: boolean) {
  let nextQuery = query

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('accessed_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('accessed_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (includeResultFilter && filters.result !== 'all') {
    nextQuery = nextQuery.eq('result', filters.result)
  }

  if (filters.query) {
    const escapedQuery = filters.query.replace(/[,%()]/g, ' ').trim()
    const orParts = [
      `card_uid.ilike.%${escapedQuery}%`,
      `guest_name.ilike.%${escapedQuery}%`,
      `issued_by.ilike.%${escapedQuery}%`,
      `note.ilike.%${escapedQuery}%`,
      `result.ilike.%${escapedQuery}%`
    ]

    if (roomIds.length > 0) {
      orParts.push(`room_id.in.(${roomIds.join(',')})`)
    }

    nextQuery = nextQuery.or(orParts.join(','))
  }

  return nextQuery
}

export default async function AdminAccessLogPage({ searchParams }: { searchParams?: AccessLogSearchParams }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const query = getSingleParam(searchParams?.query).trim()
  const fromDate = getSingleParam(searchParams?.from)
  const toDate = getSingleParam(searchParams?.to)
  const resultParam = getSingleParam(searchParams?.result)
  const page = getPage(searchParams?.page)
  const resultFilter: 'all' | AccessResult = VALID_RESULTS.has(resultParam as AccessResult) ? (resultParam as AccessResult) : 'all'

  const filters: QueryFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    result: resultFilter,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingRoomIds(supabase, filters.query)
  const rangeFrom = (page - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  let eventsQuery = supabase
    .from('access_log')
    .select('*, rooms(id, number, status, type)', { count: 'exact' })
    .order('accessed_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  eventsQuery = applyAccessFilters(eventsQuery, filters, roomIds, true)

  let deniedQuery = supabase
    .from('access_log')
    .select('*, rooms(id, number, status, type)')
    .eq('result', 'denied')
    .order('accessed_at', { ascending: false })
    .limit(5)

  deniedQuery = applyAccessFilters(deniedQuery, { ...filters, result: 'all' }, roomIds, false)

  const [eventsResponse, deniedResponse, grantedSummary, deniedSummary, expiredSummary] = await Promise.all([
    eventsQuery,
    deniedQuery,
    applyAccessFilters(supabase.from('access_log').select('id', { count: 'exact', head: true }).eq('result', 'granted'), { ...filters, result: 'all' }, roomIds, false),
    applyAccessFilters(supabase.from('access_log').select('id', { count: 'exact', head: true }).eq('result', 'denied'), { ...filters, result: 'all' }, roomIds, false),
    applyAccessFilters(supabase.from('access_log').select('id', { count: 'exact', head: true }).eq('result', 'expired'), { ...filters, result: 'all' }, roomIds, false)
  ])

  if (eventsResponse.error) {
    throw new Error(eventsResponse.error.message)
  }

  if (deniedResponse.error) {
    throw new Error(deniedResponse.error.message)
  }

  if (grantedSummary.error) {
    throw new Error(grantedSummary.error.message)
  }

  if (deniedSummary.error) {
    throw new Error(deniedSummary.error.message)
  }

  if (expiredSummary.error) {
    throw new Error(expiredSummary.error.message)
  }

  const totalCount = eventsResponse.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  if (page !== safePage) {
    const queryString = buildAccessLogQueryString(filters, safePage)
    redirect(queryString ? `/admin/access-log?${queryString}` : '/admin/access-log')
  }

  const events = (eventsResponse.data ?? []) as AccessLogWithRoom[]

  return (
    <AdminAccessLogClient
      currentPage={safePage}
      events={events}
      filters={filters}
      latestDenied={(deniedResponse.data ?? []) as AccessLogWithRoom[]}
      summary={{
        denied: deniedSummary.count ?? 0,
        expired: expiredSummary.count ?? 0,
        granted: grantedSummary.count ?? 0,
        roomsOnPage: new Set(events.map((event) => event.room_id).filter(Boolean)).size
      }}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}
