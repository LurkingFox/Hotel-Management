import type { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

import { sanitizeSearchTerm, toExclusiveEndOfDayIso, toStartOfDayIso } from '@/lib/admin-history/shared'

type PayMethod = Database['public']['Enums']['pay_method']
type PaymentsFilters = {
  fromDate: string
  method: 'all' | PayMethod
  query: string
  toDate: string
}

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

const VALID_METHODS = new Set<PayMethod>(['cash', 'momo', 'bank_transfer', 'cheque'])

export type { PayMethod, PaymentsFilters }

export function parsePaymentMethod(value: string): 'all' | PayMethod {
  return VALID_METHODS.has(value as PayMethod) ? (value as PayMethod) : 'all'
}

export function buildPaymentsQueryString(filters: PaymentsFilters, paymentsPage: number, servicePage: number) {
  const params = new URLSearchParams()

  if (filters.query) {
    params.set('query', filters.query)
  }

  if (filters.method !== 'all') {
    params.set('method', filters.method)
  }

  if (filters.fromDate) {
    params.set('from', filters.fromDate)
  }

  if (filters.toDate) {
    params.set('to', filters.toDate)
  }

  if (paymentsPage > 1) {
    params.set('ppage', String(paymentsPage))
  }

  if (servicePage > 1) {
    params.set('spage', String(servicePage))
  }

  return params.toString()
}

export async function getMatchingPaymentRoomIds(supabase: SupabaseClient, query: string) {
  if (!query) {
    return [] as string[]
  }

  const { data, error } = await supabase.from('rooms').select('id').ilike('number', `%${query}%`).limit(20)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((room) => room.id)
}

export async function getMatchingPaymentBookingIds(supabase: SupabaseClient, query: string, roomIds: string[]) {
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

export function applyPaymentFilters(query: any, filters: PaymentsFilters, bookingIds: string[]) {
  let nextQuery = query

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('paid_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('paid_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.method !== 'all') {
    nextQuery = nextQuery.eq('method', filters.method)
  }

  if (filters.query) {
    const escapedQuery = sanitizeSearchTerm(filters.query)
    const orParts = [
      `reference.ilike.%${escapedQuery}%`,
      `received_by.ilike.%${escapedQuery}%`,
      `method.ilike.%${escapedQuery}%`
    ]

    if (bookingIds.length > 0) {
      orParts.push(`booking_id.in.(${bookingIds.join(',')})`)
    }

    nextQuery = nextQuery.or(orParts.join(','))
  }

  return nextQuery
}

export function applyPendingChargeFilters(query: any, filters: PaymentsFilters, bookingIds: string[]) {
  let nextQuery = query.eq('resolved', true).eq('payment_confirmed', false)

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('resolved_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('resolved_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.query) {
    const escapedQuery = sanitizeSearchTerm(filters.query)
    const orParts = [
      `type.ilike.%${escapedQuery}%`,
      `description.ilike.%${escapedQuery}%`,
      `requested_by.ilike.%${escapedQuery}%`,
      `resolved_by.ilike.%${escapedQuery}%`
    ]

    if (bookingIds.length > 0) {
      orParts.push(`booking_id.in.(${bookingIds.join(',')})`)
    }

    nextQuery = nextQuery.or(orParts.join(','))
  }

  return nextQuery
}