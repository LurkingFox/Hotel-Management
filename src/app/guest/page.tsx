import type { Metadata } from 'next'

import { GuestPortalClient } from '@/app/guest/guest-portal-client'
import { buildHotelProfile, getHotelContactLines } from '@/lib/hotel-info'
import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'
import { getOutstandingBalance, getSingleParam, loadGuestPortalContext, pickSingle } from '@/lib/guest-portal'
import { verifyGuestPortalToken } from '@/lib/guest-portal-token'
import { formatDate, formatGHS } from '@/lib/utils/format'

type GuestPortalSearchParams = {
  code?: string | string[]
  proof?: string | string[]
  token?: string | string[]
}

type GuestPortalPageProps = {
  searchParams?: GuestPortalSearchParams | Promise<GuestPortalSearchParams>
}

export const metadata: Metadata = {
  title: 'Guest Portal | University Hotel HMS',
  description: 'Guest stay details, access validity, and outstanding balance for University Hotel.'
}

export const dynamic = 'force-dynamic'

function formatLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Pending timestamp'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  })
}

export default async function GuestPortalPage({ searchParams }: GuestPortalPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const accessCode = getSingleParam(resolvedSearchParams?.code)
  const proof = getSingleParam(resolvedSearchParams?.proof)
  const token = getSingleParam(resolvedSearchParams?.token)
  const tokenPayload = token ? verifyGuestPortalToken(token) : null
  const lookupCode = tokenPayload?.code ?? accessCode

  const hotelProfile = hasAdminSupabaseCredentials()
    ? await (async () => {
        const supabase = createAdminSupabaseClient()
        const { data } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()
        return buildHotelProfile(data)
      })()
    : buildHotelProfile(null)

  const contactLines = getHotelContactLines(hotelProfile)
  const { booking, credential, error, notifications, payments, requestEvents, requests, serviceCharges } = await loadGuestPortalContext(
    lookupCode,
    proof,
    tokenPayload
      ? {
          bookingId: tokenPayload.bookingId,
          bypassProof: true
        }
      : undefined
  )
  const room = pickSingle(booking?.rooms)
  const guestProfile = pickSingle(booking?.guest_profiles)
  const outstandingBalance = booking ? getOutstandingBalance(booking) : 0
  const extraChargesTotal = serviceCharges.reduce((sum, charge) => sum + charge.amount_ghs, 0)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(123,200,164,0.18),_transparent_32%),linear-gradient(180deg,_#0f3d2e_0%,_#1f6b52_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-8 text-ink md:px-10 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/12 bg-white/8 p-6 text-white shadow-[0_24px_80px_rgba(10,20,28,0.22)] backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/62">Guest portal</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-none">{hotelProfile.name}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/74">
              Review your active stay, access validity, and outstanding balance without waiting at reception.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/10 px-5 py-4 text-sm text-white/78 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-white/58">Need help?</p>
            <div className="mt-2 space-y-1">
              {contactLines.length > 0 ? contactLines.map((line) => <p key={line}>{line}</p>) : <p>Front desk support is available on request.</p>}
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <article className="rounded-[2rem] bg-white p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Verify your stay</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Open your guest view</h2>
            <p className="mt-3 text-sm leading-6 text-ink/62">
              {tokenPayload
                ? 'Your stay link has already been verified. You can review your stay, balance, and requests directly.'
                : 'Use the access code issued for your room together with your full guest name, the last part of your name, or the last 4 digits of your booking phone number.'}
            </p>

            <form className="mt-8 space-y-4" method="get">
              {tokenPayload ? <input name="token" type="hidden" value={token} /> : null}
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink/75">Access code</span>
                <input
                  className="ui-input w-full rounded-[1.25rem] px-4 py-3 text-base uppercase"
                  defaultValue={lookupCode}
                  disabled={Boolean(tokenPayload)}
                  name="code"
                  placeholder="Enter your room access code"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink/75">Full name, last name, or phone ending</span>
                <input
                  className="ui-input w-full rounded-[1.25rem] px-4 py-3 text-base"
                  defaultValue={proof}
                  disabled={Boolean(tokenPayload)}
                  name="proof"
                  placeholder="Example: Ama Mensah, Mensah, or 4821"
                />
              </label>
              <button className="ui-button-primary" type="submit">
                {tokenPayload ? 'Refresh portal' : 'Open portal'}
              </button>
            </form>

            {token && !tokenPayload ? <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">This guest portal link is invalid or has expired. Please request a new link from reception.</div> : null}
            {error ? <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            <div className="ui-panel-muted mt-6 rounded-[1.5rem] border-dashed px-4 py-4 text-sm leading-6 text-ink/60">
              Payments are still settled at the front desk, but you can now also submit guest requests and track their status here. If your booking only has one combined name field on file, enter the full name exactly as reception recorded it.
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-6 shadow-card">
            {booking ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Current stay</p>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">{booking.guest_name}</h2>
                    <p className="mt-3 text-sm text-ink/62">
                      Room {room?.number ?? 'Unassigned'} · {room?.type ?? 'Room'} · {formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}
                    </p>
                    <p className="mt-2 text-sm text-ink/56">{guestProfile?.email || guestProfile?.phone || booking.guest_phone || 'Guest contact on file'}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-[#e6c2b8] bg-[#fff1ee] px-5 py-4 text-right">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#8d4335]">Outstanding balance</p>
                    <p className="mt-2 text-4xl font-semibold text-[#9f3527]">{formatGHS(outstandingBalance)}</p>
                    <p className="mt-2 text-sm text-[#8d4335]">Amount left to settle at reception</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Stay total</p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(booking.total_ghs)}</p>
                  </div>
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Paid so far</p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(booking.paid_ghs)}</p>
                  </div>
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Access valid until</p>
                    <p className="mt-3 text-2xl font-semibold text-ink">{credential?.valid_until ? formatDate(credential.valid_until) : 'Front desk update pending'}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recorded payments</p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{payments.length}</p>
                    <p className="mt-2 text-sm text-ink/60">Every payment already posted to this stay.</p>
                  </div>
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Extra service charges</p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(extraChargesTotal)}</p>
                    <p className="mt-2 text-sm text-ink/60">Laundry, food, minibar, and other extras recorded on the stay.</p>
                  </div>
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Charge items</p>
                    <p className="mt-3 text-3xl font-semibold text-ink">{serviceCharges.length}</p>
                    <p className="mt-2 text-sm text-ink/60">Visible here so guests can question or confirm extras earlier.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">What this balance means</p>
                    <p className="mt-3 text-sm leading-6 text-ink/65">
                      Your outstanding balance reflects the remaining amount on the current booking after all recorded payments. If you think something looks off, ask reception to review your stay ledger.
                    </p>
                  </div>
                  <div className="ui-panel-soft rounded-[1.5rem] p-5">
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Access record</p>
                    <div className="mt-3 space-y-2 text-sm text-ink/65">
                      <p>Provider: {credential?.provider ?? 'Unavailable'}</p>
                      <p>Status: {credential?.status ?? 'Unavailable'}</p>
                      <p>Issued to: {credential?.issued_to || booking.guest_name}</p>
                    </div>
                  </div>
                </div>

                <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
                  <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Bill detail</p>
                        <h3 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Payments received</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Total paid</p>
                        <p className="mt-1 text-2xl font-semibold text-ink">{formatGHS(booking.paid_ghs)}</p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-3">
                      {payments.length === 0 ? <div className="ui-panel-muted rounded-[1.5rem] border-dashed px-4 py-4 text-sm text-ink/60">No payments have been posted to this stay yet.</div> : null}
                      {payments.map((payment) => (
                        <div key={payment.id} className="ui-panel-soft rounded-[1.5rem] p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-lg font-semibold text-ink">{formatGHS(payment.amount_ghs)}</p>
                              <p className="mt-1 text-sm text-ink/60">{formatLabel(payment.method)} · {formatDateTime(payment.paid_at)}</p>
                            </div>
                            <p className="text-sm text-ink/55">{payment.reference || 'No reference recorded'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Extras</p>
                        <h3 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Service charges</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recorded extras</p>
                        <p className="mt-1 text-2xl font-semibold text-ink">{formatGHS(extraChargesTotal)}</p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-3">
                      {serviceCharges.length === 0 ? <div className="ui-panel-muted rounded-[1.5rem] border-dashed px-4 py-4 text-sm text-ink/60">No extra service charges are attached to this stay yet.</div> : null}
                      {serviceCharges.map((charge) => (
                        <div key={charge.id} className="ui-panel-soft rounded-[1.5rem] p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-lg font-semibold text-ink">{formatLabel(charge.type)} · {formatGHS(charge.amount_ghs)}</p>
                              <p className="mt-1 text-sm text-ink/60">Added {formatDateTime(charge.created_at)}</p>
                            </div>
                            <div className="text-right text-sm text-ink/55">
                              <p>{charge.payment_confirmed ? 'Receipt confirmed' : charge.resolved ? 'Awaiting receipt confirmation' : 'Open charge'}</p>
                              <p className="mt-1">{charge.resolved_at ? `Resolved ${formatDateTime(charge.resolved_at)}` : 'Still active in hotel workflow'}</p>
                            </div>
                          </div>
                          {charge.description ? <p className="mt-3 text-sm leading-6 text-ink/68">{charge.description}</p> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <GuestPortalClient accessCode={lookupCode} notifications={notifications} proof={proof} requestEvents={requestEvents} requests={requests} token={token ?? ''} />
              </div>
            ) : (
              <div className="ui-panel-muted flex min-h-[26rem] flex-col items-center justify-center rounded-[1.5rem] border-dashed px-6 text-center">
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Guest summary</p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-ink">Balance and stay details appear here</h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-ink/62">
                  Once your guest details are verified, this portal shows the remaining balance on your stay together with the amount already paid and your current access window.
                </p>
              </div>
            )}
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Support</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-ink">Need help with your stay?</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/62">
                For balance questions, access issues, or urgent room assistance, contact the hotel team directly. Reception can review your stay ledger, room access, and active requests.
              </p>
            </div>
            <div className="ui-panel-soft rounded-[1.5rem] px-5 py-4 text-sm text-ink/68">
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Contact the hotel</p>
              <div className="mt-3 space-y-1">
                {contactLines.length > 0 ? contactLines.map((line) => <p key={line}>{line}</p>) : <p>Front desk support is available on request.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}