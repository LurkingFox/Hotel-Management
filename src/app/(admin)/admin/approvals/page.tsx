import { redirect } from 'next/navigation'

import { AdminApprovalsClient } from '@/app/(admin)/admin/approvals/admin-approvals-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type SearchParams = Record<string, string | string[] | undefined>
type ApprovalsLane = 'all' | 'extensions' | 'receipts' | 'kyc'
type ApprovalRequesterRoleFilter = 'all' | 'admin' | 'receptionist'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ManagerApprovalRow = Database['public']['Tables']['manager_approvals']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']

type BookingWithRoom = Pick<BookingRow, 'id' | 'guest_name' | 'guest_phone' | 'check_in' | 'check_out_expected' | 'total_ghs' | 'paid_ghs' | 'balance_ghs' | 'status'> & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

type PendingExtensionAudit = Pick<
  ExtensionAuditRow,
  | 'id'
  | 'requested_by'
  | 'requester_role'
  | 'reason'
  | 'previous_check_out_expected'
  | 'new_check_out_expected'
  | 'incremental_amount_ghs'
  | 'payment_recorded_ghs'
  | 'payment_method'
  | 'payment_reference'
  | 'created_at'
  | 'confirmation_status'
> & {
  bookings: BookingWithRoom | Array<BookingWithRoom> | null
}

type PendingApproval = Pick<ManagerApprovalRow, 'id' | 'approval_type' | 'booking_id' | 'detail' | 'metadata' | 'requested_at' | 'requested_by' | 'requested_by_role' | 'status' | 'target_id' | 'target_table' | 'title'> & {
  bookings: Pick<BookingRow, 'id' | 'guest_name'> | Array<Pick<BookingRow, 'id' | 'guest_name'>> | null
}

type ApprovalsFilters = {
  lane: ApprovalsLane
  requesterRole: ApprovalRequesterRoleFilter
}

type AdminApprovalsPageProps = {
  searchParams?: SearchParams | Promise<SearchParams>
}

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeLane(value: string | undefined): ApprovalsLane {
  switch (value) {
    case 'extensions':
    case 'receipts':
    case 'kyc':
      return value
    default:
      return 'all'
  }
}

function normalizeRequesterRole(value: string | undefined): ApprovalRequesterRoleFilter {
  switch (value) {
    case 'admin':
    case 'receptionist':
      return value
    default:
      return 'all'
  }
}

export default async function AdminApprovalsPage({ searchParams }: AdminApprovalsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const filters: ApprovalsFilters = {
    lane: normalizeLane(readValue(resolvedSearchParams?.lane)),
    requesterRole: normalizeRequesterRole(readValue(resolvedSearchParams?.requester))
  }

  const [pendingExtensionsResult, pendingApprovalsResult] = await Promise.all([
    supabase
      .from('booking_extension_audits')
      .select('id, requested_by, requester_role, reason, previous_check_out_expected, new_check_out_expected, incremental_amount_ghs, payment_recorded_ghs, payment_method, payment_reference, created_at, confirmation_status, bookings(id, guest_name, guest_phone, check_in, check_out_expected, total_ghs, paid_ghs, balance_ghs, status, rooms(number, type))')
      .eq('confirmation_status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('manager_approvals')
      .select('id, approval_type, booking_id, detail, metadata, requested_at, requested_by, requested_by_role, status, target_id, target_table, title, bookings(id, guest_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
  ])

  if (pendingExtensionsResult.error) {
    throw new Error(pendingExtensionsResult.error.message)
  }

  if (pendingApprovalsResult.error) {
    throw new Error(pendingApprovalsResult.error.message)
  }

  return (
    <AdminApprovalsClient
      filters={filters}
      pendingApprovals={(pendingApprovalsResult.data ?? []) as PendingApproval[]}
      pendingExtensions={(pendingExtensionsResult.data ?? []) as PendingExtensionAudit[]}
    />
  )
}