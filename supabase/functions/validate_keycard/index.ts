import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

type KeycardRow = {
  access_count: number
  bookings?: { status: string | null } | null
  booking_id: string | null
  card_uid: string
  id: string
  issued_by: string
  issued_to: string
  room_id: string | null
  scope?: 'room' | 'master' | null
  status: string
  valid_from: string
  valid_until: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function normalizeCardUid(value: string) {
  return value.trim().toUpperCase()
}

serve(async (request) => {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405)
    }

    const { card_uid, room_id } = (await request.json()) as {
      card_uid?: string
      room_id?: string
    }

    const normalizedCardUid = card_uid ? normalizeCardUid(card_uid) : ''
    const normalizedRoomId = room_id?.trim() ?? ''

    if (!normalizedCardUid || !normalizedRoomId) {
      return jsonResponse({ error: 'card_uid and room_id are required.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase secrets are missing.' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const today = new Date().toISOString().split('T')[0]

    const { data: cards, error: cardError } = await supabase
      .from('keycards')
      .select('*, bookings(status)')
      .eq('card_uid', normalizedCardUid)
      .eq('status', 'active')
      .returns<KeycardRow[]>()

    if (cardError) {
      return jsonResponse({ error: cardError.message }, 500)
    }

    const card = (cards ?? []).find((entry) => {
      const scope = entry.scope ?? 'room'
      return scope === 'master' || entry.room_id === normalizedRoomId
    }) ?? null

    const bookingActive = card?.scope === 'master' || !card?.booking_id || card.bookings?.status === 'active'
    const withinValidityWindow = Boolean(card && card.valid_from <= today && card.valid_until >= today)
    const granted = Boolean(card && withinValidityWindow && bookingActive)
    const result = granted ? 'granted' : card && !withinValidityWindow ? 'expired' : 'denied'
    const scopeLabel = card?.scope === 'master' ? 'Master key' : 'Card'
    const note = granted
      ? card?.scope === 'master'
        ? 'Master key override granted.'
        : 'Room card accepted.'
      : card && !withinValidityWindow
        ? `${scopeLabel} expired.`
        : card && !bookingActive
          ? 'Linked booking is no longer active.'
          : 'Unknown card or wrong room.'

    await supabase.from('access_log').insert({
      room_id: normalizedRoomId,
      card_uid: normalizedCardUid,
      keycard_id: card?.id ?? null,
      guest_name: card?.issued_to ?? null,
      issued_by: card?.issued_by ?? null,
      result,
      note
    })

    if (granted && card) {
      await supabase.from('keycards').update({ access_count: card.access_count + 1 }).eq('id', card.id)
    }

    return jsonResponse({ granted, note, result, unlock_seconds: granted ? 5 : 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected edge function error.'
    return jsonResponse({ error: message }, 500)
  }
})