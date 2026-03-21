import { NextResponse } from 'next/server'

import { applyAccessFilters, getMatchingAccessRoomIds, parseAccessResult, type AccessResult } from '@/lib/admin-history/access-log'
import {
  applyKeycardFilters,
  getMatchingKeycardBookingIds,
  getMatchingKeycardRoomIds,
  parseKeycardStatus,
  type KeycardsFilters
} from '@/lib/admin-history/keycards'
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
type KeycardRow = Database['public']['Tables']['keycards']['Row']

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

type KeycardWithRelations = KeycardRow & {
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
            .select('id, accessed_at, result, card_uid, guest_name, issued_by, note, room_id, rooms(id, number, status, type)')
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
          event.card_uid,
          event.guest_name,
          event.issued_by,
          event.note,
          event.room_id
        ])

        return csvResponse(
          buildExportFilename('access-log'),
          ['Event ID', 'Accessed At', 'Result', 'Room Number', 'Room Type', 'Room Status', 'Card UID', 'Guest Name', 'Issued By', 'Note', 'Room ID'],
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

      case 'keycards': {
        const query = getSingleParam(searchParams.getAll('query')).trim()
        const status = parseKeycardStatus(getSingleParam(searchParams.getAll('status')))
        const fromDate = getSingleParam(searchParams.getAll('from'))
        const toDate = getSingleParam(searchParams.getAll('to'))
        const filters: KeycardsFilters = {
          fromDate: isDateInput(fromDate) ? fromDate : '',
          query,
          status,
          toDate: isDateInput(toDate) ? toDate : ''
        }
        const roomIds = await getMatchingKeycardRoomIds(supabase, filters.query)
        const bookingIds = await getMatchingKeycardBookingIds(supabase, filters.query, roomIds)
        const response = await applyKeycardFilters(
          supabase
            .from('keycards')
            .select('id, card_uid, issued_at, issued_by, issued_to, valid_from, valid_until, status, scope, access_count, booking_id, room_id, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status)')
            .order('issued_at', { ascending: false }),
          filters,
          bookingIds,
          roomIds
        )

        if (response.error) {
          throw new Error(response.error.message)
        }

        const rows = ((response.data ?? []) as KeycardWithRelations[]).map((keycard) => [
          keycard.id,
          keycard.card_uid,
          formatTimestampForExport(keycard.issued_at),
          keycard.issued_by,
          keycard.issued_to,
          keycard.scope,
          keycard.status,
          keycard.access_count,
          formatDateForExport(keycard.valid_from),
          formatDateForExport(keycard.valid_until),
          keycard.room_id,
          keycard.rooms?.number,
          keycard.rooms?.type,
          keycard.rooms?.status,
          keycard.booking_id,
          keycard.bookings?.guest_name,
          keycard.bookings?.status,
          formatDateForExport(keycard.bookings?.check_in ?? null),
          formatDateForExport(keycard.bookings?.check_out_expected ?? null)
        ])

        return csvResponse(
          buildExportFilename('keycard-registry'),
          ['Keycard ID', 'Card UID', 'Issued At', 'Issued By', 'Issued To', 'Scope', 'Status', 'Access Count', 'Valid From', 'Valid Until', 'Room ID', 'Room Number', 'Room Type', 'Room Status', 'Booking ID', 'Guest Name', 'Booking Status', 'Check In', 'Check Out Expected'],
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