import { redirect } from 'next/navigation'

import { AdminStaffClient } from '@/app/(admin)/admin/staff/admin-staff-client'
import { applyShiftHistoryFilters, buildShiftHistoryQueryString, getMatchingShiftStaffIds, parseShiftStatus, type ShiftHistoryFilters } from '@/lib/admin-history/staff'
import { getPage, getSingleParam, isDateInput } from '@/lib/admin-history/shared'
import type { StaffRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']
type StaffRecord = StaffRow & {
  active?: boolean | null
  auth_user_id?: string | null
}
type StaffAccount = {
  id: string
  email: string | null
  created_at: string | null
  staff_id: string | null
  role: StaffRole | null
  name: string | null
  active?: boolean
}
type ShiftHistoryRow = ShiftRow & {
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | null
}
type StaffHistorySearchParams = {
  shiftFrom?: string | string[]
  shiftPage?: string | string[]
  shiftQuery?: string | string[]
  shiftStatus?: string | string[]
  shiftTo?: string | string[]
}

type AdminStaffPageProps = {
  searchParams?: StaffHistorySearchParams | Promise<StaffHistorySearchParams>
}

const PAGE_SIZE = 8

export default async function AdminStaffPage({ searchParams }: AdminStaffPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { supabase, user, session } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const canManageAdminAccounts = user.email === 'manager@universityhotel.com'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let staffAccounts: StaffAccount[] = []

  if (session?.access_token && supabaseUrl && anonKey) {
    const response = await fetch(`${supabaseUrl}/functions/v1/manage_staff_auth`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'x-staff-auth-token': session.access_token
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string }
      throw new Error(payload.error ?? 'Could not load staff login accounts.')
    }

    staffAccounts = (await response.json()) as StaffAccount[]
  }

  const query = getSingleParam(resolvedSearchParams?.shiftQuery).trim()
  const fromDate = getSingleParam(resolvedSearchParams?.shiftFrom)
  const toDate = getSingleParam(resolvedSearchParams?.shiftTo)
  const requestedPage = getPage(resolvedSearchParams?.shiftPage)
  const statusParam = getSingleParam(resolvedSearchParams?.shiftStatus)
  const status: 'all' | 'closed' | 'open' = parseShiftStatus(statusParam)

  const historyFilters: ShiftHistoryFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    status,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const staffIds = await getMatchingShiftStaffIds(supabase, historyFilters.query)
  const rangeFrom = (requestedPage - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  let historyQuery = supabase
    .from('shifts')
    .select('*, staff(id, name, role)', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  historyQuery = applyShiftHistoryFilters(historyQuery, historyFilters, staffIds)

  const [staffResponse, latestShiftsResponse, historyResponse, openShiftCountResponse] = await Promise.all([
    supabase.from('staff').select('*').order('active', { ascending: false }).order('name'),
    supabase.from('shifts').select('*').order('started_at', { ascending: false }).limit(120),
    historyQuery,
    supabase.from('shifts').select('id', { count: 'exact', head: true }).is('ended_at', null)
  ])

  if (staffResponse.error) {
    throw new Error(staffResponse.error.message)
  }

  if (latestShiftsResponse.error) {
    throw new Error(latestShiftsResponse.error.message)
  }

  if (historyResponse.error) {
    throw new Error(historyResponse.error.message)
  }

  if (openShiftCountResponse.error) {
    throw new Error(openShiftCountResponse.error.message)
  }

  const totalShiftCount = historyResponse.count ?? 0
  const totalShiftPages = Math.max(1, Math.ceil(totalShiftCount / PAGE_SIZE))
  const safeShiftPage = Math.min(requestedPage, totalShiftPages)

  if (safeShiftPage !== requestedPage) {
    const queryString = buildShiftHistoryQueryString(historyFilters, safeShiftPage)
    redirect(queryString ? `/admin/staff?${queryString}` : '/admin/staff')
  }

  return (
    <AdminStaffClient
      canManageAdminAccounts={canManageAdminAccounts}
      currentAuthUserId={user.id}
      historyFilters={historyFilters}
      historyShifts={(historyResponse.data ?? []) as ShiftHistoryRow[]}
      latestShifts={(latestShiftsResponse.data ?? []) as ShiftRow[]}
      openShiftCount={openShiftCountResponse.count ?? 0}
      currentShiftPage={safeShiftPage}
      staff={(staffResponse.data ?? []) as StaffRecord[]}
      staffAccounts={staffAccounts}
      totalShiftCount={totalShiftCount}
      totalShiftPages={totalShiftPages}
    />
  )
}
