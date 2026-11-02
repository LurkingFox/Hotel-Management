import type { createServerSupabaseClient } from '@/lib/supabase/server'

import { sanitizeSearchTerm, toExclusiveEndOfDayIso, toStartOfDayIso } from '@/lib/admin-history/shared'

type GuestAccessFilters = {
  fromDate: string
  query: string
  status: 'all' | 'active' | 'revoked'
  toDate: string
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const VALID_STATUSES = new Set(['active', 'revoked'])

export type { GuestAccessFilters }

export function parseGuestAccessStatus(value: string): 'all' | 'active' | 'revoked' {
  return VALID_STATUSES.has(value) ? (value as 'active' | 'revoked') : 'all'
}

export function buildGuestAccessQueryString(filters: GuestAccessFilters, page: number) {
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

export async function getMatchingGuestAccessRoomIds(supabase: SupabaseClient, query: string) {
  if (!query) {
    return [] as string[]
  }

  const { data, error } = await supabase.from('rooms').select('id').ilike('number', `%${query}%`).limit(30)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((room) => room.id)
}

export async function getMatchingGuestAccessBookingIds(supabase: SupabaseClient, query: string, roomIds: string[]) {
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

export function applyGuestAccessFilters(query: any, filters: GuestAccessFilters, bookingIds: string[], roomIds: string[]) {
  let nextQuery = query

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('created_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('created_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.status !== 'all') {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  if (filters.query) {
    const escapedQuery = sanitizeSearchTerm(filters.query)
    const orParts = [
      `credential_code.ilike.%${escapedQuery}%`,
      `issued_to.ilike.%${escapedQuery}%`,
      `issued_by.ilike.%${escapedQuery}%`,
      `note.ilike.%${escapedQuery}%`,
      `provider.ilike.%${escapedQuery}%`,
      `provider_device_id.ilike.%${escapedQuery}%`,
      `provider_reference.ilike.%${escapedQuery}%`,
      `provider_status.ilike.%${escapedQuery}%`,
      `status.ilike.%${escapedQuery}%`,
      `id.ilike.%${escapedQuery}%`
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