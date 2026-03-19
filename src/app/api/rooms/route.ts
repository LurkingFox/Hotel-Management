import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomStatus = Database['public']['Enums']['room_status']
type RoomType = Database['public']['Enums']['room_type']
type RoomInsert = Database['public']['Tables']['rooms']['Insert']
type RoomUpdate = Database['public']['Tables']['rooms']['Update']

const defaultRooms: Array<{
  number: string
  type: RoomType
  rate_ghs: number
  status: RoomStatus
}> = [
  { number: '101', type: 'single', rate_ghs: 280, status: 'vacant' },
  { number: '102', type: 'single', rate_ghs: 280, status: 'vacant' },
  { number: '103', type: 'double', rate_ghs: 420, status: 'vacant' },
  { number: '104', type: 'double', rate_ghs: 420, status: 'vacant' },
  { number: '201', type: 'suite', rate_ghs: 650, status: 'vacant' },
  { number: '202', type: 'suite', rate_ghs: 650, status: 'vacant' },
  { number: '301', type: 'family', rate_ghs: 780, status: 'vacant' },
  { number: '302', type: 'family', rate_ghs: 780, status: 'vacant' }
]

function getConfigErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

function normalizeRoomNumber(value: string | undefined) {
  return value?.trim()
}

function parseRate(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return amount
}

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const { data, error } = await supabase.from('rooms').select('*').order('number')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getConfigErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    const role = user?.user_metadata?.role

    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = (await request.json()) as {
      id?: string
      number?: string
      type?: RoomType
      rate_ghs?: number
      status?: RoomStatus
    }

    if (!body.id) {
      return NextResponse.json({ error: 'Room id is required.' }, { status: 400 })
    }

    const updates: RoomUpdate = {}

    if (typeof body.number === 'string') {
      const number = normalizeRoomNumber(body.number)

      if (!number) {
        return NextResponse.json({ error: 'Room number is required.' }, { status: 400 })
      }

      updates.number = number
    }

    if (body.type) {
      updates.type = body.type
    }

    if (typeof body.rate_ghs !== 'undefined') {
      const rate = parseRate(body.rate_ghs)

      if (rate === null) {
        return NextResponse.json({ error: 'Rate must be greater than zero.' }, { status: 400 })
      }

      updates.rate_ghs = rate
    }

    if (body.status) {
      updates.status = body.status
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'At least one room field must be provided.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getConfigErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    const role = user?.user_metadata?.role

    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const body = (await request.json()) as {
      action?: 'seed_default_rooms'
      number?: string
      type?: RoomType
      rate_ghs?: number
      status?: RoomStatus
    }

    if (body.action === 'seed_default_rooms') {
      const { data, error } = await supabase
        .from('rooms')
        .upsert(defaultRooms, { onConflict: 'number' })
        .select('*')
        .order('number')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ seeded: data.length, rooms: data })
    }

    const number = normalizeRoomNumber(body.number)
    const rate = parseRate(body.rate_ghs)

    if (!number || !body.type || rate === null) {
      return NextResponse.json({ error: 'Room number, room type, and rate are required.' }, { status: 400 })
    }

    const roomToCreate: RoomInsert = {
      number,
      type: body.type,
      rate_ghs: rate,
      status: body.status ?? 'vacant'
    }

    const { data, error } = await supabase.from('rooms').insert(roomToCreate).select('*').single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return getConfigErrorResponse(error)
  }
}