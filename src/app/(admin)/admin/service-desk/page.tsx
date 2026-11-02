import { redirect } from 'next/navigation'

import { AdminServiceDeskClient } from '@/app/(admin)/admin/service-desk/admin-service-desk-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type SearchParams = Record<string, string | string[] | undefined>
type ServiceDeskLane = 'all-open' | 'all-statuses' | 'assigned' | 'due-soon' | 'in-progress' | 'overdue' | 'unassigned'
type ServiceDeskPriorityFilter = 'all' | Database['public']['Enums']['service_request_priority']
type ServiceDeskCategoryFilter = 'all' | Database['public']['Enums']['service_request_category']
type ServiceDeskSourceFilter = 'all' | Database['public']['Enums']['service_request_source']

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type StaffRow = Database['public']['Tables']['staff']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ServiceRequestEventRow = Database['public']['Tables']['service_request_events']['Row']

type StaffSummary = Pick<StaffRow, 'id' | 'name' | 'role' | 'active'>
type ServiceRequestEventSummary = Pick<ServiceRequestEventRow, 'id' | 'service_request_id' | 'event_type' | 'message' | 'actor_name' | 'actor_role' | 'created_at'>

type ServiceDeskFilters = {
  assignee: string | 'all'
  category: ServiceDeskCategoryFilter
  lane: ServiceDeskLane
  priority: ServiceDeskPriorityFilter
  source: ServiceDeskSourceFilter
}

type ServiceRequestWithRelations = ServiceRequestRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | Array<Pick<StaffRow, 'id' | 'name' | 'role'>> | null
}

type AdminServiceDeskPageProps = {
  searchParams?: SearchParams | Promise<SearchParams>
}

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeLane(value: string | undefined): ServiceDeskLane {
  switch (value) {
    case 'all-statuses':
    case 'assigned':
    case 'due-soon':
    case 'in-progress':
    case 'overdue':
    case 'unassigned':
      return value
    default:
      return 'all-open'
  }
}

function normalizePriority(value: string | undefined): ServiceDeskPriorityFilter {
  switch (value) {
    case 'low':
    case 'normal':
    case 'high':
    case 'urgent':
      return value
    default:
      return 'all'
  }
}

function normalizeCategory(value: string | undefined): ServiceDeskCategoryFilter {
  switch (value) {
    case 'housekeeping':
    case 'maintenance':
    case 'laundry':
    case 'food':
    case 'minibar':
    case 'billing':
    case 'other':
      return value
    default:
      return 'all'
  }
}

function normalizeSource(value: string | undefined): ServiceDeskSourceFilter {
  switch (value) {
    case 'guest_portal':
    case 'manager':
    case 'reception':
      return value
    default:
      return 'all'
  }
}

export default async function AdminServiceDeskPage({ searchParams }: AdminServiceDeskPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const filters: ServiceDeskFilters = {
    assignee: readValue(resolvedSearchParams?.assignee) ?? 'all',
    category: normalizeCategory(readValue(resolvedSearchParams?.category)),
    lane: normalizeLane(readValue(resolvedSearchParams?.lane)),
    priority: normalizePriority(readValue(resolvedSearchParams?.priority)),
    source: normalizeSource(readValue(resolvedSearchParams?.source))
  }

  const [{ data: requests, error: requestsError }, { data: staff, error: staffError }, { data: requestEvents, error: requestEventsError }] = await Promise.all([
    supabase
      .from('service_requests')
      .select('*, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status), staff(id, name, role)')
      .order('created_at', { ascending: false }),
    supabase
      .from('staff')
      .select('id, name, role, active')
      .eq('active', true)
      .order('name', { ascending: true }),
    supabase
      .from('service_request_events')
      .select('id, service_request_id, event_type, message, actor_name, actor_role, created_at')
      .order('created_at', { ascending: false })
  ])

  if (requestsError) {
    throw new Error(requestsError.message)
  }

  if (staffError) {
    throw new Error(staffError.message)
  }

  if (requestEventsError) {
    throw new Error(requestEventsError.message)
  }

  return (
    <AdminServiceDeskClient
      filters={filters}
      requestEvents={(requestEvents ?? []) as ServiceRequestEventSummary[]}
      requests={(requests ?? []) as ServiceRequestWithRelations[]}
      staff={(staff ?? []) as StaffSummary[]}
    />
  )
}