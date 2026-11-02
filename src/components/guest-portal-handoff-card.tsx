'use client'

import Link from 'next/link'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { formatDate } from '@/lib/utils/format'

type GuestPortalHandoffCardProps = {
  guestName: string
  portalHref: string
  roomLabel: string
  validUntil: string | null
}

export function GuestPortalHandoffCard({ guestName, portalHref, roomLabel, validUntil }: GuestPortalHandoffCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const slipHref = (() => {
    const [, query = ''] = portalHref.split('?')
    const params = new URLSearchParams(query)
    const token = params.get('token')

    return token ? `/guest/slip?token=${encodeURIComponent(token)}` : null
  })()

  useEffect(() => {
    let ignore = false

    QRCode.toDataURL(portalHref, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
      width: 220
    })
      .then((value) => {
        if (!ignore) {
          setQrDataUrl(value)
        }
      })
      .catch(() => {
        if (!ignore) {
          setQrDataUrl(null)
        }
      })

    return () => {
      ignore = true
    }
  }, [portalHref])

  return (
    <div className="ui-panel rounded-2xl p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink/75">QR handoff</p>
          <p className="mt-1 text-sm text-ink/60">Let the guest scan the portal directly instead of typing the link.</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">{roomLabel} · {validUntil ? `valid until ${formatDate(validUntil)}` : 'validity pending'}</p>
        </div>
        {slipHref ? (
          <Link className="ui-button-secondary px-4 py-2 text-sm" href={slipHref} rel="noreferrer" target="_blank">
            Print portal slip
          </Link>
        ) : (
          <span className="ui-pill px-4 py-2 text-sm text-ink/55">Slip unavailable</span>
        )}
      </div>
      <div className="ui-panel-soft mt-4 flex justify-center rounded-[1.5rem] p-4">
        {qrDataUrl ? <img alt="Guest portal QR code" className="h-[220px] w-[220px] rounded-xl bg-white p-2" src={qrDataUrl} /> : <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-white text-sm text-ink/55">Generating QR...</div>}
      </div>
    </div>
  )
}