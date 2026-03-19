import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function assertAdmin() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  if (user.user_metadata?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) }
  }

  return { supabase }
}

export async function GET() {
  try {
    const context = await assertAdmin()

    if ('error' in context) {
      return context.error
    }

    const { data, error } = await context.supabase
      .from('notifications')
      .select('*')
      .eq('read', false)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await assertAdmin()

    if ('error' in context) {
      return context.error
    }

    const body = (await request.json()) as { id?: string }

    if (!body.id) {
      return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 })
    }

    const { data, error } = await context.supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}