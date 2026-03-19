import { redirect } from 'next/navigation'

import { AdminPaymentsClient } from '@/app/(admin)/admin/payments/admin-payments-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type PayMethod = Database['public']['Enums']['pay_method']

type PaymentWithBooking = PaymentRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'room_id' | 'status' | 'total_ghs' | 'paid_ghs' | 'balance_ghs'> | null
}

type ServiceChargeWithBooking = ServiceChargeRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'status'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | null
      })
    | null
}

type PaymentsSearchParams = {
  from?: string | string[]
  method?: string | string[]
  ppage?: string | string[]
  query?: string | string[]
  spage?: string | string[]
  to?: string | string[]
}

type PaymentsFilters = {
  fromDate: string
  method: 'all' | PayMethod
  query: string
  toDate: string
}

const PAGE_SIZE = 12
const VALID_METHODS = new Set<PayMethod>(['cash', 'momo', 'bank_transfer', 'cheque'])

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

function buildPaymentsQueryString(filters: PaymentsFilters, paymentsPage: number, servicePage: number) {
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

function applyPaymentFilters(query: any, filters: PaymentsFilters, bookingIds: string[]) {
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
    const escapedQuery = filters.query.replace(/[,%()]/g, ' ').trim()
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

function applyPendingChargeFilters(query: any, filters: PaymentsFilters, bookingIds: string[]) {
  let nextQuery = query.eq('resolved', true).eq('payment_confirmed', false)

  if (filters.fromDate) {
    nextQuery = nextQuery.gte('resolved_at', toStartOfDayIso(filters.fromDate))
  }

  if (filters.toDate) {
    nextQuery = nextQuery.lt('resolved_at', toExclusiveEndOfDayIso(filters.toDate))
  }

  if (filters.query) {
    const escapedQuery = filters.query.replace(/[,%()]/g, ' ').trim()
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

export default async function AdminPaymentsPage({ searchParams }: { searchParams?: PaymentsSearchParams }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const query = getSingleParam(searchParams?.query).trim()
  const methodParam = getSingleParam(searchParams?.method)
  const fromDate = getSingleParam(searchParams?.from)
  const toDate = getSingleParam(searchParams?.to)
  const requestedPaymentsPage = getPage(searchParams?.ppage)
  const requestedServicePage = getPage(searchParams?.spage)
  const method: 'all' | PayMethod = VALID_METHODS.has(methodParam as PayMethod) ? (methodParam as PayMethod) : 'all'

  const filters: PaymentsFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    method,
    query,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingRoomIds(supabase, filters.query)
  const bookingIds = await getMatchingBookingIds(supabase, filters.query, roomIds)

  const paymentsRangeFrom = (requestedPaymentsPage - 1) * PAGE_SIZE
  const paymentsRangeTo = paymentsRangeFrom + PAGE_SIZE - 1
  const serviceRangeFrom = (requestedServicePage - 1) * PAGE_SIZE
  const serviceRangeTo = serviceRangeFrom + PAGE_SIZE - 1

  let paymentsQuery = supabase
    .from('payments')
    .select('*, bookings(id, guest_name, room_id, status, total_ghs, paid_ghs, balance_ghs)', { count: 'exact' })
    .order('paid_at', { ascending: false })
    .range(paymentsRangeFrom, paymentsRangeTo)

  paymentsQuery = applyPaymentFilters(paymentsQuery, filters, bookingIds)

  let pendingServiceQuery = supabase
    .from('service_charges')
    .select('*, bookings(id, guest_name, status, rooms(number, type))', { count: 'exact' })
    .eq('resolved', true)
    .eq('payment_confirmed', false)
    .order('resolved_at', { ascending: false })
    .range(serviceRangeFrom, serviceRangeTo)

  pendingServiceQuery = applyPendingChargeFilters(pendingServiceQuery, filters, bookingIds)

  const [roomsResponse, bookingsResponse, paymentsResponse, pendingServiceResponse, paymentsSummaryResponse] = await Promise.all([
    supabase.from('rooms').select('*').order('number'),
    supabase.from('bookings').select('*').order('check_in', { ascending: false }),
    paymentsQuery,
    pendingServiceQuery,
    applyPaymentFilters(
      supabase.from('payments').select('amount_ghs, method, paid_at').order('paid_at', { ascending: false }),
      filters,
      bookingIds
    )
  ])

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message)
  }

  if (bookingsResponse.error) {
    throw new Error(bookingsResponse.error.message)
  }

  if (paymentsResponse.error) {
    throw new Error(paymentsResponse.error.message)
  }

  if (pendingServiceResponse.error) {
    throw new Error(pendingServiceResponse.error.message)
  }

  if (paymentsSummaryResponse.error) {
    throw new Error(paymentsSummaryResponse.error.message)
  }

  const totalPaymentCount = paymentsResponse.count ?? 0
  const totalPaymentPages = Math.max(1, Math.ceil(totalPaymentCount / PAGE_SIZE))
  const safePaymentsPage = Math.min(requestedPaymentsPage, totalPaymentPages)
  const totalServiceCount = pendingServiceResponse.count ?? 0
  const totalServicePages = Math.max(1, Math.ceil(totalServiceCount / PAGE_SIZE))
  const safeServicePage = Math.min(requestedServicePage, totalServicePages)

  if (safePaymentsPage !== requestedPaymentsPage || safeServicePage !== requestedServicePage) {
    const queryString = buildPaymentsQueryString(filters, safePaymentsPage, safeServicePage)
    redirect(queryString ? `/admin/payments?${queryString}` : '/admin/payments')
  }

  const rooms = (roomsResponse.data ?? []) as RoomRow[]
  const bookings = (bookingsResponse.data ?? []) as BookingRow[]
  const payments = (paymentsResponse.data ?? []) as PaymentWithBooking[]
  const serviceCharges = (pendingServiceResponse.data ?? []) as ServiceChargeWithBooking[]
  const filteredPaymentRows = (paymentsSummaryResponse.data ?? []) as Array<Pick<PaymentRow, 'amount_ghs' | 'method' | 'paid_at'>>
  const today = new Date().toISOString().split('T')[0]

  const summary = {
    awaitingReceipt: totalServiceCount,
    openBalances: bookings.filter((booking) => (booking.balance_ghs ?? 0) > 0).length,
    outstandingBalance: bookings.reduce((sum, booking) => sum + (booking.balance_ghs ?? 0), 0),
    todayCollected: filteredPaymentRows.reduce((sum, payment) => {
      const paidDate = payment.paid_at?.split('T')[0]
      return paidDate === today ? sum + payment.amount_ghs : sum
    }, 0),
    totalCollected: filteredPaymentRows.reduce((sum, payment) => sum + payment.amount_ghs, 0)
  }

  const breakdown = (['cash', 'momo', 'bank_transfer', 'cheque'] as const).map((payMethod) => ({
    method: payMethod,
    total: filteredPaymentRows.filter((payment) => payment.method === payMethod).reduce((sum, payment) => sum + payment.amount_ghs, 0)
  }))

  return (
    <AdminPaymentsClient
      bookings={bookings}
      breakdown={breakdown}
      currentPaymentsPage={safePaymentsPage}
      currentServicePage={safeServicePage}
      filters={filters}
      payments={payments}
      rooms={rooms}
      serviceCharges={serviceCharges}
      summary={summary}
      totalPaymentCount={totalPaymentCount}
      totalPaymentPages={totalPaymentPages}
      totalServiceCount={totalServiceCount}
      totalServicePages={totalServicePages}
    />
  )
}
