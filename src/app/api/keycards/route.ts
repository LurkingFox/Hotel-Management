import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient, type AuthenticatedUser } from '@/lib/supabase/server'

type KeycardScope = 'room' | 'master'

function normalizeCardUid(value: string) {
  return value.trim().toUpperCase()
}

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

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('keycards')
      .select('*, bookings(guest_name), rooms(number)')
      .order('issued_at', { ascending: false })

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
    const body = (await request.json()) as {
      cardUid?: string
      roomId?: string
      bookingId?: string
      issuedTo?: string
      validFrom?: string
      validUntil?: string
      scope?: KeycardScope
    }

    const scope = body.scope ?? 'room'
    const normalizedCardUid = body.cardUid ? normalizeCardUid(body.cardUid) : ''

    if (scope === 'master' && user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can issue master keycards.' }, { status: 403 })
    }

    if (!normalizedCardUid || !body.issuedTo || !body.validFrom || !body.validUntil) {
      return NextResponse.json({ error: 'Missing keycard payload.' }, { status: 400 })
    }

    if (scope === 'room' && (!body.roomId || !body.bookingId)) {
      return NextResponse.json({ error: 'Room keycards require room and booking references.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('keycards')
      .insert({
        card_uid: normalizedCardUid,
        room_id: scope === 'master' ? null : body.roomId,
        booking_id: scope === 'master' ? null : body.bookingId,
        issued_to: body.issuedTo,
        issued_by: actor,
        valid_from: body.validFrom,
        valid_until: body.validUntil,
        status: 'active',
        scope
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      type: scope === 'master' ? 'master_key_issued' : 'keycard_issued',
      message: scope === 'master' ? `Master key issued to ${body.issuedTo}.` : `Keycard issued to ${body.issuedTo}.`,
      triggered_by: actor,
      booking_id: scope === 'master' ? null : body.bookingId,
      keycard_id: data.id
    })

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
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
    const body = (await request.json()) as {
      id?: string
      action?: 'revoke' | 'extend'
      validUntil?: string
      bookingId?: string
      scope?: KeycardScope
    }

    if (!body.id || !body.action) {
      return NextResponse.json({ error: 'Keycard id and action are required.' }, { status: 400 })
    }

    const payload = body.action === 'revoke' ? { status: 'revoked' as const } : { valid_until: body.validUntil }
    const { data, error } = await supabase.from('keycards').update(payload).eq('id', body.id).select('*').single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      type:
        body.action === 'revoke'
          ? body.scope === 'master'
            ? 'master_key_revoked'
            : 'keycard_revoked'
          : body.scope === 'master'
            ? 'master_key_extended'
            : 'keycard_extended',
      message:
        body.action === 'revoke'
          ? body.scope === 'master'
            ? 'Master key revoked.'
            : 'Keycard revoked.'
          : body.scope === 'master'
            ? 'Master key validity extended.'
            : 'Keycard validity extended.',
      triggered_by: actor,
      booking_id: body.bookingId ?? data.booking_id,
      keycard_id: data.id
    })

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}