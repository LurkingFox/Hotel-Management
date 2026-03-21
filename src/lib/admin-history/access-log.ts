import type { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

import { sanitizeSearchTerm, toExclusiveEndOfDayIso, toStartOfDayIso } from '@/lib/admin-history/shared'

type AccessResult = Database['public']['Enums']['access_result']
type AccessLogFilters = {
  fromDate: string
  query: string
  result: 'all' | AccessResult
  toDate: string
}

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

const VALID_RESULTS = new Set<AccessResult>(['granted', 'denied', 'expired'])

export type { AccessLogFilters, AccessResult }

export function parseAccessResult(value: string): 'all' | AccessResult {
  return VALID_RESULTS.has(value as AccessResult) ? (value as AccessResult) : 'all'
}

export function buildAccessLogQueryString(filters: AccessLogFilters, page: number) {
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

export async function getMatchingAccessRoomIds(supabase: SupabaseClient, query: string) {
  if (!query) {
    return [] as string[]
  }

  const { data, error } = await supabase.from('rooms').select('id').ilike('number', `%${query}%`).limit(20)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((room) => room.id)
}

export function applyAccessFilters(query: any, filters: AccessLogFilters, roomIds: string[], includeResultFilter: boolean) {
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
    const escapedQuery = sanitizeSearchTerm(filters.query)
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