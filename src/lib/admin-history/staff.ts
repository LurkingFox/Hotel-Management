import type { createServerSupabaseClient } from '@/lib/supabase/server'

import { toExclusiveEndOfDayIso, toStartOfDayIso } from '@/lib/admin-history/shared'

type ShiftHistoryFilters = {
  fromDate: string
  query: string
  status: 'all' | 'closed' | 'open'
  toDate: string
}

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

const VALID_SHIFT_STATUS = new Set(['all', 'open', 'closed'])

export type { ShiftHistoryFilters }

export function parseShiftStatus(value: string): 'all' | 'closed' | 'open' {
  return VALID_SHIFT_STATUS.has(value) ? (value as 'all' | 'closed' | 'open') : 'all'
}

export function buildShiftHistoryQueryString(filters: ShiftHistoryFilters, page: number) {
  const params = new URLSearchParams()

  if (filters.query) {
    params.set('shiftQuery', filters.query)
  }

  if (filters.status !== 'all') {
    params.set('shiftStatus', filters.status)
  }

  if (filters.fromDate) {
    params.set('shiftFrom', filters.fromDate)
  }

  if (filters.toDate) {
    params.set('shiftTo', filters.toDate)
  }

  if (page > 1) {
    params.set('shiftPage', String(page))
  }

  return params.toString()
}

export async function getMatchingShiftStaffIds(supabase: SupabaseClient, query: string) {
  if (!query) {
    return [] as string[]
  }

  const { data, error } = await supabase
    .from('staff')
    .select('id')
    .or(`name.ilike.%${query}%,role.ilike.%${query}%`)
    .limit(40)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((member) => member.id)
}

export function applyShiftHistoryFilters(query: any, filters: ShiftHistoryFilters, staffIds: string[]) {
  let nextQuery = query

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('started_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('started_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.status === 'open') {
    nextQuery = nextQuery.is('ended_at', null)
  }

  if (filters.status === 'closed') {
    nextQuery = nextQuery.not('ended_at', 'is', null)
  }

  if (filters.query) {
    nextQuery = nextQuery.in('staff_id', staffIds.length > 0 ? staffIds : ['00000000-0000-0000-0000-000000000000'])
  }

  return nextQuery
}