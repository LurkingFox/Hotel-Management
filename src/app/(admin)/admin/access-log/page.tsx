import { redirect } from 'next/navigation'

import { AdminAccessLogClient } from '@/app/(admin)/admin/access-log/admin-access-log-client'
import { applyAccessFilters, buildAccessLogQueryString, getMatchingAccessRoomIds, parseAccessResult, type AccessLogFilters, type AccessResult } from '@/lib/admin-history/access-log'
import { getPage, getSingleParam, isDateInput } from '@/lib/admin-history/shared'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type AccessLogRow = Database['public']['Tables']['access_log']['Row']

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

const PAGE_SIZE = 12

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
  const resultFilter: 'all' | AccessResult = parseAccessResult(resultParam)

  const filters: AccessLogFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    result: resultFilter,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingAccessRoomIds(supabase, filters.query)
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
