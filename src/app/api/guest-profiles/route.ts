import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient, type AuthenticatedUser } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type GuestKycStatus = Database['public']['Enums']['guest_kyc_status']
type IdentityDocumentStatus = Database['public']['Enums']['identity_document_status']
type IdentityDocumentType = Database['public']['Enums']['identity_document_type']

type GuestDocumentInput = {
  documentNumber?: string
  documentType?: IdentityDocumentType
  expiresOn?: string | null
  id?: string
  issuedOn?: string | null
  issuingCountry?: string | null
  status?: IdentityDocumentStatus
  verificationNotes?: string | null
}

type CreateGuestProfileBody = {
  city?: string
  dateOfBirth?: string
  document?: GuestDocumentInput
  email?: string
  fullName?: string
  kycNotes?: string
  kycStatus?: GuestKycStatus
  nationality?: string
  phone?: string
}

type UpdateGuestProfileBody = CreateGuestProfileBody & {
  action?: 'link_booking' | 'save_profile'
  bookingId?: string
  profileId?: string
}

function getActorName(user: AuthenticatedUser) {
  const metadataName = user?.user_metadata?.name
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName
  }

  return user?.email ?? 'system'
}

function getActorRole(user: AuthenticatedUser) {
  const metadataRole = user?.user_metadata?.role
  return typeof metadataRole === 'string' && metadataRole.length > 0 ? metadataRole : null
}

function normalizeGuestName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function maskDocumentNumber(value: string) {
  const trimmed = value.trim()

  if (trimmed.length <= 4) {
    return trimmed
  }

  return `${'*'.repeat(Math.max(trimmed.length - 4, 0))}${trimmed.slice(-4)}`
}

function getDocumentStatus(document: GuestDocumentInput | undefined, actorRole: string | null): IdentityDocumentStatus {
  if (actorRole === 'admin') {
    return document?.status ?? 'pending'
  }

  return 'pending'
}

function deriveProfileKycStatus(
  requestedStatus: GuestKycStatus | undefined,
  document: GuestDocumentInput | undefined,
  actorRole: string | null
) {
  if (document?.documentType && document.documentNumber?.trim()) {
    const documentStatus = getDocumentStatus(document, actorRole)

    if (documentStatus === 'verified') {
      return 'verified' satisfies GuestKycStatus
    }

    if (documentStatus === 'pending') {
      return 'pending' satisfies GuestKycStatus
    }

    return 'rejected' satisfies GuestKycStatus
  }

  if (actorRole !== 'admin') {
    return requestedStatus === 'pending' ? 'pending' : 'not_started'
  }

  return requestedStatus ?? 'not_started'
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function createOrUpdateDocument(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  actor: string,
  actorRole: string | null,
  guestProfileId: string,
  document?: GuestDocumentInput
) {
  if (!document?.documentType || !document.documentNumber?.trim()) {
    return null
  }

  const normalizedStatus = getDocumentStatus(document, actorRole)
  const payload: Database['public']['Tables']['guest_identity_documents']['Insert'] = {
    document_number: document.documentNumber.trim(),
    document_type: document.documentType,
    expires_on: document.expiresOn ?? null,
    guest_profile_id: guestProfileId,
    issued_on: document.issuedOn ?? null,
    issuing_country: normalizeOptionalString(document.issuingCountry),
    status: normalizedStatus,
    verification_notes: normalizeOptionalString(document.verificationNotes),
    verified_at: normalizedStatus === 'verified' ? new Date().toISOString() : null,
    verified_by: normalizedStatus === 'verified' ? actor : null
  }

  if (document.id) {
    const { data, error } = await supabase
      .from('guest_identity_documents')
      .update(payload)
      .eq('id', document.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  const { data, error } = await supabase.from('guest_identity_documents').insert(payload).select('*').single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function createManagerApproval(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['manager_approvals']['Insert']
) {
  const { error } = await supabase.from('manager_approvals').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

async function updateManagerApprovalByTarget(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  values: Database['public']['Tables']['manager_approvals']['Update'],
  targetId: string,
  targetTable: string
) {
  const { error } = await supabase
    .from('manager_approvals')
    .update(values)
    .eq('target_id', targetId)
    .eq('target_table', targetTable)
    .eq('approval_type', 'guest_kyc_review')
    .eq('status', 'pending')

  if (error) {
    throw new Error(error.message)
  }
}

async function syncGuestKycApproval(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  values: {
    actor: string
    actorRole: string | null
    document: Database['public']['Tables']['guest_identity_documents']['Row'] | null
    profile: Database['public']['Tables']['guest_profiles']['Row']
  }
) {
  if (!values.document) {
    return
  }

  const title = `Review KYC for ${values.profile.full_name}`
  const detail = `${values.profile.full_name} submitted ${formatLabel(values.document.document_type)} ending ${maskDocumentNumber(values.document.document_number)} for manager verification.`
  const metadata = {
    document_masked: maskDocumentNumber(values.document.document_number),
    document_status: values.document.status,
    document_type: values.document.document_type,
    email: values.profile.email,
    guest_name: values.profile.full_name,
    guest_profile_id: values.profile.id,
    kyc_status: values.profile.kyc_status,
    nationality: values.profile.nationality,
    phone: values.profile.phone
  } satisfies Record<string, string | null>

  const { data: pendingApproval, error: pendingApprovalError } = await supabase
    .from('manager_approvals')
    .select('*')
    .eq('approval_type', 'guest_kyc_review')
    .eq('target_id', values.document.id)
    .eq('target_table', 'guest_identity_documents')
    .eq('status', 'pending')
    .maybeSingle()

  if (pendingApprovalError) {
    throw new Error(pendingApprovalError.message)
  }

  if (values.document.status === 'pending') {
    const approvalValues: Database['public']['Tables']['manager_approvals']['Update'] = {
      detail,
      metadata,
      requested_at: new Date().toISOString(),
      requested_by: values.actor,
      requested_by_role: values.actorRole,
      title
    }

    if (pendingApproval) {
      await updateManagerApprovalByTarget(supabase, approvalValues, values.document.id, 'guest_identity_documents')
      return
    }

    await createManagerApproval(supabase, {
      approval_type: 'guest_kyc_review',
      detail,
      metadata,
      requested_by: values.actor,
      requested_by_role: values.actorRole,
      target_id: values.document.id,
      target_table: 'guest_identity_documents',
      title
    })
    return
  }

  if (pendingApproval) {
    await updateManagerApprovalByTarget(
      supabase,
      {
        review_note:
          values.document.status === 'verified'
            ? `Closed automatically after ${values.actor} verified this document from the guest profile workspace.`
            : `Closed automatically after ${values.actor} marked this document as ${formatLabel(values.document.status)} from the guest profile workspace.`,
        reviewed_at: new Date().toISOString(),
        reviewed_by: values.actor,
        status: values.document.status === 'verified' ? 'approved' : 'rejected'
      },
      values.document.id,
      'guest_identity_documents'
    )
  }
}

async function getProfileWithRelations(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  profileId: string
) {
  const { data, error } = await supabase
    .from('guest_profiles')
    .select(
      'id, full_name, phone, email, nationality, city, date_of_birth, kyc_status, kyc_notes, last_stayed_at, created_at, updated_at, guest_identity_documents(id, document_type, document_number, issuing_country, issued_on, expires_on, status, verification_notes, verified_at, verified_by, created_at), bookings(id, guest_name, guest_phone, guest_profile_id, check_in, check_out_expected, status, rooms(number, type))'
    )
    .eq('id', profileId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const search = request.nextUrl.searchParams.get('search')?.trim() ?? ''
    const kycStatus = request.nextUrl.searchParams.get('kycStatus')
    let query = supabase
      .from('guest_profiles')
      .select(
        'id, full_name, phone, email, nationality, city, date_of_birth, kyc_status, kyc_notes, last_stayed_at, created_at, updated_at, guest_identity_documents(id, document_type, document_number, issuing_country, issued_on, expires_on, status, verification_notes, verified_at, verified_by, created_at), bookings(id, guest_name, guest_phone, guest_profile_id, check_in, check_out_expected, status, rooms(number, type))'
      )
      .order('updated_at', { ascending: false })

    if (search.length > 0) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    }

    if (kycStatus) {
      query = query.eq('kyc_status', kycStatus)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const actor = getActorName(user)
    const actorRole = getActorRole(user)
    const body = (await request.json()) as CreateGuestProfileBody
    const kycStatus = deriveProfileKycStatus(body.kycStatus, body.document, actorRole)

    if (!body.fullName?.trim()) {
      return NextResponse.json({ error: 'Guest full name is required.' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('guest_profiles')
      .insert({
        city: normalizeOptionalString(body.city),
        date_of_birth: body.dateOfBirth?.trim() || null,
        email: normalizeOptionalString(body.email),
        full_name: normalizeGuestName(body.fullName),
        kyc_notes: normalizeOptionalString(body.kycNotes),
        kyc_status: kycStatus,
        nationality: normalizeOptionalString(body.nationality),
        phone: normalizeOptionalString(body.phone)
      })
      .select('*')
      .single()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const document = await createOrUpdateDocument(supabase, actor, actorRole, profile.id, body.document)
    await syncGuestKycApproval(supabase, { actor, actorRole, document, profile })
    const reloaded = await getProfileWithRelations(supabase, profile.id)
    return NextResponse.json({ profile: reloaded }, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const actor = getActorName(user)
    const actorRole = getActorRole(user)
    const body = (await request.json()) as UpdateGuestProfileBody

    if (body.action === 'link_booking') {
      if (!body.profileId || !body.bookingId) {
        return NextResponse.json({ error: 'Profile and booking ids are required to link a booking.' }, { status: 400 })
      }

      const { data: profile, error: profileError } = await supabase.from('guest_profiles').select('*').eq('id', body.profileId).single()

      if (profileError || !profile) {
        return NextResponse.json({ error: profileError?.message ?? 'Guest profile not found.' }, { status: 404 })
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ guest_name: profile.full_name, guest_phone: profile.phone, guest_profile_id: profile.id })
        .eq('id', body.bookingId)

      if (bookingError) {
        return NextResponse.json({ error: bookingError.message }, { status: 500 })
      }

      const reloaded = await getProfileWithRelations(supabase, profile.id)
      return NextResponse.json({ message: 'Booking linked to guest profile.', profile: reloaded })
    }

    if (!body.profileId) {
      return NextResponse.json({ error: 'Guest profile id is required.' }, { status: 400 })
    }

    const kycStatus = deriveProfileKycStatus(body.kycStatus, body.document, actorRole)

    const { data: updatedProfile, error: profileError } = await supabase
      .from('guest_profiles')
      .update({
        city: normalizeOptionalString(body.city),
        date_of_birth: body.dateOfBirth?.trim() || null,
        email: normalizeOptionalString(body.email),
        full_name: body.fullName?.trim() ? normalizeGuestName(body.fullName) : undefined,
        kyc_notes: normalizeOptionalString(body.kycNotes),
        kyc_status: kycStatus,
        nationality: normalizeOptionalString(body.nationality),
        phone: normalizeOptionalString(body.phone)
      })
      .eq('id', body.profileId)
      .select('*')
      .single()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const { error: bookingSyncError } = await supabase
      .from('bookings')
      .update({ guest_name: updatedProfile.full_name, guest_phone: updatedProfile.phone })
      .eq('guest_profile_id', updatedProfile.id)

    if (bookingSyncError) {
      return NextResponse.json({ error: bookingSyncError.message }, { status: 500 })
    }

    const document = await createOrUpdateDocument(supabase, actor, actorRole, updatedProfile.id, body.document)
    await syncGuestKycApproval(supabase, { actor, actorRole, document, profile: updatedProfile })
    const reloaded = await getProfileWithRelations(supabase, updatedProfile.id)
    return NextResponse.json({ profile: reloaded, message: 'Guest profile updated.' })
  } catch (error) {
    return getErrorResponse(error)
  }
}