'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']

type AttendanceClientProps = {
  dashboardHref: string | null
  role: string | null
  shifts: ShiftRow[]
  staff: StaffRow | null
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not recorded'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatShiftDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) {
    return 'Duration unavailable'
  }

  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

export function AttendanceClient({ dashboardHref, role, shifts, staff }: AttendanceClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const latestShift = shifts[0] ?? null

  function handleAttendance(action: 'start_shift' | 'end_shift') {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/staff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })

      const payload = (await response.json()) as { error?: string; message?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Attendance update failed.')
        return
      }

      setSuccessMessage(payload.message ?? 'Attendance updated.')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-white md:px-10" data-smoke-id="reception-attendance">
      <span className="sr-only">smoke:reception-attendance</span>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Attendance Desk</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Attendance</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/78">
              Start and end your shift from this page. The attendance action is tied to the signed-in staff account and updates the live staffing board instantly.
            </p>
          </div>
          {dashboardHref ? (
            <div className="flex flex-wrap gap-3">
              <Link className="rounded-full border border-white/18 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10" href={dashboardHref}>
                Return to {role === 'admin' ? 'Admin Tower' : 'Reception Desk'}
              </Link>
            </div>
          ) : null}
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        {!staff ? (
          <section className="rounded-[2rem] border border-white/35 bg-white/85 p-8 text-ink shadow-card backdrop-blur">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Staff link required</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl">This login is not attached to a staff profile yet.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/70">
              An admin needs to create or update your staff record so this account is linked before self check-in can work. Once linked, this page will let you clock in and out without using the admin board.
            </p>
          </section>
        ) : staff.active === false ? (
          <section className="rounded-[2rem] border border-white/35 bg-white/85 p-8 text-ink shadow-card backdrop-blur">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Inactive profile</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl">This staff profile has been archived.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/70">Attendance is locked until the hotel manager reactivates the account.</p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[1.75rem] border border-white/35 bg-white/85 p-5 text-ink shadow-card backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Staff profile</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{staff.name}</p>
              </article>
              <article className="rounded-[1.75rem] border border-white/35 bg-white/85 p-5 text-ink shadow-card backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Role</p>
                <p className="mt-3 text-3xl font-semibold capitalize text-ink">{staff.role}</p>
              </article>
              <article className="rounded-[1.75rem] border border-white/35 bg-white/85 p-5 text-ink shadow-card backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Daily rate</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(staff.daily_rate_ghs)}</p>
              </article>
              <article className="rounded-[1.75rem] border border-white/35 bg-white/85 p-5 text-ink shadow-card backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Current status</p>
                <p className={`mt-3 text-3xl font-semibold ${staff.on_shift ? 'text-green-700' : 'text-amber-700'}`}>{staff.on_shift ? 'On shift' : 'Off shift'}</p>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <article className="rounded-[2rem] border border-white/35 bg-white/88 p-8 text-ink shadow-card backdrop-blur">
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Shift action</p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl">
                  {staff.on_shift ? 'End this shift when you leave.' : 'Start your shift when you arrive.'}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/70">
                  The button updates your own attendance record only. Admin can still monitor the live board, but they do not need to mark you in manually anymore.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  <button
                    className="rounded-full bg-pine px-6 py-3 text-sm font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending || staff.on_shift}
                    onClick={() => handleAttendance('start_shift')}
                    type="button"
                  >
                    Start shift
                  </button>
                  <button
                    className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white transition hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending || !staff.on_shift}
                    onClick={() => handleAttendance('end_shift')}
                    type="button"
                  >
                    End shift
                  </button>
                </div>

                <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-[#f5efe6] p-5">
                    <dt className="text-xs uppercase tracking-[0.24em] text-ink/45">Latest shift started</dt>
                    <dd className="mt-3 text-lg font-semibold text-ink">{formatDateTime(latestShift?.started_at ?? null)}</dd>
                  </div>
                  <div className="rounded-3xl bg-[#f5efe6] p-5">
                    <dt className="text-xs uppercase tracking-[0.24em] text-ink/45">Latest shift duration</dt>
                    <dd className="mt-3 text-lg font-semibold text-ink">{latestShift ? formatShiftDuration(latestShift.started_at, latestShift.ended_at) : 'No shifts yet'}</dd>
                  </div>
                </dl>
              </article>

              <article className="rounded-[2rem] border border-white/35 bg-white/88 p-8 text-ink shadow-card backdrop-blur">
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Recent history</p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl">Latest shifts</h2>
                <div className="mt-6 space-y-4">
                  {shifts.length === 0 ? (
                    <div className="rounded-3xl bg-[#f5efe6] p-5 text-sm text-ink/70">No shift activity has been recorded for this staff account yet.</div>
                  ) : (
                    shifts.map((shift) => (
                      <div key={shift.id} className="rounded-3xl bg-[#f5efe6] p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-ink">Started {formatDateTime(shift.started_at)}</p>
                            <p className="mt-2 text-sm text-ink/65">
                              {shift.ended_at ? `Ended ${formatDateTime(shift.ended_at)}` : 'Currently open'}
                            </p>
                          </div>
                          <span className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${shift.ended_at ? 'bg-white text-ink/75' : 'bg-green-100 text-green-800'}`}>
                            {shift.ended_at ? 'Closed' : 'Open'}
                          </span>
                        </div>
                        <p className="mt-4 text-sm text-ink/65">Duration: {formatShiftDuration(shift.started_at, shift.ended_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  )
}