import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

type ControllerStatus = 'degraded' | 'offline' | 'online'
type AccessResult = 'denied' | 'expired' | 'granted'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

serve(async (request) => {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase secrets are missing.' }, 500)
    }

    const body = (await request.json()) as {
      controller_id?: string
      firmware_version?: string
      heartbeat_status?: ControllerStatus
      last_card_uid?: string
      last_error?: string
      last_note?: string
      last_result?: AccessResult
      room_id?: string
    }

    const controllerId = body.controller_id?.trim()

    if (!controllerId) {
      return jsonResponse({ error: 'controller_id is required.' }, 400)
    }

    const status = body.heartbeat_status ?? 'online'
    const now = new Date().toISOString()
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await supabase
      .from('door_controllers')
      .upsert(
        {
          controller_id: controllerId,
          firmware_version: body.firmware_version?.trim() || null,
          heartbeat_status: status,
          last_card_uid: body.last_card_uid?.trim().toUpperCase() || null,
          last_error: body.last_error?.trim() || null,
          last_note: body.last_note?.trim() || null,
          last_result: body.last_result ?? null,
          last_seen_at: now,
          room_id: body.room_id?.trim() || null,
          updated_at: now
        },
        { onConflict: 'controller_id' }
      )
      .select('*')
      .single()

    if (error) {
      return jsonResponse({ error: error.message }, 500)
    }

    return jsonResponse(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected controller status error.'
    return jsonResponse({ error: message }, 500)
  }
})