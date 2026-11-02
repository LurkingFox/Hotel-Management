import { NextRequest, NextResponse } from 'next/server'
import { Seam } from 'seam'

import { getAccessMigrationState } from '@/lib/access-provider/config'
import { createAuthenticatedServerSupabaseClient, type AuthenticatedUser } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

function getActorName(user: AuthenticatedUser) {
  const metadataName = user?.user_metadata?.name
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName
  }

  return user?.email ?? 'system'
}

function toAccessWindowEnd(value: string) {
  return `${value}T23:59:59.000Z`
}

async function createNotification(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['notifications']['Insert']
) {
  const { error } = await supabase.from('notifications').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

async function fetchCredential(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  credentialId: string
) {
  const { data, error } = await supabase
    .from('booking_access_credentials')
    .select('*')
    .eq('id', credentialId)
    .single<AccessCredentialRow>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Access credential not found.')
  }

  return data
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const actor = getActorName(user)
    const body = (await request.json()) as {
      action?: 'extend' | 'revoke'
      id?: string
      validUntil?: string
    }

    if (!body.id || !body.action) {
      return NextResponse.json({ error: 'Credential id and action are required.' }, { status: 400 })
    }

    const credential = await fetchCredential(supabase, body.id)

    if (body.action === 'extend') {
      if (!body.validUntil) {
        return NextResponse.json({ error: 'validUntil is required to extend a credential.' }, { status: 400 })
      }

      if (credential.valid_from && Date.parse(body.validUntil) < Date.parse(credential.valid_from)) {
        return NextResponse.json({ error: 'Extended valid-until date must be on or after the valid-from date.' }, { status: 400 })
      }

      if (credential.provider === 'seam') {
        const migrationState = getAccessMigrationState()

        if (!migrationState.seamApiKey) {
          return NextResponse.json({ error: 'SEAM_API_KEY must be configured before extending Seam credentials.' }, { status: 503 })
        }

        if (!credential.provider_reference) {
          return NextResponse.json({ error: 'This Seam credential is missing its provider reference.' }, { status: 400 })
        }

        const seam = new Seam({ apiKey: migrationState.seamApiKey })
        await seam.accessCodes.update({
          access_code_id: credential.provider_reference,
          device_id: credential.provider_device_id ?? undefined,
          ends_at: toAccessWindowEnd(body.validUntil)
        })
      }

      const nextValidUntil = credential.provider === 'seam' ? toAccessWindowEnd(body.validUntil) : body.validUntil
      const { data: updatedCredential, error: credentialError } = await supabase
        .from('booking_access_credentials')
        .update({
          provider_status: credential.provider === 'seam' ? 'updated' : credential.provider_status,
          updated_at: new Date().toISOString(),
          valid_until: nextValidUntil
        })
        .eq('id', credential.id)
        .select('*')
        .single<AccessCredentialRow>()

      if (credentialError || !updatedCredential) {
        throw new Error(credentialError?.message ?? 'Credential could not be updated.')
      }

      await createNotification(supabase, {
        booking_id: credential.booking_id,
        message: credential.provider === 'seam' ? 'Guest access code validity extended.' : 'Guest access credential validity extended.',
        triggered_by: actor,
        type: 'access_credential_extended'
      })

      return NextResponse.json(updatedCredential)
    }

    if (credential.provider === 'seam') {
      const migrationState = getAccessMigrationState()

      if (!migrationState.seamApiKey) {
        return NextResponse.json({ error: 'SEAM_API_KEY must be configured before revoking Seam credentials.' }, { status: 503 })
      }

      if (!credential.provider_reference) {
        return NextResponse.json({ error: 'This Seam credential is missing its provider reference.' }, { status: 400 })
      }

      const seam = new Seam({ apiKey: migrationState.seamApiKey })
      await seam.accessCodes.delete({
        access_code_id: credential.provider_reference,
        device_id: credential.provider_device_id ?? undefined
      })
    }

    const { data: updatedCredential, error: credentialError } = await supabase
      .from('booking_access_credentials')
      .update({
        provider_status: credential.provider === 'seam' ? 'deleted' : credential.provider_status,
        status: 'revoked',
        updated_at: new Date().toISOString()
      })
      .eq('id', credential.id)
      .select('*')
      .single<AccessCredentialRow>()

    if (credentialError || !updatedCredential) {
      throw new Error(credentialError?.message ?? 'Credential could not be revoked.')
    }

    await createNotification(supabase, {
      booking_id: credential.booking_id,
      message: credential.provider === 'seam' ? 'Guest access code revoked.' : 'Guest access credential revoked.',
      triggered_by: actor,
      type: 'access_credential_revoked'
    })

    return NextResponse.json(updatedCredential)
  } catch (error) {
    return getErrorResponse(error)
  }
}