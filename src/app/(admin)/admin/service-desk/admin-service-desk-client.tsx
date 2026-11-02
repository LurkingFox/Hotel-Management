'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type StaffRow = Database['public']['Tables']['staff']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ServiceRequestEventRow = Database['public']['Tables']['service_request_events']['Row']
type ServiceRequestStatus = Database['public']['Enums']['service_request_status']
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority']
type ServiceRequestCategory = Database['public']['Enums']['service_request_category']
type ServiceRequestSource = Database['public']['Enums']['service_request_source']

type ServiceDeskLane = 'all-open' | 'all-statuses' | 'assigned' | 'due-soon' | 'in-progress' | 'overdue' | 'unassigned'

type ServiceDeskFilters = {
  assignee: string | 'all'
  category: ServiceRequestCategory | 'all'
  lane: ServiceDeskLane
  priority: ServiceRequestPriority | 'all'
  source: ServiceRequestSource | 'all'
}

type StaffSummary = Pick<StaffRow, 'id' | 'name' | 'role' | 'active'>
type ServiceRequestEventSummary = Pick<ServiceRequestEventRow, 'id' | 'service_request_id' | 'event_type' | 'message' | 'actor_name' | 'actor_role' | 'created_at'>

type ServiceRequestWithRelations = ServiceRequestRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | Array<Pick<StaffRow, 'id' | 'name' | 'role'>> | null
}

type AdminServiceDeskClientProps = {
  filters: ServiceDeskFilters
  requestEvents: ServiceRequestEventSummary[]
  requests: ServiceRequestWithRelations[]
  staff: StaffSummary[]
}

const priorityStyles: Record<ServiceRequestPriority, string> = {
  low: 'bg-[#eef3f8] text-[#28465d]',
  normal: 'bg-[#f4ead9] text-[#7a5530]',
  high: 'bg-[#fbe9d8] text-[#a15421]',
  urgent: 'bg-[#fde4e1] text-[#aa3024]'
}

const statusStyles: Record<ServiceRequestStatus, string> = {
  new: 'bg-[#eef3f8] text-[#28465d]',
  acknowledged: 'bg-[#f4ead9] text-[#7a5530]',
  assigned: 'bg-[#e8eef8] text-[#2d4e83]',
  in_progress: 'bg-[#e6f3ea] text-[#255b40]',
  completed: 'bg-[#e8f5ec] text-[#226441]',
  cancelled: 'bg-[#f7e4e2] text-[#9a433d]'
}

function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Unknown time'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const timezoneOffsetMinutes = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60000)
  return localDate.toISOString().slice(0, 16)
}

function isOpenStatus(status: ServiceRequestStatus) {
  return status !== 'completed' && status !== 'cancelled'
}

function formatStatusLabel(status: ServiceRequestStatus) {
  return status.replaceAll('_', ' ')
}

function formatSourceLabel(source: ServiceRequestSource) {
  return source.replaceAll('_', ' ')
}

function formatCategoryLabel(category: ServiceRequestCategory) {
  return category.replaceAll('_', ' ')
}

function getSlaState(request: ServiceRequestWithRelations, now: number) {
  if (!isOpenStatus(request.status) || !request.due_at) {
    return 'none' as const
  }

  const dueTime = new Date(request.due_at).getTime()
  const hoursUntilDue = (dueTime - now) / 3600000

  if (hoursUntilDue < 0) {
    return 'overdue' as const
  }

  if (hoursUntilDue <= 4) {
    return 'due-soon' as const
  }

  return 'scheduled' as const
}

function getSlaBadge(request: ServiceRequestWithRelations, now: number) {
  const slaState = getSlaState(request, now)

  if (slaState === 'overdue') {
    return { label: 'Overdue', style: 'bg-[#fde4e1] text-[#aa3024]' }
  }

  if (slaState === 'due-soon') {
    return { label: 'Due soon', style: 'bg-[#fff1dd] text-[#975d12]' }
  }

  if (slaState === 'scheduled') {
    return { label: 'On schedule', style: 'bg-[#e8f5ec] text-[#226441]' }
  }

  return null
}

export function AdminServiceDeskClient({ filters, requestEvents, requests, staff }: AdminServiceDeskClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({})
  const [dueAtDrafts, setDueAtDrafts] = useState<Record<string, string>>({})
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({})
  const [currentTime] = useState(() => Date.now())

  const eventsByRequestId = useMemo(() => {
    const grouped = new Map<string, ServiceRequestEventSummary[]>()

    for (const event of requestEvents) {
      const current = grouped.get(event.service_request_id) ?? []
      current.push(event)
      grouped.set(event.service_request_id, current)
    }

    return grouped
  }, [requestEvents])

  const openRequests = useMemo(() => requests.filter((request) => isOpenStatus(request.status)), [requests])
  const overdueRequests = useMemo(() => openRequests.filter((request) => getSlaState(request, currentTime) === 'overdue'), [currentTime, openRequests])
  const dueSoonRequests = useMemo(() => openRequests.filter((request) => getSlaState(request, currentTime) === 'due-soon'), [currentTime, openRequests])
  const urgentRequests = useMemo(() => openRequests.filter((request) => request.priority === 'urgent' || request.priority === 'high'), [openRequests])
  const assignedRequests = useMemo(() => openRequests.filter((request) => Boolean(request.assigned_staff_id)), [openRequests])
  const urgentUnassignedRequests = useMemo(
    () => openRequests.filter((request) => !request.assigned_staff_id && (request.priority === 'urgent' || request.priority === 'high')),
    [openRequests]
  )
  const recentCompleted = useMemo(() => requests.filter((request) => request.status === 'completed').slice(0, 6), [requests])
  const visibleRequests = useMemo(() => {
    let filtered = requests

    if (filters.priority !== 'all') {
      filtered = filtered.filter((request) => request.priority === filters.priority)
    }

    if (filters.category !== 'all') {
      filtered = filtered.filter((request) => request.category === filters.category)
    }

    if (filters.source !== 'all') {
      filtered = filtered.filter((request) => request.source === filters.source)
    }

    if (filters.assignee !== 'all') {
      filtered = filtered.filter((request) => request.assigned_staff_id === filters.assignee)
    }

    switch (filters.lane) {
      case 'all-statuses':
        return filtered
      case 'assigned':
        return filtered.filter((request) => isOpenStatus(request.status) && Boolean(request.assigned_staff_id))
      case 'due-soon':
        return filtered.filter((request) => getSlaState(request, currentTime) === 'due-soon')
      case 'in-progress':
        return filtered.filter((request) => request.status === 'in_progress')
      case 'overdue':
        return filtered.filter((request) => getSlaState(request, currentTime) === 'overdue')
      case 'unassigned':
        return filtered.filter((request) => isOpenStatus(request.status) && !request.assigned_staff_id)
      default:
        return filtered.filter((request) => isOpenStatus(request.status))
    }
  }, [currentTime, filters.assignee, filters.category, filters.lane, filters.priority, filters.source, requests])

  const activeLaneLabel = useMemo(() => {
    switch (filters.lane) {
      case 'all-statuses':
        return 'All request history'
      case 'assigned':
        return 'Assigned queue'
      case 'due-soon':
        return 'Due soon'
      case 'in-progress':
        return 'In progress'
      case 'overdue':
        return 'Overdue queue'
      case 'unassigned':
        return 'Unassigned queue'
      default:
        return 'Open request queue'
    }
  }, [filters.lane])

  const categoryOptions: Array<{ label: string; value: ServiceRequestCategory | 'all' }> = [
    { label: 'All categories', value: 'all' },
    { label: 'Housekeeping', value: 'housekeeping' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Laundry', value: 'laundry' },
    { label: 'Food', value: 'food' },
    { label: 'Minibar', value: 'minibar' },
    { label: 'Billing', value: 'billing' },
    { label: 'Other', value: 'other' }
  ]

  const laneCards = [
    { label: 'All open', value: 'all-open' as const, count: openRequests.length },
    { label: 'Overdue', value: 'overdue' as const, count: overdueRequests.length },
    { label: 'Due soon', value: 'due-soon' as const, count: dueSoonRequests.length },
    { label: 'Unassigned', value: 'unassigned' as const, count: openRequests.filter((request) => !request.assigned_staff_id).length },
    { label: 'In progress', value: 'in-progress' as const, count: openRequests.filter((request) => request.status === 'in_progress').length }
  ]

  function buildParams(nextValues?: Partial<ServiceDeskFilters>) {
    const params = new URLSearchParams()
    const nextFilters = {
      assignee: nextValues?.assignee ?? filters.assignee,
      category: nextValues?.category ?? filters.category,
      lane: nextValues?.lane ?? filters.lane,
      priority: nextValues?.priority ?? filters.priority,
      source: nextValues?.source ?? filters.source
    }

    params.set('lane', nextFilters.lane)

    if (nextFilters.priority !== 'all') {
      params.set('priority', nextFilters.priority)
    }

    if (nextFilters.category !== 'all') {
      params.set('category', nextFilters.category)
    }

    if (nextFilters.source !== 'all') {
      params.set('source', nextFilters.source)
    }

    if (nextFilters.assignee !== 'all') {
      params.set('assignee', nextFilters.assignee)
    }

    return params
  }

  function updateFilters(nextValues?: Partial<ServiceDeskFilters>) {
    startTransition(() => {
      router.push(`/admin/service-desk?${buildParams(nextValues).toString()}`)
    })
  }

  function runAction(id: string, action: 'acknowledge' | 'assign' | 'complete' | 'set_due_at' | 'start') {
    setErrorMessage(null)
    setSuccessMessage(null)

    const assignedStaffId = assignmentDrafts[id] || undefined
    const dueAt = dueAtDrafts[id] ?? undefined
    const resolutionNote = resolutionDrafts[id]?.trim() || undefined

    if (action === 'assign' && !assignedStaffId) {
      setErrorMessage('Select a staff member before assigning the request.')
      return
    }

    if (action === 'set_due_at' && dueAt) {
      const parsedDueAt = new Date(dueAt)

      if (Number.isNaN(parsedDueAt.getTime())) {
        setErrorMessage('Enter a valid due date and time before saving.')
        return
      }
    }

    if (action === 'complete' && !resolutionNote) {
      setErrorMessage('Add a brief resolution note before completing the request.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/service-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, assignedStaffId, dueAt: action === 'set_due_at' ? (dueAt || null) : undefined, id, resolutionNote })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'The request could not be updated.')
        return
      }

      setSuccessMessage('Service desk updated.')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_20%,_#f9fffc_20%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <span className="sr-only">smoke:admin-service-desk</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Service desk</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Track guest requests with assignment, urgency, due times, and escalation.</p>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open requests</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{openRequests.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-[#f0c0bb] bg-[#fff1ee] p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Overdue</p>
            <p className="mt-3 text-4xl font-semibold text-[#9f3527]">{overdueRequests.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-[#e7c4ba] bg-[#fff1ee] p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Urgent unassigned</p>
            <p className="mt-3 text-4xl font-semibold text-[#9f3527]">{urgentUnassignedRequests.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Due soon</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{dueSoonRequests.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Assigned</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{assignedRequests.length}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Queue control</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">{activeLaneLabel}</h2>
              </div>
              <Link className="ui-button-primary px-4 py-2" href="/admin/today">
                Back to Today
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {laneCards.map((lane) => (
                <button
                  className={filters.lane === lane.value ? 'ui-chip-active' : 'ui-chip'}
                  key={lane.value}
                  onClick={() => updateFilters({ lane: lane.value })}
                  type="button"
                >
                  {lane.label} ({lane.count})
                </button>
              ))}
              <button
                className={filters.lane === 'all-statuses' ? 'ui-chip-active' : 'ui-chip'}
                onClick={() => updateFilters({ lane: 'all-statuses' })}
                type="button"
              >
                All statuses
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm text-ink/70">
                <span className="font-semibold text-ink/80">Assignee</span>
                <select
                  className="ui-input bg-surface-sunken"
                  disabled={isPending}
                  onChange={(event) => updateFilters({ assignee: event.target.value || 'all' })}
                  value={filters.assignee}
                >
                  <option value="all">All staff</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-ink/70">
                <span className="font-semibold text-ink/80">Priority</span>
                <select
                  className="ui-input bg-surface-sunken"
                  disabled={isPending}
                  onChange={(event) => updateFilters({ priority: event.target.value as ServiceDeskFilters['priority'] })}
                  value={filters.priority}
                >
                  <option value="all">All priorities</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-ink/70">
                <span className="font-semibold text-ink/80">Category</span>
                <select
                  className="ui-input bg-surface-sunken"
                  disabled={isPending}
                  onChange={(event) => updateFilters({ category: event.target.value as ServiceDeskFilters['category'] })}
                  value={filters.category}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-ink/70">
                <span className="font-semibold text-ink/80">Source</span>
                <select
                  className="ui-input bg-surface-sunken"
                  disabled={isPending}
                  onChange={(event) => updateFilters({ source: event.target.value as ServiceDeskFilters['source'] })}
                  value={filters.source}
                >
                  <option value="all">All sources</option>
                  <option value="reception">Reception</option>
                  <option value="guest_portal">Guest portal</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
            </div>

            <div className="mt-6 space-y-4">
              {visibleRequests.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No requests match the current queue filters.</div> : null}
              {visibleRequests.map((request) => {
                const booking = pickSingle(request.bookings)
                const room = pickSingle(request.rooms)
                const assignedStaff = pickSingle(request.staff)
                const slaBadge = getSlaBadge(request, currentTime)

                return (
                  <div key={request.id} className="ui-panel p-5 bg-surface-sunken">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-2xl font-semibold text-ink">{request.title}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${priorityStyles[request.priority]}`}>{request.priority}</span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusStyles[request.status]}`}>{formatStatusLabel(request.status)}</span>
                          {slaBadge ? <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${slaBadge.style}`}>{slaBadge.label}</span> : null}
                        </div>
                        <p className="mt-2 text-sm text-ink/65">
                          {formatCategoryLabel(request.category)} · Room {room?.number ?? 'Unassigned'} · {booking?.guest_name ?? request.guest_name ?? 'Guest not linked'}
                        </p>
                        <p className="mt-1 text-sm text-ink/60">
                          Opened {formatDateTime(request.created_at)} by {request.requested_by} via {formatSourceLabel(request.source)}
                        </p>
                        {request.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/72">{request.description}</p> : null}
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Stay window</p>
                        <p className="mt-2 text-sm font-semibold text-ink">{booking ? `${formatDate(booking.check_in)} to ${formatDate(booking.check_out_expected)}` : 'No booking linked'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Assigned staff</p>
                          <p className="mt-2 text-sm text-ink/72">{assignedStaff ? `${assignedStaff.name} (${assignedStaff.role})` : 'Not assigned yet'}</p>
                          <select
                            className="ui-input mt-3 bg-surface-base text-sm"
                            disabled={isPending}
                            onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            value={assignmentDrafts[request.id] ?? request.assigned_staff_id ?? ''}
                          >
                            <option value="">Select staff member</option>
                            {staff.map((member) => (
                              <option key={member.id} value={member.id}>{member.name} - {member.role}</option>
                            ))}
                          </select>
                          <button
                            className="mt-3 w-full rounded-full bg-[#efe6d6] px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[#e3d6c2] disabled:opacity-60"
                            disabled={isPending || !(assignmentDrafts[request.id] ?? request.assigned_staff_id ?? '')}
                            onClick={() => runAction(request.id, 'assign')}
                            type="button"
                          >
                            {request.assigned_staff_id ? 'Save reassignment' : 'Save assignment'}
                          </button>
                        </div>

                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Due by</p>
                          <p className="mt-2 text-sm text-ink/72">{request.due_at ? formatDateTime(request.due_at) : 'No SLA set yet'}</p>
                          <input
                            className="ui-input mt-3 bg-surface-base text-sm"
                            disabled={isPending}
                            min={new Date().toISOString().slice(0, 16)}
                            onChange={(event) => setDueAtDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            type="datetime-local"
                            value={dueAtDrafts[request.id] ?? formatDateTimeLocalValue(request.due_at)}
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              className="flex-1 rounded-full bg-[#dfe9f6] px-4 py-2 text-sm font-semibold text-[#26456d] transition hover:bg-[#cfddee] disabled:opacity-60"
                              disabled={isPending}
                              onClick={() => runAction(request.id, 'set_due_at')}
                              type="button"
                            >
                              Save due time
                            </button>
                            <button
                              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[#f3ede3] disabled:opacity-60"
                              disabled={isPending && !(request.due_at || dueAtDrafts[request.id])}
                              onClick={() => {
                                setDueAtDrafts((current) => ({ ...current, [request.id]: '' }))
                                startTransition(async () => {
                                  const response = await fetch('/api/service-requests', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'set_due_at', dueAt: null, id: request.id })
                                  })

                                  const payload = (await response.json()) as { error?: string }

                                  if (!response.ok) {
                                    setErrorMessage(payload.error ?? 'The request could not be updated.')
                                    return
                                  }

                                  setSuccessMessage('Service desk updated.')
                                  router.refresh()
                                })
                              }}
                              type="button"
                            >
                              Clear
                            </button>
                          </div>
                          <textarea
                            className="ui-input mt-3 min-h-[104px] bg-surface-base text-sm"
                            disabled={isPending}
                            onChange={(event) => setResolutionDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                            placeholder="Resolution note for completion"
                            value={resolutionDrafts[request.id] ?? ''}
                          />
                        </div>

                        <div className="rounded-2xl bg-white p-4 md:col-span-1">
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recent timeline</p>
                          <div className="mt-3 space-y-3">
                            {(eventsByRequestId.get(request.id) ?? []).slice(0, 3).map((event) => (
                              <div key={event.id} className="rounded-xl bg-surface-sunken p-3">
                                <p className="text-sm font-semibold text-ink">{event.message}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{event.actor_name ?? 'system'} · {formatDateTime(event.created_at)}</p>
                              </div>
                            ))}
                            {(eventsByRequestId.get(request.id) ?? []).length === 0 ? <p className="text-sm text-ink/55">No request events yet.</p> : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-3 lg:flex-col lg:items-stretch">
                        {request.status === 'new' ? (
                          <button className="ui-button-primary disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'acknowledge')} type="button">
                            Acknowledge
                          </button>
                        ) : null}
                        {(request.status === 'acknowledged' || request.status === 'new') ? (
                          <button className="rounded-full bg-[#efe6d6] px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#e3d6c2] disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'assign')} type="button">
                            Assign staff
                          </button>
                        ) : null}
                        {request.status === 'assigned' ? (
                          <button className="rounded-full bg-[#dfe9f6] px-5 py-3 text-sm font-semibold text-[#26456d] transition hover:bg-[#cfddee] disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'start')} type="button">
                            Start work
                          </button>
                        ) : null}
                        {request.status === 'in_progress' ? (
                          <button className="rounded-full bg-[#dfeee5] px-5 py-3 text-sm font-semibold text-[#24573d] transition hover:bg-[#cfe3d7] disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'complete')} type="button">
                            Complete request
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Priority queue</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Urgent and high priority</h2>
              <div className="mt-5 space-y-3">
                {urgentRequests.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No urgent queue items right now.</div> : null}
                {urgentRequests.map((request) => {
                  const room = pickSingle(request.rooms)
                  return (
                    <div key={request.id} className="ui-panel-soft p-4">
                      <p className="text-sm font-semibold text-ink">{request.title}</p>
                      <p className="mt-2 text-sm text-ink/60">{request.priority} · Room {room?.number ?? 'Unassigned'} · {formatDateTime(request.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Recently completed</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Closed loop work</h2>
              <div className="mt-5 space-y-3">
                {recentCompleted.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No completed requests yet.</div> : null}
                {recentCompleted.map((request) => {
                  const room = pickSingle(request.rooms)
                  return (
                    <div key={request.id} className="ui-panel-soft p-4">
                      <p className="text-sm font-semibold text-ink">{request.title}</p>
                      <p className="mt-2 text-sm text-ink/60">Room {room?.number ?? 'Unassigned'} · Completed {formatDateTime(request.completed_at)}</p>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}