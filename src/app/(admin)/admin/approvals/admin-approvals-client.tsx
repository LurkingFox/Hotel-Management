'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ManagerApprovalRow = Database['public']['Tables']['manager_approvals']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']
type PayMethod = Database['public']['Enums']['pay_method']

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

type ApprovalBoardProps = {
  filters: ApprovalsFilters
  pendingApprovals: PendingApproval[]
  pendingExtensions: PendingExtensionAudit[]
}

type ApprovalsLane = 'all' | 'extensions' | 'receipts' | 'kyc'
type ApprovalRequesterRoleFilter = 'all' | 'admin' | 'receptionist'

type ApprovalsFilters = {
  lane: ApprovalsLane
  requesterRole: ApprovalRequesterRoleFilter
}

type ApprovalMutationResponse = {
  error?: string
  message?: string
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

function formatLabel(value: string) {
  return value.replaceAll('_', ' ')
}

export function AdminApprovalsClient({ filters, pendingApprovals, pendingExtensions }: ApprovalBoardProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [approvalMethodDrafts, setApprovalMethodDrafts] = useState<Record<string, PayMethod>>({})
  const [approvalReferenceDrafts, setApprovalReferenceDrafts] = useState<Record<string, string>>({})

  const serviceReceiptApprovals = pendingApprovals.filter((approval) => approval.approval_type === 'service_receipt_confirmation')
  const bookingApprovalRecords = pendingApprovals.filter((approval) => approval.approval_type === 'booking_extension')
  const guestKycApprovals = pendingApprovals.filter((approval) => approval.approval_type === 'guest_kyc_review')
  const extensionApprovalByAuditId = new Map(
    bookingApprovalRecords.filter((approval) => approval.target_table === 'booking_extension_audits' && approval.target_id).map((approval) => [approval.target_id as string, approval])
  )
  const filteredExtensions = filters.requesterRole === 'all'
    ? pendingExtensions
    : pendingExtensions.filter((audit) => audit.requester_role === filters.requesterRole)
  const filteredReceiptApprovals = filters.requesterRole === 'all'
    ? serviceReceiptApprovals
    : serviceReceiptApprovals.filter((approval) => approval.requested_by_role === filters.requesterRole)
  const filteredGuestKycApprovals = filters.requesterRole === 'all'
    ? guestKycApprovals
    : guestKycApprovals.filter((approval) => approval.requested_by_role === filters.requesterRole)
  const totalVisibleApprovals = filteredExtensions.length + filteredReceiptApprovals.length + filteredGuestKycApprovals.length
  const laneCards = [
    { label: 'All queues', value: 'all' as const, count: totalVisibleApprovals },
    { label: 'Extensions', value: 'extensions' as const, count: filteredExtensions.length },
    { label: 'Receipts', value: 'receipts' as const, count: filteredReceiptApprovals.length },
    { label: 'Guest KYC', value: 'kyc' as const, count: filteredGuestKycApprovals.length }
  ]

  function buildParams(nextValues?: Partial<ApprovalsFilters>) {
    const params = new URLSearchParams()
    const nextFilters = {
      lane: nextValues?.lane ?? filters.lane,
      requesterRole: nextValues?.requesterRole ?? filters.requesterRole
    }

    if (nextFilters.lane !== 'all') {
      params.set('lane', nextFilters.lane)
    }

    if (nextFilters.requesterRole !== 'all') {
      params.set('requester', nextFilters.requesterRole)
    }

    return params
  }

  function updateFilters(nextValues?: Partial<ApprovalsFilters>) {
    startTransition(() => {
      const params = buildParams(nextValues)
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  const showExtensions = filters.lane === 'all' || filters.lane === 'extensions'
  const showReceipts = filters.lane === 'all' || filters.lane === 'receipts'
  const showGuestKyc = filters.lane === 'all' || filters.lane === 'kyc'

  function runExtensionApproval(auditId: string, action: 'approve' | 'reject') {
    const approval = extensionApprovalByAuditId.get(auditId)

    if (!approval) {
      setErrorMessage('Approval record for this extension is missing.')
      return
    }

    const note = reviewNotes[auditId]?.trim() ?? ''

    if (action === 'reject' && !note) {
      setErrorMessage('Add a discrepancy note before marking an extension as disputed.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvalId: approval.id,
          note: note || undefined
        })
      })

      const payload = (await response.json()) as ApprovalMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Manager review failed.')
        return
      }

      setSuccessMessage(payload.message ?? 'Extension review saved.')
      setReviewNotes((current) => ({ ...current, [auditId]: '' }))
      router.refresh()
    })
  }

  function runApproval(approvalId: string, action: 'approve' | 'reject') {
    const noteForApproval = reviewNotes[approvalId]?.trim() ?? ''
    const method = approvalMethodDrafts[approvalId] ?? 'cash'
    const reference = approvalReferenceDrafts[approvalId]?.trim() ?? ''

    if (action === 'reject' && !noteForApproval) {
      setErrorMessage('Add a note before rejecting this approval.')
      return
    }

    if (action === 'approve' && method !== 'cash' && !reference) {
      setErrorMessage('Reference is required for non-cash receipt approvals.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvalId,
          note: noteForApproval || undefined,
          payment: action === 'approve' ? { method, reference: reference || undefined } : undefined
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Approval review failed.')
        return
      }

      setSuccessMessage('Approval review saved.')
      setReviewNotes((current) => ({ ...current, [approvalId]: '' }))
      setApprovalReferenceDrafts((current) => ({ ...current, [approvalId]: '' }))
      router.refresh()
    })
  }

  function runGuestKycApproval(approvalId: string, action: 'approve' | 'reject') {
    const note = reviewNotes[approvalId]?.trim() ?? ''

    if (action === 'reject' && !note) {
      setErrorMessage('Add a review note before rejecting guest KYC.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvalId,
          note: note || undefined
        })
      })

      const payload = (await response.json()) as ApprovalMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'KYC review failed.')
        return
      }

      setSuccessMessage(payload.message ?? 'KYC review saved.')
      setReviewNotes((current) => ({ ...current, [approvalId]: '' }))
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <span className="sr-only">smoke:admin-approvals</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Manager approvals</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Review stay extensions, receipt confirmations, and guest KYC exceptions.</p>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Visible approvals</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{totalVisibleApprovals}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Extension reviews</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{filteredExtensions.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Receipt confirmations</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{filteredReceiptApprovals.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest KYC reviews</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{filteredGuestKycApprovals.length}</p>
          </article>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-card">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Queue control</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-ink">Approvals lanes</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/68">
                Focus the board by approval queue or filter to requests raised by admin or reception.
              </p>
            </div>
            <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
              Requester role
              <select
                className="ui-input min-w-[220px] bg-surface-sunken text-sm font-medium"
                disabled={isPending}
                onChange={(event) => updateFilters({ requesterRole: event.target.value as ApprovalsFilters['requesterRole'] })}
                value={filters.requesterRole}
              >
                <option value="all">All requesters</option>
                <option value="admin">Admin</option>
                <option value="receptionist">Reception</option>
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {laneCards.map((lane) => {
              const isActive = filters.lane === lane.value

              return (
                <button
                  key={lane.value}
                  className={`rounded-[1.5rem] border px-5 py-4 text-left transition ${isActive ? 'border-ink bg-ink text-white shadow-card' : 'border-ink/10 bg-surface-sunken text-ink hover:border-ink/25 hover:bg-[#e8f5ee]'}`}
                  disabled={isPending}
                  onClick={() => updateFilters({ lane: lane.value })}
                  type="button"
                >
                  <p className={`text-xs uppercase tracking-[0.24em] ${isActive ? 'text-white/72' : 'text-ink/45'}`}>{lane.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{lane.count}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          {showExtensions ? (
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Reception accountability</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Stay extension confirmations</h2>
              </div>
              <div className="ui-pill">{filteredExtensions.length} waiting</div>
            </div>

            <div className="mt-6 space-y-4">
              {filteredExtensions.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No pending stay confirmations match this queue right now.</div> : null}
              {filteredExtensions.map((audit) => {
                const booking = pickSingle(audit.bookings)
                const room = pickSingle(booking?.rooms)

                return (
                  <div key={audit.id} className="ui-panel p-5 bg-surface-sunken">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-2xl font-semibold text-ink">{booking?.guest_name ?? 'Unknown guest'}</p>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-800">Pending review</span>
                        </div>
                        <p className="mt-2 text-sm text-ink/65">
                          Room {room?.number ?? 'Unassigned'} · Extended from {formatDate(audit.previous_check_out_expected)} to {formatDate(audit.new_check_out_expected)}
                        </p>
                        <p className="mt-1 text-sm text-ink/65">Requested by {audit.requested_by} ({audit.requester_role}) at {formatDateTime(audit.created_at)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Added charge</p>
                        <p className="text-xl font-semibold text-ink">{formatGHS(audit.incremental_amount_ghs)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reason</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{audit.reason}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recorded now</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(audit.payment_recorded_ghs)}</p>
                        <p className="mt-1 text-sm text-ink/55">{audit.payment_method ? audit.payment_method.replace('_', ' ') : 'No payment method recorded'}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Current stay total</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(booking?.total_ghs ?? 0)}</p>
                        <p className="mt-1 text-sm text-ink/55">Balance {formatGHS(Number(booking?.balance_ghs ?? (booking ? booking.total_ghs - booking.paid_ghs : 0)))}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reference</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{audit.payment_reference ?? 'No reference recorded'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                      <textarea
                        className="ui-input min-h-[108px] text-sm"
                        onChange={(event) => setReviewNotes((current) => ({ ...current, [audit.id]: event.target.value }))}
                        placeholder="Optional manager note for confirmation, required if you mark a discrepancy."
                        value={reviewNotes[audit.id] ?? ''}
                      />
                      <div className="flex flex-wrap items-end gap-3 lg:flex-col lg:items-stretch">
                        <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending || !extensionApprovalByAuditId.has(audit.id)} onClick={() => runExtensionApproval(audit.id, 'approve')} type="button">Confirm extension</button>
                        <button className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60" disabled={isPending || !extensionApprovalByAuditId.has(audit.id)} onClick={() => runExtensionApproval(audit.id, 'reject')} type="button">Mark discrepancy</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
          ) : null}

          {showReceipts ? (
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Collections control</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Receipt confirmations</h2>
              </div>
              <div className="ui-pill">{filteredReceiptApprovals.length} waiting</div>
            </div>

            <div className="mt-6 space-y-4">
              {filteredReceiptApprovals.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No receipt approvals match this queue right now.</div> : null}
              {filteredReceiptApprovals.map((approval) => {
                const booking = pickSingle(approval.bookings)
                const metadata = approval.metadata && typeof approval.metadata === 'object' ? (approval.metadata as Record<string, unknown>) : null
                const amount = typeof metadata?.amount_ghs === 'number' ? metadata.amount_ghs : null
                const chargeType = typeof metadata?.charge_type === 'string' ? metadata.charge_type.replaceAll('_', ' ') : 'service'
                const method = approvalMethodDrafts[approval.id] ?? 'cash'

                return (
                  <div key={approval.id} className="ui-panel p-4 bg-surface-sunken">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{approval.title}</p>
                        <p className="mt-2 text-sm text-ink/60">{booking?.guest_name ?? 'Unknown guest'} · {chargeType} · {amount !== null ? formatGHS(amount) : 'Amount unavailable'}</p>
                        <p className="mt-1 text-sm text-ink/60">Requested by {approval.requested_by} · {formatDateTime(approval.requested_at)}</p>
                      </div>
                      <Link className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface-sunken" href="/admin/payments">
                        Payments
                      </Link>
                    </div>
                    {approval.detail ? <p className="mt-3 text-sm leading-6 text-ink/72">{approval.detail}</p> : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <select
                        className="ui-input text-sm"
                        disabled={isPending}
                        onChange={(event) => setApprovalMethodDrafts((current) => ({ ...current, [approval.id]: event.target.value as PayMethod }))}
                        value={method}
                      >
                        <option value="cash">Cash</option>
                        <option value="momo">MoMo</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                      <input
                        className="ui-input text-sm"
                        disabled={isPending}
                        onChange={(event) => setApprovalReferenceDrafts((current) => ({ ...current, [approval.id]: event.target.value }))}
                        placeholder="Reference if non-cash"
                        value={approvalReferenceDrafts[approval.id] ?? ''}
                      />
                    </div>

                    <textarea
                      className="ui-input mt-3 min-h-[96px] text-sm"
                      disabled={isPending}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                      placeholder="Optional approval note, required for rejection"
                      value={reviewNotes[approval.id] ?? ''}
                    />

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} onClick={() => runApproval(approval.id, 'approve')} type="button">Approve receipt</button>
                      <button className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60" disabled={isPending} onClick={() => runApproval(approval.id, 'reject')} type="button">Reject receipt</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
          ) : null}
        </section>

        <section>
          {showGuestKyc ? (
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Identity exceptions</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Guest KYC reviews</h2>
              </div>
              <div className="ui-pill">{filteredGuestKycApprovals.length} waiting</div>
            </div>

            <div className="mt-6 space-y-4">
              {filteredGuestKycApprovals.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No guest KYC reviews match this queue right now.</div> : null}
              {filteredGuestKycApprovals.map((approval) => {
                const metadata = approval.metadata && typeof approval.metadata === 'object' ? (approval.metadata as Record<string, unknown>) : null
                const guestName = typeof metadata?.guest_name === 'string' ? metadata.guest_name : approval.title.replace('Review KYC for ', '')
                const documentType = typeof metadata?.document_type === 'string' ? formatLabel(metadata.document_type) : 'document'
                const documentMasked = typeof metadata?.document_masked === 'string' ? metadata.document_masked : 'Unavailable'
                const phone = typeof metadata?.phone === 'string' ? metadata.phone : null
                const email = typeof metadata?.email === 'string' ? metadata.email : null
                const nationality = typeof metadata?.nationality === 'string' ? metadata.nationality : null

                return (
                  <div key={approval.id} className="ui-panel p-5 bg-surface-sunken">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-2xl font-semibold text-ink">{guestName || 'Unknown guest'}</p>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-800">Pending verification</span>
                        </div>
                        <p className="mt-2 text-sm text-ink/65">
                          {documentType} · {documentMasked}
                        </p>
                        <p className="mt-1 text-sm text-ink/65">Requested by {approval.requested_by} ({approval.requested_by_role ?? 'unknown'}) at {formatDateTime(approval.requested_at)}</p>
                      </div>
                      <Link className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-sunken" href="/admin/guests">
                        Open guest board
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Contact</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{phone ?? 'No phone captured'}</p>
                        <p className="text-sm leading-6 text-ink/55">{email ?? 'No email captured'}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Nationality</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{nationality ?? 'Not captured'}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Context</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{approval.detail ?? 'Manager review required before the guest can be treated as verified.'}</p>
                      </div>
                    </div>

                    <textarea
                      className="ui-input mt-4 min-h-[96px] text-sm"
                      disabled={isPending}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                      placeholder="Optional verification note, required for rejection"
                      value={reviewNotes[approval.id] ?? ''}
                    />

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} onClick={() => runGuestKycApproval(approval.id, 'approve')} type="button">Verify guest KYC</button>
                      <button className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60" disabled={isPending} onClick={() => runGuestKycApproval(approval.id, 'reject')} type="button">Reject KYC</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
          ) : null}
        </section>
      </div>
    </main>
  )
}