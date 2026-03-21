import { redirect } from 'next/navigation'

import { AdminPaymentsClient } from '@/app/(admin)/admin/payments/admin-payments-client'
import {
  applyPaymentFilters,
  applyPendingChargeFilters,
  buildPaymentsQueryString,
  getMatchingPaymentBookingIds,
  getMatchingPaymentRoomIds,
  parsePaymentMethod,
  type PayMethod,
  type PaymentsFilters
} from '@/lib/admin-history/payments'
import { getPage, getSingleParam, isDateInput } from '@/lib/admin-history/shared'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']

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

const PAGE_SIZE = 12

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
  const method: 'all' | PayMethod = parsePaymentMethod(methodParam)

  const filters: PaymentsFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    method,
    query,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingPaymentRoomIds(supabase, filters.query)
  const bookingIds = await getMatchingPaymentBookingIds(supabase, filters.query, roomIds)

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
