import { NextRequest, NextResponse } from 'next/server'

import { getSeamConfig } from '@/lib/access-provider/seam'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type RoomAccessDeviceRow = Database['public']['Tables']['room_access_devices']['Row']

type UpsertRoomAccessDeviceBody = {
  deviceId?: string
  displayName?: string | null
  roomId?: string
}

type SyncFromEnvBody = {
  action?: 'sync_from_env'
}

function getActorName(name: unknown, email: unknown) {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name
  }

  if (typeof email === 'string' && email.trim().length > 0) {
    return email
  }

  return 'system'
}

function isSyncRequestBody(value: unknown): value is SyncFromEnvBody {
  return Boolean(value && typeof value === 'object' && 'action' in value && (value as SyncFromEnvBody).action === 'sync_from_env')
}

async function getMappingsPayload(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase']
) {
  const [roomsResult, mappingsResult] = await Promise.all([
    supabase.from('rooms').select('id, number, type, status').order('number'),
    supabase.from('room_access_devices').select('id, room_id, provider, external_device_id, display_name, updated_at').eq('provider', 'seam').order('updated_at', { ascending: false })
  ])

  if (roomsResult.error) {
    throw new Error(roomsResult.error.message)
  }

  if (mappingsResult.error) {
    throw new Error(mappingsResult.error.message)
  }

  const mappingsByRoomId = new Map((mappingsResult.data ?? []).map((mapping) => [mapping.room_id, mapping]))

  return {
    mappings: (roomsResult.data ?? []).map((room) => ({
      displayName: mappingsByRoomId.get(room.id)?.display_name ?? '',
      externalDeviceId: mappingsByRoomId.get(room.id)?.external_device_id ?? '',
      provider: mappingsByRoomId.get(room.id)?.provider ?? 'seam',
      room: room,
      roomAccessDeviceId: mappingsByRoomId.get(room.id)?.id ?? null,
      updatedAt: mappingsByRoomId.get(room.id)?.updated_at ?? null
    }))
  }
}

async function syncMappingsFromEnv(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase']
) {
  const roomDeviceMap = getSeamConfig().roomDeviceMap
  const roomNumbers = Object.keys(roomDeviceMap)

  if (roomNumbers.length === 0) {
    throw new Error('SEAM_ROOM_DEVICE_MAP_JSON is empty or not configured.')
  }

  const { data: rooms, error: roomsError } = await supabase.from('rooms').select('id, number').in('number', roomNumbers)

  if (roomsError) {
    throw new Error(roomsError.message)
  }

  const roomsByNumber = new Map((rooms ?? []).map((room) => [room.number, room]))
  const missingRoomNumbers = roomNumbers.filter((roomNumber) => !roomsByNumber.has(roomNumber))

  if (missingRoomNumbers.length > 0) {
    throw new Error(`No matching rooms found for: ${missingRoomNumbers.join(', ')}`)
  }

  const upserts = roomNumbers.map((roomNumber) => {
    const room = roomsByNumber.get(roomNumber) as Pick<RoomRow, 'id' | 'number'>

    return {
      display_name: `Room ${room.number}`,
      external_device_id: roomDeviceMap[roomNumber],
      provider: 'seam',
      room_id: room.id,
      updated_at: new Date().toISOString()
    }
  })

  const { error } = await supabase.from('room_access_devices').upsert(upserts, { onConflict: 'room_id' })

  if (error) {
    throw new Error(error.message)
  }

  return upserts.length
}

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    return NextResponse.json(await getMappingsPayload(supabase))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = (await request.json()) as SyncFromEnvBody

    if (!isSyncRequestBody(body)) {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
    }

    const syncedCount = await syncMappingsFromEnv(supabase)

    return NextResponse.json({
      message: `Synced ${syncedCount} Seam room mappings from environment variables.`,
      ...(await getMappingsPayload(supabase))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = (await request.json()) as UpsertRoomAccessDeviceBody
    const roomId = body.roomId?.trim()
    const deviceId = body.deviceId?.trim()

    if (!roomId || !deviceId) {
      return NextResponse.json({ error: 'roomId and deviceId are required.' }, { status: 400 })
    }

    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const { error } = await supabase.from('room_access_devices').upsert(
      {
        display_name: body.displayName?.trim() || null,
        external_device_id: deviceId,
        provider: 'seam',
        room_id: roomId,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'room_id' }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      message: `Seam device mapping updated by ${actor}.`,
      ...(await getMappingsPayload(supabase))
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}