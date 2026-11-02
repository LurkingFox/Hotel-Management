import { NextResponse } from 'next/server'

import { applyAccessFilters, getMatchingAccessRoomIds, parseAccessResult, type AccessResult } from '@/lib/admin-history/access-log'
import {
  applyGuestAccessFilters,
  getMatchingGuestAccessBookingIds,
  getMatchingGuestAccessRoomIds,
  parseGuestAccessStatus,
  type GuestAccessFilters
} from '@/lib/admin-history/guest-access'
import {
  applyPaymentFilters,
  applyPendingChargeFilters,
  getMatchingPaymentBookingIds,
  getMatchingPaymentRoomIds,
  parsePaymentMethod,
  type PayMethod,
  type PaymentsFilters
} from '@/lib/admin-history/payments'
import { applyShiftHistoryFilters, getMatchingShiftStaffIds, parseShiftStatus, type ShiftHistoryFilters } from '@/lib/admin-history/staff'
import {
  buildCsvString,
  buildExportFilename,
  formatDateForExport,
  formatTimestampForExport,
  getSingleParam,
  isDateInput
} from '@/lib/admin-history/shared'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type AccessLogRow = Database['public']['Tables']['access_log']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']
type StaffRow = Database['public']['Tables']['staff']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']

type AccessLogWithRoom = AccessLogRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'status' | 'type'> | null
}

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

type ShiftHistoryRow = ShiftRow & {
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | null
}

type AccessCredentialWithRelations = AccessCredentialRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

function csvResponse(filename: string, headers: string[], rows: Array<Array<boolean | number | string | null | undefined>>) {
  return new NextResponse(`\uFEFF${buildCsvString(headers, rows)}`, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

export async function GET(request: Request) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const view = getSingleParam(searchParams.getAll('view'))

  try {
    switch (view) {
      case 'access-log': {
        const query = getSingleParam(searchParams.getAll('query')).trim()
        const fromDate = getSingleParam(searchParams.getAll('from'))
        const toDate = getSingleParam(searchParams.getAll('to'))
        const result = parseAccessResult(getSingleParam(searchParams.getAll('result')))
        const filters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          query,
          result,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const roomIds = await getMatchingAccessRoomIds(supabase, filters.query)
        const response = await applyAccessFilters(
          supabase
            .from('access_log')
            .select('id, accessed_at, result, credential_identifier, guest_name, issued_by, note, room_id, rooms(id, number, status, type)')
            .order('accessed_at', { ascending: false }),
          filters,
          roomIds,
          true
        )

        if (response.error) {
          throw new Error(response.error.message)
        }

        const rows = ((response.data ?? []) as AccessLogWithRoom[]).map((event) => [
          event.id,
          formatTimestampForExport(event.accessed_at),
          event.result,
          event.rooms?.number ?? '',
          event.rooms?.type ?? '',
          event.rooms?.status ?? '',
          event.credential_identifier,
          event.guest_name,
          event.issued_by,
          event.note,
          event.room_id
        ])

        return csvResponse(
          buildExportFilename('access-log'),
          ['Event ID', 'Accessed At', 'Result', 'Room Number', 'Room Type', 'Room Status', 'Credential Identifier', 'Guest Name', 'Issued By', 'Note', 'Room ID'],
          rows
        )
      }

      case 'payments': {
        const query = getSingleParam(searchParams.getAll('query')).trim()
        const method: 'all' | PayMethod = parsePaymentMethod(getSingleParam(searchParams.getAll('method')))
        const fromDate = getSingleParam(searchParams.getAll('from'))
        const toDate = getSingleParam(searchParams.getAll('to'))
        const filters: PaymentsFilters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          method,
          query,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const roomIds = await getMatchingPaymentRoomIds(supabase, filters.query)
        const bookingIds = await getMatchingPaymentBookingIds(supabase, filters.query, roomIds)
        const [roomsResponse, paymentsResponse] = await Promise.all([
          supabase.from('rooms').select('id, number'),
          applyPaymentFilters(
            supabase
              .from('payments')
              .select('id, paid_at, amount_ghs, method, reference, received_by, booking_id, bookings(id, guest_name, room_id, status, total_ghs, paid_ghs, balance_ghs)')
              .order('paid_at', { ascending: false }),
            filters,
            bookingIds
          )
        ])

        if (roomsResponse.error) {
          throw new Error(roomsResponse.error.message)
        }

        if (paymentsResponse.error) {
          throw new Error(paymentsResponse.error.message)
        }

        const roomMap = new Map((roomsResponse.data ?? []).map((room) => [room.id, room.number]))
        const rows = ((paymentsResponse.data ?? []) as PaymentWithBooking[]).map((payment) => [
          payment.id,
          formatTimestampForExport(payment.paid_at),
          payment.amount_ghs,
          payment.method,
          payment.reference,
          payment.received_by,
          payment.booking_id,
          payment.bookings?.guest_name,
          payment.bookings?.room_id ? roomMap.get(payment.bookings.room_id) ?? '' : '',
          payment.bookings?.status,
          payment.bookings?.total_ghs,
          payment.bookings?.paid_ghs,
          payment.bookings?.balance_ghs
        ])

        return csvResponse(
          buildExportFilename('payments-ledger'),
          ['Payment ID', 'Paid At', 'Amount GHS', 'Method', 'Reference', 'Received By', 'Booking ID', 'Guest Name', 'Room Number', 'Booking Status', 'Booking Total GHS', 'Booking Paid GHS', 'Booking Balance GHS'],
          rows
        )
      }

      case 'payment-receipts': {
        const query = getSingleParam(searchParams.getAll('query')).trim()
        const method: 'all' | PayMethod = parsePaymentMethod(getSingleParam(searchParams.getAll('method')))
        const fromDate = getSingleParam(searchParams.getAll('from'))
        const toDate = getSingleParam(searchParams.getAll('to'))
        const filters: PaymentsFilters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          method,
          query,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const roomIds = await getMatchingPaymentRoomIds(supabase, filters.query)
        const bookingIds = await getMatchingPaymentBookingIds(supabase, filters.query, roomIds)
        const response = await applyPendingChargeFilters(
          supabase
            .from('service_charges')
            .select('id, type, amount_ghs, description, requested_by, resolved_by, resolved_at, booking_id, payment_confirmed, bookings(id, guest_name, status, rooms(number, type))')
            .order('resolved_at', { ascending: false }),
          filters,
          bookingIds
        )

        if (response.error) {
          throw new Error(response.error.message)
        }

        const rows = ((response.data ?? []) as ServiceChargeWithBooking[]).map((charge) => [
          charge.id,
          charge.type,
          charge.amount_ghs,
          charge.description,
          charge.requested_by,
          charge.resolved_by,
          formatTimestampForExport(charge.resolved_at),
          charge.payment_confirmed,
          charge.booking_id,
          charge.bookings?.guest_name,
          charge.bookings?.status,
          charge.bookings?.rooms?.number,
          charge.bookings?.rooms?.type
        ])

        return csvResponse(
          buildExportFilename('service-receipt-review'),
          ['Charge ID', 'Type', 'Amount GHS', 'Description', 'Requested By', 'Resolved By', 'Resolved At', 'Payment Confirmed', 'Booking ID', 'Guest Name', 'Booking Status', 'Room Number', 'Room Type'],
          rows
        )
      }

      case 'staff': {
        const query = getSingleParam(searchParams.getAll('shiftQuery')).trim()
        const status = parseShiftStatus(getSingleParam(searchParams.getAll('shiftStatus')))
        const fromDate = getSingleParam(searchParams.getAll('shiftFrom'))
        const toDate = getSingleParam(searchParams.getAll('shiftTo'))
        const filters: ShiftHistoryFilters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          query,
          status,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const staffIds = await getMatchingShiftStaffIds(supabase, filters.query)
        const response = await applyShiftHistoryFilters(
          supabase.from('shifts').select('id, started_at, ended_at, staff_id, staff(id, name, role)').order('started_at', { ascending: false }),
          filters,
          staffIds
        )

        if (response.error) {
          throw new Error(response.error.message)
        }

        const rows = ((response.data ?? []) as ShiftHistoryRow[]).map((shift) => [
          shift.id,
          shift.staff_id,
          shift.staff?.name,
          shift.staff?.role,
          formatTimestampForExport(shift.started_at),
          formatTimestampForExport(shift.ended_at),
          shift.ended_at ? 'closed' : 'open'
        ])

        return csvResponse(
          buildExportFilename('staff-shift-history'),
          ['Shift ID', 'Staff ID', 'Staff Name', 'Role', 'Started At', 'Ended At', 'Shift Status'],
          rows
        )
      }

      case 'guest-access': {
        const query = getSingleParam(searchParams.getAll('query')).trim()
        const status = parseGuestAccessStatus(getSingleParam(searchParams.getAll('status')))
        const fromDate = getSingleParam(searchParams.getAll('from'))
        const toDate = getSingleParam(searchParams.getAll('to'))
        const filters: GuestAccessFilters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          query,
          status,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const roomIds = await getMatchingGuestAccessRoomIds(supabase, filters.query)
        const bookingIds = await getMatchingGuestAccessBookingIds(supabase, filters.query, roomIds)
        const response = await applyGuestAccessFilters(
          supabase
            .from('booking_access_credentials')
            .select('id, credential_code, created_at, issued_by, issued_to, valid_from, valid_until, status, provider, provider_reference, provider_device_id, provider_status, note, booking_id, room_id, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status)')
            .order('created_at', { ascending: false }),
          filters,
          bookingIds,
          roomIds
        )

        if (response.error) {
          throw new Error(response.error.message)
        }

        const rows = ((response.data ?? []) as AccessCredentialWithRelations[]).map((credential) => [
          credential.id,
          credential.credential_code ?? credential.note ?? credential.provider_reference,
          formatTimestampForExport(credential.created_at),
          credential.issued_by,
          credential.issued_to,
          credential.provider,
          credential.status,
          credential.provider_status,
          formatDateForExport(credential.valid_from),
          formatDateForExport(credential.valid_until),
          credential.provider_device_id,
          credential.provider_reference,
          credential.room_id,
          credential.rooms?.number,
          credential.rooms?.type,
          credential.rooms?.status,
          credential.booking_id,
          credential.bookings?.guest_name,
          credential.bookings?.status,
          formatDateForExport(credential.bookings?.check_in ?? null),
          formatDateForExport(credential.bookings?.check_out_expected ?? null)
        ])

        return csvResponse(
          buildExportFilename('guest-access-registry'),
          ['Credential ID', 'Credential Label', 'Created At', 'Issued By', 'Issued To', 'Provider', 'Status', 'Provider Status', 'Valid From', 'Valid Until', 'Provider Device ID', 'Provider Reference', 'Room ID', 'Room Number', 'Room Type', 'Room Status', 'Booking ID', 'Guest Name', 'Booking Status', 'Check In', 'Check Out Expected'],
          rows
        )
      }

      default:
        return NextResponse.json({ error: 'Unsupported export view.' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not export history data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}