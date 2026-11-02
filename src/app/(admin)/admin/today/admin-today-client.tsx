'use client'

import Link from 'next/link'
import { useMemo } from 'react'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
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

type NotificationWithBooking = Pick<NotificationRow, 'id' | 'type' | 'message' | 'created_at' | 'triggered_by'> & {
  bookings: Pick<BookingRow, 'guest_name'> | Array<Pick<BookingRow, 'guest_name'>> | null
}

type ServiceChargeWithBooking = Pick<ServiceChargeRow, 'id' | 'amount_ghs' | 'type' | 'description' | 'created_at'> & {
  bookings:
    | (Pick<BookingRow, 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null })
    | Array<Pick<BookingRow, 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null }>
    | null
}

type ServiceRequestWithRelations = Pick<ServiceRequestRow, 'id' | 'category' | 'priority' | 'status' | 'title' | 'created_at' | 'guest_name'> & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null })
    | Array<Pick<BookingRow, 'id' | 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null }>
    | null
} & Pick<ServiceRequestRow, 'assigned_staff_id' | 'due_at'>

type PendingApproval = Pick<ManagerApprovalRow, 'id' | 'approval_type' | 'booking_id' | 'detail' | 'metadata' | 'requested_at' | 'requested_by' | 'requested_by_role' | 'status' | 'title'> & {
  bookings: Pick<BookingRow, 'id' | 'guest_name'> | Array<Pick<BookingRow, 'id' | 'guest_name'>> | null
}

type HandoffSummary = {
  created_at: string
  created_by_name: string
  id: string
  operational_handoff_items: Array<{ id: string; resolved: boolean }> | null
  status: string
  summary: string | null
}

type TodayClientProps = {
  activeBalances: BookingWithRoom[]
  dueOutToday: BookingWithRoom[]
  handoffSummary: {
    open: number
    recent: HandoffSummary[]
    unresolvedItems: number
  }
  pendingApprovals: PendingApproval[]
  paymentsToday: {
    count: number
    total: number
  }
  pendingExtensions: PendingExtensionAudit[]
  recentExtensions: PendingExtensionAudit[]
  roomStats: Record<Database['public']['Enums']['room_status'], number>
  openRequests: ServiceRequestWithRelations[]
  unresolvedCharges: ServiceChargeWithBooking[]
  unreadNotifications: NotificationWithBooking[]
  upcomingBookings: BookingWithRoom[]
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
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  })
}

function summarizeUpcoming(booking: BookingWithRoom) {
  const room = pickSingle(booking.rooms)
  return `${formatDate(booking.check_in)} · Room ${room?.number ?? 'Pending'} · Balance ${formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}`
}

function getRequestSlaState(request: ServiceRequestWithRelations) {
  if (!request.due_at) {
    return 'none' as const
  }

  const dueTime = new Date(request.due_at).getTime()
  const now = Date.now()
  const hoursUntilDue = (dueTime - now) / 3600000

  if (hoursUntilDue < 0) {
    return 'overdue' as const
  }

  if (hoursUntilDue <= 4) {
    return 'due-soon' as const
  }

  return 'scheduled' as const
}

export function AdminTodayClient({
  activeBalances,
  dueOutToday,
  handoffSummary,
  pendingApprovals,
  paymentsToday,
  pendingExtensions,
  recentExtensions,
  roomStats,
  openRequests,
  unresolvedCharges,
  unreadNotifications,
  upcomingBookings,
}: TodayClientProps) {
  const approvalSummary = useMemo(
    () => ({
      extensionReviews: pendingApprovals.filter((approval) => approval.approval_type === 'booking_extension').length,
      guestKycReviews: pendingApprovals.filter((approval) => approval.approval_type === 'guest_kyc_review').length,
      receiptReviews: pendingApprovals.filter((approval) => approval.approval_type === 'service_receipt_confirmation').length
    }),
    [pendingApprovals]
  )

  const overdueRequests = useMemo(() => openRequests.filter((request) => getRequestSlaState(request) === 'overdue'), [openRequests])
  const dueSoonRequests = useMemo(() => openRequests.filter((request) => getRequestSlaState(request) === 'due-soon'), [openRequests])
  const unassignedRequests = useMemo(() => openRequests.filter((request) => !request.assigned_staff_id), [openRequests])
  const urgentUnassignedRequests = useMemo(
    () => openRequests.filter((request) => !request.assigned_staff_id && (request.priority === 'urgent' || request.priority === 'high')),
    [openRequests]
  )
  const serviceDeskExceptions = useMemo(
    () => [...overdueRequests, ...urgentUnassignedRequests.filter((request) => !overdueRequests.some((overdue) => overdue.id === request.id))].slice(0, 4),
    [overdueRequests, urgentUnassignedRequests]
  )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_20%,_#f9fffc_20%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-today">
      <span className="sr-only">smoke:admin-today</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Today</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Review confirmations, arrivals, balances, and requests that need attention today.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Upcoming stays</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{upcomingBookings.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Due out today</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{dueOutToday.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open balances</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{activeBalances.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unresolved charges</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{unresolvedCharges.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-[#e7c4ba] bg-[#fff1ee] p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Urgent unassigned</p>
            <p className="mt-3 text-4xl font-semibold text-[#9f3527]">{urgentUnassignedRequests.length}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Service Desk exceptions</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">What can slip next</h2>
              </div>
              <Link className="ui-chip" href={overdueRequests.length > 0 ? '/admin/service-desk?lane=overdue' : urgentUnassignedRequests.length > 0 ? '/admin/service-desk?lane=unassigned&priority=urgent' : '/admin/service-desk'}>
                Open Service Desk
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Link className="rounded-[1.5rem] bg-[#fff1ee] p-5 transition hover:bg-[#fde7e2]" href="/admin/service-desk?lane=overdue">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Overdue</p>
                <p className="mt-3 text-4xl font-semibold text-[#9f3527]">{overdueRequests.length}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Requests already beyond their committed due time.</p>
              </Link>
              <Link className="ui-link-card p-5" href="/admin/service-desk?lane=due-soon">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Due soon</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{dueSoonRequests.length}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Requests entering the next SLA window within four hours.</p>
              </Link>
              <Link className="ui-link-card p-5" href="/admin/service-desk?lane=unassigned">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unassigned</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{unassignedRequests.length}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Open requests that still have no named owner in the queue.</p>
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {serviceDeskExceptions.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No request exceptions are pushing above the line right now.</div> : null}
              {serviceDeskExceptions.map((request) => {
                const booking = pickSingle(request.bookings)
                const room = pickSingle(booking?.rooms)
                const slaState = getRequestSlaState(request)

                return (
                  <div key={request.id} className="ui-panel-soft p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{request.title}</p>
                        <p className="mt-2 text-sm text-ink/60">{request.priority} · {request.category.replaceAll('_', ' ')} · Room {room?.number ?? 'Unassigned'}</p>
                        {request.due_at ? <p className="mt-2 text-sm text-ink/55">Due {formatDateTime(request.due_at)}</p> : null}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${slaState === 'overdue' ? 'bg-[#fff1ee] text-[#9f3527]' : 'bg-[#fff4dd] text-[#975d12]'}`}>
                        {slaState === 'overdue' ? 'Overdue' : 'Urgent'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Service Desk route map</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Jump into the right lane</h2>
            <div className="mt-6 space-y-3">
              <Link className="ui-link-card block p-4" href="/admin/service-desk?lane=overdue">
                <p className="text-sm font-semibold text-ink">Overdue lane</p>
                <p className="mt-2 text-sm text-ink/60">Handle missed commitments before they become guest-facing failures.</p>
              </Link>
              <Link className="ui-link-card block p-4" href="/admin/service-desk?lane=due-soon">
                <p className="text-sm font-semibold text-ink">Due soon lane</p>
                <p className="mt-2 text-sm text-ink/60">Work the next four-hour SLA window before it breaches.</p>
              </Link>
              <Link className="ui-link-card block p-4" href="/admin/service-desk?lane=unassigned">
                <p className="text-sm font-semibold text-ink">Unassigned lane</p>
                <p className="mt-2 text-sm text-ink/60">Name an owner for loose work before it disappears between shifts.</p>
              </Link>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Manager approvals</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Approval snapshot</h2>
              </div>
              <Link className="ui-chip" href="/admin/approvals">
                Open board
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="ui-panel-soft p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Stay extension reviews</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{approvalSummary.extensionReviews}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Reception-led stay changes waiting for manager confirmation.</p>
              </div>
              <div className="ui-panel-soft p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Receipt confirmations</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{approvalSummary.receiptReviews}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Resolved service charges that still need payment confirmation.</p>
              </div>
              <div className="ui-panel-soft p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest KYC reviews</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{approvalSummary.guestKycReviews}</p>
                <p className="mt-3 text-sm leading-6 text-ink/65">Identity documents waiting for manager verification.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {pendingExtensions.length === 0 && pendingApprovals.length === 0 ? (
                <div className="ui-panel-soft p-4 text-sm text-ink/70">No approvals are waiting right now.</div>
              ) : null}
              {pendingExtensions.slice(0, 3).map((audit) => {
                const booking = pickSingle(audit.bookings)
                const room = pickSingle(booking?.rooms)
                return (
                  <div key={audit.id} className="ui-panel-soft p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{booking?.guest_name ?? 'Unknown guest'} extension review</p>
                        <p className="mt-2 text-sm text-ink/60">Room {room?.number ?? 'Unassigned'} · {formatDate(audit.previous_check_out_expected)} to {formatDate(audit.new_check_out_expected)}</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-800">Pending</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Operational alerts</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Unread notifications</h2>
              <div className="mt-5 space-y-3">
                {unreadNotifications.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No unread notifications.</div> : null}
                {unreadNotifications.map((notification) => {
                  const booking = pickSingle(notification.bookings)
                  return (
                    <div key={notification.id} className="ui-panel-soft p-4">
                      <p className="text-sm font-semibold text-ink">{notification.message}</p>
                      <p className="mt-2 text-sm text-ink/60">{booking?.guest_name ?? 'General event'} · {formatDateTime(notification.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Approvals queue</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Decision runway</h2>
                </div>
                <Link className="ui-chip" href="/admin/approvals">
                  Open approvals
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                <div className="ui-panel-soft p-4">
                  <p className="text-sm font-semibold text-ink">{pendingApprovals.length} total items are waiting</p>
                  <p className="mt-2 text-sm text-ink/60">{approvalSummary.extensionReviews} extension reviews and {approvalSummary.receiptReviews} receipt confirmations are ready for manager action.</p>
                </div>
                <div className="ui-panel-soft p-4">
                  <p className="text-sm font-semibold text-ink">Why this moved out of Today</p>
                  <p className="mt-2 text-sm leading-6 text-ink/60">Today now highlights what needs attention. The approvals board is where review decisions, notes, and payment-method handling happen.</p>
                </div>
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Shift continuity</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Open handoffs</h2>
                </div>
                <Link className="ui-chip" href="/admin/handoffs">
                  Open handoffs
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                <div className="ui-panel-soft p-4">
                  <p className="text-sm font-semibold text-ink">{handoffSummary.open} active handoff{handoffSummary.open === 1 ? '' : 's'}</p>
                  <p className="mt-2 text-sm text-ink/60">{handoffSummary.unresolvedItems} unresolved carryover item{handoffSummary.unresolvedItems === 1 ? '' : 's'} across reception shift notes.</p>
                </div>
                {handoffSummary.recent.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No handoffs are open right now.</div> : null}
                {handoffSummary.recent.map((handoff) => {
                  const unresolved = (handoff.operational_handoff_items ?? []).filter((item) => !item.resolved).length
                  return (
                    <div key={handoff.id} className="ui-panel-soft p-4">
                      <p className="text-sm font-semibold text-ink">{handoff.summary || 'Reception handoff'}</p>
                      <p className="mt-2 text-sm text-ink/60">{handoff.created_by_name} · {formatDateTime(handoff.created_at)} · {unresolved} unresolved</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Service desk</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Open requests</h2>
                </div>
                <Link className="ui-chip" href={overdueRequests.length > 0 ? '/admin/service-desk?lane=overdue' : '/admin/service-desk'}>
                  Open queue
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Link className="rounded-2xl bg-[#fff1ee] p-4 text-sm transition hover:bg-[#fde7e2]" href="/admin/service-desk?lane=overdue">
                    <p className="font-semibold text-ink">{overdueRequests.length} overdue</p>
                    <p className="mt-2 text-ink/60">Open the breach queue</p>
                  </Link>
                  <Link className="ui-link-card rounded-2xl p-4 text-sm" href="/admin/service-desk?lane=due-soon">
                    <p className="font-semibold text-ink">{dueSoonRequests.length} due soon</p>
                    <p className="mt-2 text-ink/60">Open the next SLA window</p>
                  </Link>
                  <Link className="ui-link-card rounded-2xl p-4 text-sm" href="/admin/service-desk?lane=unassigned">
                    <p className="font-semibold text-ink">{unassignedRequests.length} unassigned</p>
                    <p className="mt-2 text-ink/60">Open unassigned work</p>
                  </Link>
                </div>
                {openRequests.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No service requests are open right now.</div> : null}
                {openRequests.slice(0, 4).map((request) => {
                  const booking = pickSingle(request.bookings)
                  const room = pickSingle(booking?.rooms)
                  const slaState = getRequestSlaState(request)
                  return (
                    <div key={request.id} className="ui-panel-soft p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{request.title}</p>
                          <p className="mt-2 text-sm text-ink/60">{request.priority} · {request.category.replaceAll('_', ' ')} · Room {room?.number ?? 'Unassigned'}</p>
                          {request.due_at ? <p className="mt-2 text-sm text-ink/55">Due {formatDateTime(request.due_at)}</p> : null}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${slaState === 'overdue' ? 'bg-[#fff1ee] text-[#9f3527]' : slaState === 'due-soon' ? 'bg-[#fff4dd] text-[#975d12]' : 'bg-[#f1efe9] text-ink/70'}`}>
                          {slaState === 'overdue' ? 'Overdue' : slaState === 'due-soon' ? 'Due soon' : request.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Revenue exceptions</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Unresolved charges</h2>
              <div className="mt-5 space-y-3">
                {unresolvedCharges.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No unresolved service charges.</div> : null}
                {unresolvedCharges.map((charge) => {
                  const booking = pickSingle(charge.bookings)
                  const room = pickSingle(booking?.rooms)
                  return (
                    <div key={charge.id} className="ui-panel-soft p-4">
                      <p className="text-sm font-semibold text-ink">{charge.type.replace('_', ' ')} · {formatGHS(charge.amount_ghs)}</p>
                      <p className="mt-2 text-sm text-ink/60">
                        {booking?.guest_name ?? 'Unknown guest'} · Room {room?.number ?? 'Unassigned'} · {charge.description ?? 'No description'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Upcoming stays</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Arrivals in the next 48 hours</h2>
              </div>
              <div className="ui-pill">{upcomingBookings.length} upcoming</div>
            </div>

            <div className="mt-6 space-y-3">
              {upcomingBookings.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No imminent arrivals.</div> : null}
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="ui-panel-soft p-4">
                  <p className="text-lg font-semibold text-ink">{booking.guest_name}</p>
                  <p className="mt-1 text-sm text-ink/60">{summarizeUpcoming(booking)}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Active stays</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Due outs, balances, and recent changes</h2>
              </div>
              <div className="ui-pill">{recentExtensions.length} changed today</div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="ui-panel-soft space-y-3 p-4">
                <p className="text-sm font-semibold text-ink/75">Due out today</p>
                {dueOutToday.length === 0 ? <p className="text-sm text-ink/60">No due-outs today.</p> : null}
                {dueOutToday.map((booking) => (
                  <div key={booking.id} className="rounded-2xl bg-white p-4">
                    <p className="font-semibold text-ink">{booking.guest_name}</p>
                    <p className="mt-1 text-sm text-ink/60">Room {pickSingle(booking.rooms)?.number ?? 'Unassigned'} · {formatDate(booking.check_out_expected)}</p>
                  </div>
                ))}
              </div>

              <div className="ui-panel-soft space-y-3 p-4">
                <p className="text-sm font-semibold text-ink/75">Open balances</p>
                {activeBalances.length === 0 ? <p className="text-sm text-ink/60">No active stays with balances.</p> : null}
                {activeBalances.map((booking) => (
                  <div key={booking.id} className="rounded-2xl bg-white p-4">
                    <p className="font-semibold text-ink">{booking.guest_name}</p>
                    <p className="mt-1 text-sm text-ink/60">Balance {formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="ui-panel-soft mt-4 p-4">
              <p className="text-sm font-semibold text-ink/75">Recent extension activity</p>
              <div className="mt-3 space-y-3">
                {recentExtensions.length === 0 ? <p className="text-sm text-ink/60">No extension activity recorded today.</p> : null}
                {recentExtensions.map((audit) => {
                  const booking = pickSingle(audit.bookings)
                  return (
                    <div key={audit.id} className="rounded-2xl bg-white p-4">
                      <p className="font-semibold text-ink">{booking?.guest_name ?? 'Unknown guest'} · {formatGHS(audit.incremental_amount_ghs)}</p>
                      <p className="mt-1 text-sm text-ink/60">{audit.confirmation_status.replace('_', ' ')} · {formatDateTime(audit.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Rooms needing attention</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">House status at a glance</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(roomStats).map(([status, count]) => (
                <div key={status} className="ui-panel-soft p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">{status}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Cash today</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Collection snapshot</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="ui-panel-soft p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Payments recorded</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{paymentsToday.count}</p>
              </div>
              <div className="ui-panel-soft p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Value collected</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{formatGHS(paymentsToday.total)}</p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}