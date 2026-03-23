'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Database } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils/format'

type GuestProfileRow = Database['public']['Tables']['guest_profiles']['Row']
type GuestDocumentRow = Database['public']['Tables']['guest_identity_documents']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type GuestKycStatus = Database['public']['Enums']['guest_kyc_status']
type IdentityDocumentStatus = Database['public']['Enums']['identity_document_status']
type IdentityDocumentType = Database['public']['Enums']['identity_document_type']

type ProfileBooking = Pick<BookingRow, 'id' | 'guest_name' | 'guest_phone' | 'guest_profile_id' | 'check_in' | 'check_out_expected' | 'status'> & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

export type GuestProfileWithRelations = GuestProfileRow & {
  bookings: ProfileBooking[] | null
  guest_identity_documents: GuestDocumentRow[] | null
}

type UnlinkedBooking = Pick<BookingRow, 'id' | 'guest_name' | 'guest_phone' | 'check_in' | 'check_out_expected' | 'status'> & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

type GuestProfilesWorkbenchProps = {
  mode: 'admin' | 'reception'
  profiles: GuestProfileWithRelations[]
  unlinkedBookings?: UnlinkedBooking[]
}

type ProfileMutationResponse = {
  error?: string
  message?: string
  profile?: GuestProfileWithRelations
}

const kycTone: Record<GuestKycStatus, string> = {
  not_started: 'bg-stone-100 text-stone-700 border-stone-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  verified: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200'
}

const documentStatusTone: Record<IdentityDocumentStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  verified: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  expired: 'bg-slate-100 text-slate-700 border-slate-200'
}

const kycStatuses: GuestKycStatus[] = ['not_started', 'pending', 'verified', 'rejected']
const documentTypes: IdentityDocumentType[] = ['ghana_card', 'passport', 'drivers_license', 'voter_id', 'other']
const documentStatuses: IdentityDocumentStatus[] = ['pending', 'verified', 'rejected', 'expired']

function getRoomLabel(room: ProfileBooking['rooms'] | UnlinkedBooking['rooms']) {
  const roomValue = Array.isArray(room) ? room[0] : room
  return roomValue ? `Room ${roomValue.number}` : 'Room not assigned'
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function ProfileEditor({
  mode,
  onMessage,
  onRefresh,
  profile,
  unlinkedBookings
}: {
  mode: 'admin' | 'reception'
  onMessage: (message: { error?: string; success?: string }) => void
  onRefresh: () => void
  profile: GuestProfileWithRelations | null
  unlinkedBookings: UnlinkedBooking[]
}) {
  const [isPending, startTransition] = useTransition()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [nationality, setNationality] = useState(profile?.nationality ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth ?? '')
  const [kycStatus, setKycStatus] = useState<GuestKycStatus>(profile?.kyc_status ?? 'not_started')
  const [kycNotes, setKycNotes] = useState(profile?.kyc_notes ?? '')
  const latestDocument = profile?.guest_identity_documents?.[0] ?? null
  const [documentId] = useState(latestDocument?.id ?? '')
  const [documentType, setDocumentType] = useState<IdentityDocumentType>(latestDocument?.document_type ?? 'ghana_card')
  const [documentNumber, setDocumentNumber] = useState(latestDocument?.document_number ?? '')
  const [issuingCountry, setIssuingCountry] = useState(latestDocument?.issuing_country ?? '')
  const [issuedOn, setIssuedOn] = useState(latestDocument?.issued_on ?? '')
  const [expiresOn, setExpiresOn] = useState(latestDocument?.expires_on ?? '')
  const [documentStatus, setDocumentStatus] = useState<IdentityDocumentStatus>(latestDocument?.status ?? 'pending')
  const [verificationNotes, setVerificationNotes] = useState(latestDocument?.verification_notes ?? '')
  const availableKycStatuses = mode === 'admin' ? kycStatuses : Array.from(new Set<GuestKycStatus>([profile?.kyc_status ?? 'not_started', 'not_started', 'pending']))
  const availableDocumentStatuses = mode === 'admin' ? documentStatuses : Array.from(new Set<IdentityDocumentStatus>([latestDocument?.status ?? 'pending', 'pending']))

  function saveProfile() {
    const effectiveKycStatus = mode === 'admin' ? kycStatus : documentNumber.trim() ? 'pending' : 'not_started'
    const effectiveDocumentStatus = mode === 'admin' ? documentStatus : 'pending'

    startTransition(async () => {
      const method = profile ? 'PATCH' : 'POST'
      const response = await fetch('/api/guest-profiles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          dateOfBirth,
          document: documentNumber.trim()
            ? {
                documentNumber,
                documentType,
                expiresOn: expiresOn || null,
                id: documentId || undefined,
                issuedOn: issuedOn || null,
                issuingCountry,
                status: effectiveDocumentStatus,
                verificationNotes
              }
            : undefined,
          email,
          fullName,
          kycNotes,
          kycStatus: effectiveKycStatus,
          nationality,
          phone,
          profileId: profile?.id
        })
      })

      const payload = (await response.json()) as ProfileMutationResponse

      if (!response.ok) {
        onMessage({ error: payload.error ?? 'Guest profile save failed.' })
        return
      }

      onMessage({ success: payload.message ?? `Guest profile ${profile ? 'updated' : 'created'}.` })
      onRefresh()
    })
  }

  function linkBooking(bookingId: string) {
    if (!profile) {
      onMessage({ error: 'Select or save a guest profile before linking a booking.' })
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/guest-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link_booking', bookingId, profileId: profile.id })
      })

      const payload = (await response.json()) as ProfileMutationResponse

      if (!response.ok) {
        onMessage({ error: payload.error ?? 'Booking link failed.' })
        return
      }

      onMessage({ success: payload.message ?? 'Booking linked.' })
      onRefresh()
    })
  }

  return (
    <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-ink/45">{mode === 'admin' ? 'Guest intelligence' : 'Reception capture'}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
            {profile ? profile.full_name : 'New guest profile'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
            {mode === 'admin'
              ? 'Track KYC readiness, recent stays, and document state before guest self-service launches.'
              : 'Capture the identity record behind each stay so front desk work stops depending on free-text guest names.'}
          </p>
        </div>
        <button
          className="ui-button-primary disabled:cursor-not-allowed disabled:bg-ink/50"
          disabled={isPending}
          onClick={saveProfile}
          type="button"
        >
          {isPending ? 'Saving...' : profile ? 'Save profile' : 'Create profile'}
        </button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">Full name</span>
          <input className="ui-input" onChange={(event) => setFullName(event.target.value)} value={fullName} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">Phone</span>
          <input className="ui-input" onChange={(event) => setPhone(event.target.value)} value={phone} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">Email</span>
          <input className="ui-input" onChange={(event) => setEmail(event.target.value)} value={email} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">Nationality</span>
          <input className="ui-input" onChange={(event) => setNationality(event.target.value)} value={nationality} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">City</span>
          <input className="ui-input" onChange={(event) => setCity(event.target.value)} value={city} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">Date of birth</span>
          <input className="ui-input" onChange={(event) => setDateOfBirth(event.target.value)} type="date" value={dateOfBirth} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink/75">KYC status</span>
          <select className="ui-input" onChange={(event) => setKycStatus(event.target.value as GuestKycStatus)} value={kycStatus}>
            {availableKycStatuses.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-ink/75">KYC notes</span>
          <textarea className="ui-input min-h-28" onChange={(event) => setKycNotes(event.target.value)} value={kycNotes} />
        </label>
      </div>

      <section className="ui-panel-soft mt-8 border border-ink/10 p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Identity document</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">Primary verification record</h3>
          </div>
          {latestDocument ? (
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${documentStatusTone[latestDocument.status]}`}>
              {formatLabel(latestDocument.status)}
            </span>
          ) : null}
        </div>
        {mode === 'reception' ? (
          <p className="mt-3 text-sm leading-6 text-ink/60">Reception captures the document record here. Manager approval now decides the final verification outcome.</p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Document type</span>
            <select className="ui-input" onChange={(event) => setDocumentType(event.target.value as IdentityDocumentType)} value={documentType}>
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Document number</span>
            <input className="ui-input" onChange={(event) => setDocumentNumber(event.target.value)} value={documentNumber} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Issuing country</span>
            <input className="ui-input" onChange={(event) => setIssuingCountry(event.target.value)} value={issuingCountry} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Issued on</span>
            <input className="ui-input" onChange={(event) => setIssuedOn(event.target.value)} type="date" value={issuedOn} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Expires on</span>
            <input className="ui-input" onChange={(event) => setExpiresOn(event.target.value)} type="date" value={expiresOn} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink/75">Document status</span>
            <select className="ui-input" onChange={(event) => setDocumentStatus(event.target.value as IdentityDocumentStatus)} value={documentStatus}>
              {availableDocumentStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2 xl:col-span-3">
            <span className="text-sm font-semibold text-ink/75">Verification notes</span>
            <textarea className="ui-input min-h-24" onChange={(event) => setVerificationNotes(event.target.value)} value={verificationNotes} />
          </label>
        </div>

        {profile?.guest_identity_documents?.length ? (
          <div className="mt-5 grid gap-3">
            {profile.guest_identity_documents.map((document) => (
              <div key={document.id} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/70">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-ink">{formatLabel(document.document_type)}</span>
                  <span>{document.document_number}</span>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${documentStatusTone[document.status]}`}>
                    {formatLabel(document.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {profile ? (
        <section className="mt-8 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="ui-panel-soft border border-ink/10 p-5">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Linked stays</p>
            <div className="mt-4 grid gap-3">
              {(profile.bookings ?? []).length ? (
                profile.bookings?.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/72">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{getRoomLabel(booking.rooms)}</p>
                        <p className="mt-1">{formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${kycTone[profile.kyc_status]}`}>
                        {formatLabel(booking.status)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink/55">No bookings linked yet.</p>
              )}
            </div>
          </div>

          <div className="ui-panel-soft border border-ink/10 p-5">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Manual booking attachment</p>
            <div className="mt-4 grid gap-3">
              {unlinkedBookings.length ? (
                unlinkedBookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/72">
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="font-semibold text-ink">{booking.guest_name}</p>
                        <p className="mt-1">{getRoomLabel(booking.rooms)} · {formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}</p>
                      </div>
                      <button className="ui-button-soft px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending} onClick={() => linkBooking(booking.id)} type="button">
                        Link this booking
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink/55">No unlinked bookings detected.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </article>
  )
}

export function GuestProfilesWorkbench({ mode, profiles, unlinkedBookings = [] }: GuestProfilesWorkbenchProps) {
  const router = useRouter()
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(profiles[0]?.id ?? null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | GuestKycStatus>('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      const matchesStatus = statusFilter === 'all' || profile.kyc_status === statusFilter
      const haystack = `${profile.full_name} ${profile.phone ?? ''} ${profile.email ?? ''}`.toLowerCase()
      const matchesSearch = searchTerm.trim().length === 0 || haystack.includes(searchTerm.trim().toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [profiles, searchTerm, statusFilter])

  const selectedProfile = filteredProfiles.find((profile) => profile.id === selectedProfileId) ?? filteredProfiles[0] ?? null

  const summary = useMemo(
    () => ({
      total: profiles.length,
      verified: profiles.filter((profile) => profile.kyc_status === 'verified').length,
      pending: profiles.filter((profile) => profile.kyc_status === 'pending').length,
      needsAttention: profiles.filter((profile) => profile.kyc_status === 'not_started' || profile.kyc_status === 'rejected').length
    }),
    [profiles]
  )

  function handleMessage(message: { error?: string; success?: string }) {
    setErrorMessage(message.error ?? null)
    setSuccessMessage(message.success ?? null)
  }

  function handleRefresh() {
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/65">{mode === 'admin' ? 'Manager command' : 'Reception guest desk'}</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">
              {mode === 'admin' ? 'Guest identity and KYC board' : 'Guest profiles and document capture'}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
              {mode === 'admin'
                ? 'This is the identity layer behind bookings, approvals, and the future guest portal.'
                : 'Reception can now keep stable guest records, update contact details, and attach verification documents without relying on booking notes.'}
            </p>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest profiles</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.total}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Verified KYC</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.verified}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Pending review</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.pending}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Needs capture</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.needsAttention}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Profile queue</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Find and review guests</h2>
              </div>
              <button className="ui-button-soft px-4 py-2" onClick={() => setSelectedProfileId(null)} type="button">
                New profile
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
              <input className="ui-input" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by guest, phone, or email" value={searchTerm} />
              <select className="ui-input" onChange={(event) => setStatusFilter(event.target.value as 'all' | GuestKycStatus)} value={statusFilter}>
                <option value="all">All KYC states</option>
                {kycStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid gap-3">
              {filteredProfiles.length ? (
                filteredProfiles.map((profile) => (
                  <button key={profile.id} className={`rounded-[1.5rem] border p-4 text-left transition ${selectedProfile?.id === profile.id ? 'border-ink bg-surface-sunken' : 'border-ink/10 bg-white hover:border-ink/25 hover:bg-surface-sunken/60'}`} onClick={() => setSelectedProfileId(profile.id)} type="button">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-ink">{profile.full_name}</h3>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${kycTone[profile.kyc_status]}`}>
                        {formatLabel(profile.kyc_status)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-ink/68 md:grid-cols-2">
                      <p>{profile.phone || 'No phone captured'}</p>
                      <p>{profile.email || 'No email captured'}</p>
                      <p>{profile.guest_identity_documents?.length ?? 0} document record(s)</p>
                      <p>{profile.bookings?.length ?? 0} linked booking(s)</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-5 text-sm text-ink/55">No guest profiles match the current filter.</p>
              )}
            </div>
          </article>

          <ProfileEditor key={selectedProfile?.id ?? 'new-profile'} mode={mode} onMessage={handleMessage} onRefresh={handleRefresh} profile={selectedProfile} unlinkedBookings={unlinkedBookings} />
        </section>
      </div>
    </main>
  )
}