'use client'

import Image from 'next/image'
import type { ChangeEvent } from 'react'
import { useState } from 'react'

import { getHotelAddressLines, getHotelContactLines, type HotelProfile } from '@/lib/hotel-info'
import type { SampleLogo } from '@/lib/sample-logos'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']

type SeamRoomMapping = {
  displayName: string
  externalDeviceId: string
  provider: string
  room: Pick<RoomRow, 'id' | 'number' | 'status' | 'type'>
  roomAccessDeviceId: string | null
  updatedAt: string | null
}

type HotelProfileSettingsClientProps = {
  initialMappings: SeamRoomMapping[]
  initialProfile: HotelProfile
  sampleLogos: SampleLogo[]
}

type SeamMappingsResponse = {
  error?: string
  mappings?: SeamRoomMapping[]
  message?: string
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Not saved yet'
  }

  return new Date(value).toLocaleString()
}

export function HotelProfileSettingsClient({ initialMappings, initialProfile, sampleLogos }: HotelProfileSettingsClientProps) {
  const [profile, setProfile] = useState(initialProfile)
  const [mappings, setMappings] = useState(initialMappings)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingMappings, setIsSavingMappings] = useState<Record<string, boolean>>({})
  const [isSyncingMappings, setIsSyncingMappings] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof HotelProfile>(key: K, value: HotelProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  function updateMapping(roomId: string, key: 'displayName' | 'externalDeviceId', value: string) {
    setMappings((current) =>
      current.map((mapping) => (mapping.room.id === roomId ? { ...mapping, [key]: value } : mapping))
    )
  }

  function applySampleLogo(sampleLogo: SampleLogo) {
    setProfile((current) => ({
      ...current,
      logoPath: `sample:${sampleLogo.id}`,
      logoUrl: sampleLogo.url
    }))
    setMessage(`Selected sample logo: ${sampleLogo.label}`)
    setError(null)
  }

  async function saveProfile() {
    setIsSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/hotel-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      })

      const payload = (await response.json()) as HotelProfile & { error?: string }

      if (!response.ok) {
        setError(payload.error ?? 'Could not save hotel profile.')
        return
      }

      setProfile(payload)
      setMessage('Hotel profile saved.')
    } finally {
      setIsSaving(false)
    }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsUploading(true)
    setMessage(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/hotel-profile/logo', {
        method: 'POST',
        body: formData
      })

      const payload = (await response.json()) as HotelProfile & { error?: string }

      if (!response.ok) {
        setError(payload.error ?? 'Could not upload logo.')
        return
      }

      setProfile(payload)
      setMessage('Hotel logo uploaded.')
      event.target.value = ''
    } finally {
      setIsUploading(false)
    }
  }

  async function saveMapping(roomId: string) {
    const mapping = mappings.find((entry) => entry.room.id === roomId)

    if (!mapping) {
      return
    }

    setIsSavingMappings((current) => ({ ...current, [roomId]: true }))
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/seam/room-access-devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: mapping.externalDeviceId,
          displayName: mapping.displayName,
          roomId
        })
      })

      const payload = (await response.json()) as SeamMappingsResponse

      if (!response.ok) {
        setError(payload.error ?? 'Could not save Seam room mapping.')
        return
      }

      setMappings(payload.mappings ?? initialMappings)
      setMessage(payload.message ?? `Saved Seam mapping for room ${mapping.room.number}.`)
    } finally {
      setIsSavingMappings((current) => ({ ...current, [roomId]: false }))
    }
  }

  async function syncMappingsFromEnv() {
    setIsSyncingMappings(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/seam/room-access-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_from_env' })
      })

      const payload = (await response.json()) as SeamMappingsResponse

      if (!response.ok) {
        setError(payload.error ?? 'Could not sync Seam room mappings from environment variables.')
        return
      }

      setMappings(payload.mappings ?? initialMappings)
      setMessage(payload.message ?? 'Seam room mappings synced from environment variables.')
    } finally {
      setIsSyncingMappings(false)
    }
  }

  const addressLines = getHotelAddressLines(profile)
  const contactLines = getHotelContactLines(profile)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-settings">
      <span className="sr-only">smoke:admin-settings</span>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-[2rem] border border-ink/10 bg-white/80 p-7 shadow-card backdrop-blur">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Settings lane</p>
              <h1 className="font-[family-name:var(--font-display)] text-5xl">Settings</h1>
              <p className="max-w-3xl text-sm leading-6 text-ink/70">
                Manage the official hotel name, address, contacts, website, and logo used across report exports and administrative documents.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Profile editor</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Branding and contact details</h2>
              </div>
              <div className="ui-pill px-4 py-2 text-sm font-semibold">Admin only</div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink/75">Hotel name</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('name', event.target.value)} value={profile.name} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Address line 1</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('addressLine1', event.target.value)} value={profile.addressLine1} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Address line 2</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('addressLine2', event.target.value)} value={profile.addressLine2} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">City</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('city', event.target.value)} value={profile.city} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Region</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('region', event.target.value)} value={profile.region} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Phone</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('phone', event.target.value)} value={profile.phone} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Email</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('email', event.target.value)} value={profile.email} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink/75">Website</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm text-ink" onChange={(event) => update('website', event.target.value)} value={profile.website} />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink/75">Hotel logo</span>
                <input accept="image/png,image/jpeg" className="ui-panel-muted mt-2 block w-full rounded-2xl border-dashed px-4 py-3 text-sm text-ink" disabled={isUploading} onChange={uploadLogo} type="file" />
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">PNG or JPEG only, max 2 MB</p>
              </label>
              <div className="md:col-span-2">
                <span className="text-sm font-semibold text-ink/75">Sample logos for testing</span>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sampleLogos.map((sampleLogo) => {
                    const selected = profile.logoPath === `sample:${sampleLogo.id}` || profile.logoUrl === sampleLogo.url

                    return (
                      <button
                        key={sampleLogo.id}
                        className={`rounded-[1.5rem] border p-3 text-left transition ${selected ? 'border-ink bg-surface-raised' : 'border-ink/10 bg-surface-soft hover:border-ink/25 hover:bg-white'}`}
                        onClick={() => applySampleLogo(sampleLogo)}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-ink/10 bg-white">
                            <Image alt={sampleLogo.label} className="object-contain p-2" fill sizes="64px" src={sampleLogo.url} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-ink">{sampleLogo.label}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">Click to use in reports</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isUploading} onClick={saveProfile} type="button">
                {isSaving ? 'Saving profile...' : 'Save hotel profile'}
              </button>
              {message ? <p className="text-sm text-green-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-ink p-6 text-white shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Live branding preview</p>
            {profile.logoUrl ? (
              <div className="relative mt-4 h-24 w-24 overflow-hidden rounded-3xl border border-white/10 bg-white/95">
                <Image alt={`${profile.name} logo`} className="object-contain p-3" fill sizes="96px" src={profile.logoUrl} />
              </div>
            ) : null}
            <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl">{profile.name}</h2>
            <div className="mt-6 space-y-2 text-sm leading-6 text-white/78">
              {addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {contactLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/74">
              These details feed the report headers and print exports. The logo is stored in Supabase Storage so it can be replaced from the admin UI without redeploying the app.
            </div>
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Seam device bindings</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Room-to-device mapping</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/70">
                Persist which Seam device controls each room. You can edit mappings directly here or push the current environment mapping into Supabase so operations stop depending on redeploy-time JSON alone.
              </p>
            </div>
            <button
              className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSyncingMappings}
              onClick={syncMappingsFromEnv}
              type="button"
            >
              {isSyncingMappings ? 'Syncing env mappings...' : 'Sync env mappings to Supabase'}
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {mappings.map((mapping) => (
              <article key={mapping.room.id} className="ui-panel-soft rounded-[1.5rem] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-ink">Room {mapping.room.number}</p>
                    <p className="mt-1 text-sm text-ink/65">
                      {mapping.room.type} · {mapping.room.status} · Last saved {formatUpdatedAt(mapping.updatedAt)}
                    </p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-ink/45">Provider: Seam</div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink/75">Seam device ID</span>
                    <input
                      className="ui-input w-full rounded-2xl px-4 py-3 text-sm text-ink"
                      onChange={(event) => updateMapping(mapping.room.id, 'externalDeviceId', event.target.value)}
                      placeholder="device_abc123"
                      value={mapping.externalDeviceId}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink/75">Display name</span>
                    <input
                      className="ui-input w-full rounded-2xl px-4 py-3 text-sm text-ink"
                      onChange={(event) => updateMapping(mapping.room.id, 'displayName', event.target.value)}
                      placeholder={`Room ${mapping.room.number}`}
                      value={mapping.displayName}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      className="ui-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSavingMappings[mapping.room.id] || !mapping.externalDeviceId.trim()}
                      onClick={() => saveMapping(mapping.room.id)}
                      type="button"
                    >
                      {isSavingMappings[mapping.room.id] ? 'Saving...' : 'Save mapping'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}