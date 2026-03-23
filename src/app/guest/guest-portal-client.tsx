'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { GuestPortalNotification, GuestPortalServiceRequest, GuestPortalServiceRequestEvent } from '@/lib/guest-portal'
import { formatDate } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type ServiceRequestCategory = Database['public']['Enums']['service_request_category']
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority']
type ServiceRequestStatus = Database['public']['Enums']['service_request_status']

type GuestPortalClientProps = {
  accessCode: string
  notifications: GuestPortalNotification[]
  proof: string
  requestEvents: GuestPortalServiceRequestEvent[]
  requests: GuestPortalServiceRequest[]
  token: string
}

const categoryDetails: Array<{ detail: string; label: string; value: ServiceRequestCategory }> = [
  { value: 'housekeeping', label: 'Housekeeping', detail: 'Cleaning, towels, linen, toiletries.' },
  { value: 'maintenance', label: 'Maintenance', detail: 'Air conditioning, power, plumbing, room hardware.' },
  { value: 'laundry', label: 'Laundry', detail: 'Pickup, ironing, and garment handling.' },
  { value: 'food', label: 'Food', detail: 'Room delivery, refreshments, meal requests.' },
  { value: 'minibar', label: 'Minibar', detail: 'Replenishment or minibar corrections.' },
  { value: 'billing', label: 'Billing', detail: 'Bill questions, missing charges, and statement review.' },
  { value: 'other', label: 'Other', detail: 'Anything else the front desk should handle.' }
]

const statusStyles: Record<ServiceRequestStatus, string> = {
  acknowledged: 'bg-[#f4ead9] text-[#7a5530]',
  assigned: 'bg-[#e8eef8] text-[#2d4e83]',
  cancelled: 'bg-[#f7e4e2] text-[#9a433d]',
  completed: 'bg-[#e8f5ec] text-[#226441]',
  in_progress: 'bg-[#e6f3ea] text-[#255b40]',
  new: 'bg-[#eef3f8] text-[#28465d]'
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  })
}

function getNotificationTone(type: string) {
  if (type.includes('completed') || type.includes('confirmed')) {
    return 'border-green-200 bg-green-50 text-green-900'
  }

  if (type.includes('cancelled') || type.includes('rejected') || type.includes('revoked')) {
    return 'border-red-200 bg-red-50 text-red-900'
  }

  if (type.includes('payment') || type.includes('receipt') || type.includes('charge')) {
    return 'border-blue-200 bg-blue-50 text-blue-900'
  }

  return 'border-ink/10 bg-white text-ink'
}

function getGuestNotificationCopy(notification: GuestPortalNotification) {
  switch (notification.type) {
    case 'request_created':
      return {
        title: 'Request sent',
        detail: 'Your request has been added to the hotel service queue.'
      }
    case 'request_acknowledged':
      return {
        title: 'Request acknowledged',
        detail: 'The hotel team has seen your request and will follow up.'
      }
    case 'request_assigned':
      return {
        title: 'Request assigned',
        detail: 'A hotel team member has been assigned to your request.'
      }
    case 'request_started':
      return {
        title: 'Request in progress',
        detail: 'Work has started on one of your requests.'
      }
    case 'request_completed':
      return {
        title: 'Request completed',
        detail: 'One of your requests has been completed.'
      }
    case 'request_cancelled':
      return {
        title: 'Request cancelled',
        detail: 'A request was cancelled. If this was unexpected, please contact reception.'
      }
    case 'request_updated':
      return {
        title: 'Request updated',
        detail: 'The hotel team posted a new update to one of your requests.'
      }
    case 'service_charge_added':
      return {
        title: 'New charge added',
        detail: 'A new service charge has been posted to your stay ledger.'
      }
    case 'service_charge_receipt_review_required':
      return {
        title: 'Charge awaiting confirmation',
        detail: 'A completed service is waiting for receipt confirmation.'
      }
    case 'service_charge_receipt_confirmed':
      return {
        title: 'Charge confirmed',
        detail: 'A service charge payment has been confirmed on your stay.'
      }
    case 'service_charge_receipt_rejected':
      return {
        title: 'Charge still under review',
        detail: 'A service receipt could not be confirmed yet. Reception can assist if needed.'
      }
    case 'access_credential_issued':
      return {
        title: 'Room access issued',
        detail: 'Your room access has been activated for this stay.'
      }
    case 'access_credential_extended':
      return {
        title: 'Room access extended',
        detail: 'Your room access validity has been extended.'
      }
    case 'access_credential_revoked':
      return {
        title: 'Room access closed',
        detail: 'Your current room access has been closed or revoked.'
      }
    case 'booking_checked_in':
    case 'walk_in_checked_in':
      return {
        title: 'Check-in recorded',
        detail: 'Your stay is now active in the hotel system.'
      }
    case 'booking_checked_out':
      return {
        title: 'Check-out recorded',
        detail: 'Your stay has been checked out in the hotel system.'
      }
    case 'booking_cancelled':
      return {
        title: 'Booking cancelled',
        detail: 'This reservation was cancelled in the hotel system.'
      }
    case 'reservation_created':
      return {
        title: 'Reservation created',
        detail: 'Your reservation has been created and saved by the hotel.'
      }
    case 'shift_handoff_created':
      return {
        title: 'Hotel operations updated',
        detail: 'The hotel team recorded an internal handoff update during your stay.'
      }
    default:
      return {
        title: formatLabel(notification.type),
        detail: 'The hotel posted an update to your stay.'
      }
  }
}

function getGuestRequestEventCopy(event: GuestPortalServiceRequestEvent) {
  switch (event.event_type) {
    case 'created':
      return {
        title: 'Request sent',
        detail: 'Your request was added to the hotel service queue.'
      }
    case 'acknowledge':
    case 'acknowledged':
      return {
        title: 'Request acknowledged',
        detail: 'The hotel team has seen your request and will follow up.'
      }
    case 'assign':
    case 'assigned':
      return {
        title: 'Request assigned',
        detail: 'A hotel team member has been assigned to handle your request.'
      }
    case 'start':
    case 'started':
      return {
        title: 'Request in progress',
        detail: 'Work has started on your request.'
      }
    case 'complete':
    case 'completed':
      return {
        title: 'Request completed',
        detail: 'Your request has been completed.'
      }
    case 'cancel':
    case 'cancelled':
      return {
        title: 'Request cancelled',
        detail: 'This request was cancelled. Contact reception if this was unexpected.'
      }
    default:
      return {
        title: formatLabel(event.event_type),
        detail: 'The hotel team posted an update to your request.'
      }
  }
}

export function GuestPortalClient({ accessCode, notifications, proof, requestEvents, requests, token }: GuestPortalClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ServiceRequestCategory>('housekeeping')
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal')

  const openRequests = useMemo(() => requests.filter((request) => request.status !== 'completed' && request.status !== 'cancelled'), [requests])
  const closedRequests = useMemo(() => requests.filter((request) => request.status === 'completed' || request.status === 'cancelled'), [requests])
  const eventsByRequestId = useMemo(() => {
    const grouped = new Map<string, GuestPortalServiceRequestEvent[]>()

    for (const event of requestEvents) {
      const current = grouped.get(event.service_request_id) ?? []
      current.push(event)
      grouped.set(event.service_request_id, current)
    }

    return grouped
  }, [requestEvents])
  const recentHotelUpdates = useMemo(
    () => requestEvents.filter((event) => event.actor_role !== 'guest' && event.event_type !== 'created').slice(0, 6),
    [requestEvents]
  )

  const stayAlerts = useMemo(
    () => notifications.filter((entry) => typeof entry.created_at === 'string').slice(0, 8),
    [notifications]
  )

  function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!title.trim()) {
      setErrorMessage('A short request title is required.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/guest-portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode,
          category,
          description: description.trim() || undefined,
          priority,
          proof: proof || undefined,
          token: token || undefined,
          title: title.trim()
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'The request could not be submitted.')
        return
      }

      setSuccessMessage('Your request has been sent to the hotel service desk.')
      setTitle('')
      setDescription('')
      setCategory('housekeeping')
      setPriority('normal')
      router.refresh()
    })
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <article className="rounded-[2rem] bg-white p-6 shadow-card">
        <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Request service</p>
        <h3 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Send a request</h3>
        <p className="mt-3 text-sm leading-6 text-ink/62">
          Ask for housekeeping, laundry, maintenance, billing review, or other help without calling reception.
        </p>

        {errorMessage ? <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="mt-5 rounded-[1.25rem] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</div> : null}

        <form className="mt-6 space-y-4" onSubmit={submitRequest}>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-ink/75">Request title</span>
            <input
              className="ui-input w-full rounded-[1.25rem] px-4 py-3"
              disabled={isPending}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Extra bath towels"
              value={title}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ink/75">Category</span>
              <select
                className="ui-input w-full rounded-[1.25rem] px-4 py-3"
                disabled={isPending}
                onChange={(event) => setCategory(event.target.value as ServiceRequestCategory)}
                value={category}
              >
                {categoryDetails.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <p className="text-sm text-ink/55">{categoryDetails.find((item) => item.value === category)?.detail}</p>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ink/75">Priority</span>
              <select
                className="ui-input w-full rounded-[1.25rem] px-4 py-3"
                disabled={isPending}
                onChange={(event) => setPriority(event.target.value as ServiceRequestPriority)}
                value={priority}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-ink/75">Description</span>
            <textarea
              className="ui-input min-h-[120px] w-full rounded-[1.25rem] px-4 py-3"
              disabled={isPending}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add any room detail or timing that will help the hotel team respond faster."
              value={description}
            />
          </label>

          <button className="ui-button-primary disabled:opacity-60" disabled={isPending} type="submit">
            {isPending ? 'Sending request...' : 'Send request'}
          </button>
        </form>
      </article>

      <article className="rounded-[2rem] bg-white p-6 shadow-card">
        <div className="ui-panel-soft rounded-[1.5rem] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Stay alerts</p>
              <h4 className="mt-2 text-2xl font-semibold text-ink">Recent hotel notifications</h4>
            </div>
            <p className="text-sm text-ink/58">{stayAlerts.length} booking updates</p>
          </div>
          <div className="mt-4 space-y-3">
            {stayAlerts.length === 0 ? <div className="rounded-[1.25rem] border border-dashed border-ink/15 bg-white px-4 py-4 text-sm text-ink/60">No booking-wide alerts have been posted yet. Payment confirmations, request updates, and other stay changes will show here.</div> : null}
            {stayAlerts.map((entry) => {
              const copy = getGuestNotificationCopy(entry)

              return (
                <div key={entry.id} className={`rounded-[1.25rem] border px-4 py-4 ${getNotificationTone(entry.type)}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{copy.title}</p>
                      <p className="mt-1 text-sm opacity-80">{copy.detail}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] opacity-70">{entry.triggered_by || 'Hotel team'}</p>
                    </div>
                    <p className="text-sm opacity-70">{entry.created_at ? formatDateTime(entry.created_at) : 'Pending time'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Request tracking</p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Your service history</h3>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-ink/60">
            <span>{openRequests.length} open</span>
            <span>{closedRequests.length} closed</span>
          </div>
        </div>

        <div className="ui-panel-soft mt-6 rounded-[1.5rem] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Hotel updates</p>
              <h4 className="mt-2 text-2xl font-semibold text-ink">Latest request activity</h4>
            </div>
            <p className="text-sm text-ink/58">{recentHotelUpdates.length} staff updates visible</p>
          </div>
          <div className="mt-4 space-y-3">
            {recentHotelUpdates.length === 0 ? <div className="rounded-[1.25rem] border border-dashed border-ink/15 bg-white px-4 py-4 text-sm text-ink/60">No staff updates have been posted yet. New acknowledgements and completions will appear here automatically.</div> : null}
            {recentHotelUpdates.map((update) => {
              const copy = getGuestRequestEventCopy(update)

              return (
                <div key={update.id} className="rounded-[1.25rem] bg-white px-4 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{copy.title}</p>
                      <p className="mt-1 text-sm text-ink/58">{copy.detail}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-ink/45">{update.actor_name || 'Hotel team'}</p>
                    </div>
                    <p className="text-sm text-ink/50">{formatDateTime(update.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {requests.length === 0 ? <div className="ui-panel-muted rounded-[1.5rem] border-dashed px-4 py-5 text-sm text-ink/60">No guest service requests have been sent from this stay yet.</div> : null}
          {requests.map((request) => (
            <div key={request.id} className="ui-panel-soft rounded-[1.5rem] p-5">
              {(() => {
                const requestUpdates = (eventsByRequestId.get(request.id) ?? []).filter((update) => update.actor_role !== 'guest' || update.event_type !== 'created')
                const latestHotelUpdate = requestUpdates[0] ?? null

                return (
                  <>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-lg font-semibold text-ink">{request.title}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusStyles[request.status]}`}>{formatLabel(request.status)}</span>
                        </div>
                        <p className="mt-2 text-sm text-ink/60">{formatLabel(request.category)} · {formatLabel(request.priority)} priority · Sent {formatDateTime(request.created_at)}</p>
                      </div>
                      <p className="text-sm text-ink/50">Updated {formatDate(request.updated_at.split('T')[0])}</p>
                    </div>
                    {request.description ? <p className="mt-3 text-sm leading-6 text-ink/68">{request.description}</p> : null}
                    {latestHotelUpdate ? (
                      <div className="mt-3 rounded-[1.25rem] border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                        {(() => {
                          const copy = getGuestRequestEventCopy(latestHotelUpdate)

                          return (
                            <>
                              <p className="font-semibold text-ink/78">Latest hotel update</p>
                              <p className="mt-1 font-medium text-ink/80">{copy.title}</p>
                              <p className="mt-1 leading-6">{copy.detail}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/45">{latestHotelUpdate.actor_name || 'Hotel team'} · {formatDateTime(latestHotelUpdate.created_at)}</p>
                            </>
                          )
                        })()}
                      </div>
                    ) : null}
                    {request.resolution_note ? (
                      <div className="mt-3 rounded-[1.25rem] bg-white px-4 py-3 text-sm text-ink/65">
                        <p className="font-semibold text-ink/75">Hotel update</p>
                        <p className="mt-1 leading-6">{request.resolution_note}</p>
                      </div>
                    ) : null}
                    {requestUpdates.length > 1 ? (
                      <div className="mt-3 rounded-[1.25rem] border border-dashed border-ink/12 bg-white px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Request timeline</p>
                        <div className="mt-3 space-y-3">
                          {requestUpdates.slice(0, 3).map((update) => {
                            const copy = getGuestRequestEventCopy(update)

                            return (
                              <div key={update.id} className="flex flex-col gap-1 text-sm text-ink/62 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-medium text-ink/78">{copy.title}</p>
                                  <p className="mt-1 leading-6">{copy.detail}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink/45">{update.actor_name || 'Hotel team'}</p>
                                </div>
                                <p className="text-xs uppercase tracking-[0.14em] text-ink/42">{formatDateTime(update.created_at)}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}