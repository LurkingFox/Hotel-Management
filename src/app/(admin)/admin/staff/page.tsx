import { redirect } from 'next/navigation'

import { AdminStaffClient } from '@/app/(admin)/admin/staff/admin-staff-client'
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
type ShiftHistoryFilters = {
  fromDate: string
  query: string
  status: 'all' | 'closed' | 'open'
  toDate: string
}

const PAGE_SIZE = 8
const VALID_SHIFT_STATUS = new Set(['all', 'open', 'closed'])

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

function buildShiftHistoryQueryString(filters: ShiftHistoryFilters, page: number) {
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

async function getMatchingStaffIds(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  query: string
) {
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

function applyShiftHistoryFilters(query: any, filters: ShiftHistoryFilters, staffIds: string[]) {
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

export default async function AdminStaffPage({ searchParams }: { searchParams?: StaffHistorySearchParams }) {
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

  const query = getSingleParam(searchParams?.shiftQuery).trim()
  const fromDate = getSingleParam(searchParams?.shiftFrom)
  const toDate = getSingleParam(searchParams?.shiftTo)
  const requestedPage = getPage(searchParams?.shiftPage)
  const statusParam = getSingleParam(searchParams?.shiftStatus)
  const status: 'all' | 'closed' | 'open' = VALID_SHIFT_STATUS.has(statusParam) ? (statusParam as 'all' | 'closed' | 'open') : 'all'

  const historyFilters: ShiftHistoryFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    status,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const staffIds = await getMatchingStaffIds(supabase, historyFilters.query)
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
