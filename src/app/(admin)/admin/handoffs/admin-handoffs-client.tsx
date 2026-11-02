'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatDate } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type OperationalHandoffRow = Database['public']['Tables']['operational_handoffs']['Row']
type OperationalHandoffItemRow = Database['public']['Tables']['operational_handoff_items']['Row']

type HandoffItemWithRelations = OperationalHandoffItemRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  service_requests: Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'> | Array<Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'>> | null
}

type HandoffWithItems = OperationalHandoffRow & {
  operational_handoff_items: HandoffItemWithRelations[] | null
}

type AdminHandoffsClientProps = {
  handoffs: HandoffWithItems[]
  unresolvedCount: number
}

function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

export function AdminHandoffsClient({ handoffs, unresolvedCount }: AdminHandoffsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const openHandoffs = useMemo(() => handoffs.filter((handoff) => handoff.status !== 'closed'), [handoffs])

  function runAction(body: Record<string, unknown>, successText: string) {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/handoffs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Handoff update failed.')
        return
      }

      setSuccessMessage(successText)
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Team lane</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Carryover handoffs</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">A structured queue of unresolved shift work, accountability notes, and carryover risks from reception.</p>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open handoffs</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{openHandoffs.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unresolved items</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{unresolvedCount}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recently acknowledged</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{handoffs.filter((handoff) => handoff.status === 'acknowledged').length}</p>
          </article>
        </section>

        <section className="grid gap-5">
          {openHandoffs.length === 0 ? <div className="rounded-[2rem] bg-white p-7 text-sm text-ink/70 shadow-card">No open handoffs are waiting.</div> : null}
          {openHandoffs.map((handoff) => {
            const unresolvedItems = (handoff.operational_handoff_items ?? []).filter((item) => !item.resolved)
            const resolvedItems = (handoff.operational_handoff_items ?? []).filter((item) => item.resolved)

            return (
              <article key={handoff.id} className="rounded-[2rem] bg-white p-7 shadow-card">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-3xl font-semibold text-ink">{handoff.summary || 'Reception handoff'}</h2>
                      <span className="ui-pill px-3 py-1 text-xs font-semibold uppercase">{formatLabel(handoff.status)}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink/60">Created by {handoff.created_by_name} ({handoff.created_by_role || 'staff'}) on {formatDate(handoff.created_at.split('T')[0])}</p>
                    {handoff.acknowledged_by ? <p className="mt-1 text-sm text-ink/55">Acknowledged by {handoff.acknowledged_by}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {handoff.status === 'open' ? <button className="ui-button-primary disabled:opacity-60" disabled={isPending} onClick={() => runAction({ action: 'acknowledge_handoff', handoffId: handoff.id }, 'Handoff acknowledged.')} type="button">Acknowledge</button> : null}
                    <button className="ui-button-secondary disabled:opacity-60" disabled={isPending || unresolvedItems.length > 0} onClick={() => runAction({ action: 'close_handoff', handoffId: handoff.id }, 'Handoff closed.')} type="button">Close handoff</button>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Unresolved items</p>
                    <div className="mt-4 space-y-3">
                      {unresolvedItems.length === 0 ? <div className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/60">No unresolved items remain.</div> : null}
                      {unresolvedItems.map((item) => {
                        const booking = pickSingle(item.bookings)
                        const room = pickSingle(item.rooms)
                        const request = pickSingle(item.service_requests)
                        return (
                          <div key={item.id} className="ui-panel-soft rounded-2xl p-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="font-semibold text-ink">{item.title}</p>
                              <span className="rounded-full bg-[#fff1ee] px-3 py-1 text-xs font-semibold uppercase text-[#9f3527]">{formatLabel(item.priority)}</span>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-ink/75">{formatLabel(item.item_type)}</span>
                            </div>
                            <p className="mt-2 text-sm text-ink/60">{item.detail || 'No additional detail provided.'}</p>
                            <p className="mt-2 text-sm text-ink/55">{booking?.guest_name ?? request?.title ?? 'No linked record'} · {room ? `Room ${room.number}` : 'No room linked'}</p>
                            <button className="ui-button-primary mt-3 px-4 py-2 text-sm disabled:opacity-60" disabled={isPending} onClick={() => runAction({ action: 'resolve_item', itemId: item.id }, 'Handoff item resolved.')} type="button">Mark resolved</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Resolved items</p>
                    <div className="mt-4 space-y-3">
                      {resolvedItems.length === 0 ? <div className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/60">Nothing has been resolved on this handoff yet.</div> : null}
                      {resolvedItems.map((item) => (
                        <div key={item.id} className="ui-panel-soft rounded-2xl p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="font-semibold text-ink">{item.title}</p>
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase text-green-800">Resolved</span>
                          </div>
                          <p className="mt-2 text-sm text-ink/55">Closed by {item.resolved_by || 'system'}</p>
                          <button className="ui-button-secondary mt-3 px-4 py-2 text-sm disabled:opacity-60" disabled={isPending} onClick={() => runAction({ action: 'reopen_item', itemId: item.id }, 'Handoff item reopened.')} type="button">Reopen</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}