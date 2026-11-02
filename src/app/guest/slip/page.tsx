import type { Metadata } from 'next'

import QRCode from 'qrcode'

import { PrintOnLoad } from '@/app/guest/slip/print-on-load'
import { buildHotelProfile, getHotelAddressLines, getHotelContactLines } from '@/lib/hotel-info'
import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'
import { loadGuestPortalContext, pickSingle } from '@/lib/guest-portal'
import { verifyGuestPortalToken } from '@/lib/guest-portal-token'
import { formatDate } from '@/lib/utils/format'

type GuestSlipSearchParams = {
  token?: string | string[]
}

type GuestSlipPageProps = {
  searchParams?: GuestSlipSearchParams | Promise<GuestSlipSearchParams>
}

export const metadata: Metadata = {
  title: 'Guest Portal Slip | University Hotel HMS',
  description: 'Printable guest portal handoff slip.'
}

export const dynamic = 'force-dynamic'

function getSingleParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }

  return value?.trim() ?? ''
}

export default async function GuestSlipPage({ searchParams }: GuestSlipPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const token = getSingleParam(resolvedSearchParams?.token)
  const tokenPayload = token ? verifyGuestPortalToken(token) : null

  const hotelProfile = hasAdminSupabaseCredentials()
    ? await (async () => {
        const supabase = createAdminSupabaseClient()
        const { data } = await supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle()
        return buildHotelProfile(data)
      })()
    : buildHotelProfile(null)

  if (!tokenPayload) {
    return (
      <main className="min-h-screen bg-[#f9fffc] px-6 py-10 text-ink">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 shadow-card">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Portal slip unavailable</h1>
          <p className="mt-4 text-sm leading-6 text-ink/65">This printable guest portal slip link is invalid or has expired. Ask reception to generate a fresh handoff.</p>
        </div>
      </main>
    )
  }

  const portalPath = `/guest?token=${encodeURIComponent(token)}`
  const { booking, credential } = await loadGuestPortalContext(tokenPayload.code, '', {
    bookingId: tokenPayload.bookingId,
    bypassProof: true
  })

  if (!booking || !credential) {
    return (
      <main className="min-h-screen bg-[#f9fffc] px-6 py-10 text-ink">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 shadow-card">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Stay not available</h1>
          <p className="mt-4 text-sm leading-6 text-ink/65">The guest stay linked to this portal slip could not be loaded. Ask reception to refresh the portal access link.</p>
        </div>
      </main>
    )
  }

  const room = pickSingle(booking.rooms)
  const qrCodeDataUrl = await QRCode.toDataURL(portalPath, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 8,
    width: 240
  })
  const addressLines = getHotelAddressLines(hotelProfile)
  const contactLines = getHotelContactLines(hotelProfile)

  return (
    <main className="min-h-screen bg-[#f4efe6] px-6 py-10 text-ink print:bg-white print:px-0 print:py-0">
      <PrintOnLoad />
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-[#d9d1c6] bg-white p-8 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-10 print:shadow-none">
        <div className="flex flex-col gap-6 border-b border-ink/10 pb-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            {hotelProfile.logoUrl ? (
              <div className="relative hidden h-20 w-20 overflow-hidden rounded-[1.25rem] border border-ink/10 bg-white md:block print:block">
                <img alt={`${hotelProfile.name} logo`} className="h-full w-full object-contain p-2" src={hotelProfile.logoUrl} />
              </div>
            ) : null}

            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-ink/45">Guest portal handoff</p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl text-ink">{hotelProfile.name}</h1>
              <div className="mt-4 space-y-1 text-sm text-ink/60">
                {addressLines.map((line) => <p key={line}>{line}</p>)}
                {contactLines.map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
          </div>
          <div className="ui-panel-soft rounded-[1.5rem] px-5 py-4 text-sm text-ink/65">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Access validity</p>
            <p className="mt-2 text-lg font-semibold text-ink">{credential.valid_until ? formatDate(credential.valid_until) : 'Front desk update pending'}</p>
            <p className="mt-1">Issued to {credential.issued_to || booking.guest_name}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[1.05fr_0.95fr]">
          <section>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest</p>
            <h2 className="mt-2 text-4xl font-semibold text-ink">{booking.guest_name}</h2>
            <p className="mt-3 text-sm text-ink/62">Room {room?.number ?? 'Unassigned'} · {room?.type ?? 'Room'} · Stay portal access</p>

            <div className="ui-panel-soft mt-6 space-y-4 rounded-[1.5rem] p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Room access code</p>
                <p className="mt-2 text-3xl font-semibold tracking-[0.16em] text-ink">{credential.credential_code || tokenPayload.code}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Open manually</p>
                <p className="mt-2 text-sm leading-6 text-ink/65">Go to the guest portal and enter your full name as recorded at reception, the last part of your name, or the last 4 digits of your booking phone number.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">What you can do</p>
                <ul className="mt-2 space-y-2 text-sm text-ink/65">
                  <li>View stay balance and payments</li>
                  <li>Track extra charges and receipts</li>
                  <li>Submit requests and see hotel updates</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="ui-panel-soft rounded-[1.75rem] p-6 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Scan to open portal</p>
            <img alt="Guest portal QR code" className="mx-auto mt-4 w-[240px] rounded-[1.25rem] bg-white p-3" src={qrCodeDataUrl} />
            <p className="mt-4 text-sm leading-6 text-ink/65">This QR code opens the one-tap guest portal for this active stay.</p>
            <p className="mt-3 break-all text-xs text-ink/45">{portalPath}</p>
          </section>
        </div>

        <div className="ui-panel-soft mt-8 rounded-[1.5rem] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Need help?</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">Contact reception directly</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
                If the portal link does not open, the access code fails, or you need help with charges or requests, contact the front desk and mention this stay portal handoff.
              </p>
            </div>
            <div className="text-sm text-ink/68">
              <div className="space-y-1">
                {contactLines.length > 0 ? contactLines.map((line) => <p key={line}>{line}</p>) : <p>Front desk support is available on request.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}