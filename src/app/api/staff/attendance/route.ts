import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected attendance error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function resolveLinkedStaff() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  const metadataStaffId = typeof user.user_metadata?.staff_id === 'string' ? user.user_metadata.staff_id : null
  let staff: StaffRow | null = null

  const { data: linkedStaff, error: linkedStaffError } = await supabase.from('staff').select('*').eq('auth_user_id', user.id).maybeSingle()

  if (linkedStaffError) {
    return { error: NextResponse.json({ error: linkedStaffError.message }, { status: 500 }) }
  }

  staff = linkedStaff

  if (!staff && metadataStaffId) {
    const { data: metadataStaff, error: metadataStaffError } = await supabase.from('staff').select('*').eq('id', metadataStaffId).maybeSingle()

    if (metadataStaffError) {
      return { error: NextResponse.json({ error: metadataStaffError.message }, { status: 500 }) }
    }

    if (metadataStaff) {
      if (metadataStaff.auth_user_id !== user.id) {
        const { data: relinkedStaff, error: relinkError } = await supabase
          .from('staff')
          .update({ auth_user_id: user.id })
          .eq('id', metadataStaff.id)
          .select('*')
          .single()

        if (relinkError) {
          return { error: NextResponse.json({ error: relinkError.message }, { status: 500 }) }
        }

        staff = relinkedStaff
      } else {
        staff = metadataStaff
      }
    }
  }

  if (!staff) {
    return { error: NextResponse.json({ error: 'This login is not linked to a staff profile.' }, { status: 404 }) }
  }

  if (staff.active === false) {
    return { error: NextResponse.json({ error: 'This staff profile is inactive.' }, { status: 403 }) }
  }

  return { supabase, user, staff }
}

async function loadOpenShift(supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'], staffId: string) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as ShiftRow | null
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveLinkedStaff()

    if ('error' in context) {
      return context.error
    }

    const body = (await request.json()) as { action?: 'start_shift' | 'end_shift' }

    if (!body.action) {
      return NextResponse.json({ error: 'Attendance action is required.' }, { status: 400 })
    }

    const openShift = await loadOpenShift(context.supabase, context.staff.id)

    if (body.action === 'start_shift') {
      let shift = openShift

      if (!shift) {
        const { data: createdShift, error: createShiftError } = await context.supabase
          .from('shifts')
          .insert({ staff_id: context.staff.id })
          .select('*')
          .single()

        if (createShiftError) {
          return NextResponse.json({ error: createShiftError.message }, { status: 500 })
        }

        shift = createdShift as ShiftRow
      }

      const { data: updatedStaff, error: updateStaffError } = await context.supabase
        .from('staff')
        .update({ on_shift: true, auth_user_id: context.user.id })
        .eq('id', context.staff.id)
        .select('*')
        .single()

      if (updateStaffError) {
        return NextResponse.json({ error: updateStaffError.message }, { status: 500 })
      }

      return NextResponse.json({
        message: openShift ? 'Shift was already open. Your attendance status has been restored.' : 'Shift started successfully.',
        staff: updatedStaff,
        shift
      })
    }

    if (body.action === 'end_shift') {
      if (openShift) {
        const { error: closeShiftError } = await context.supabase
          .from('shifts')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', openShift.id)

        if (closeShiftError) {
          return NextResponse.json({ error: closeShiftError.message }, { status: 500 })
        }
      }

      const { data: updatedStaff, error: updateStaffError } = await context.supabase
        .from('staff')
        .update({ on_shift: false, auth_user_id: context.user.id })
        .eq('id', context.staff.id)
        .select('*')
        .single()

      if (updateStaffError) {
        return NextResponse.json({ error: updateStaffError.message }, { status: 500 })
      }

      return NextResponse.json({
        message: openShift ? 'Shift ended successfully.' : 'No open shift was found. Your attendance status has been cleared.',
        staff: updatedStaff,
        shift: openShift
      })
    }

    return NextResponse.json({ error: 'Unsupported attendance action.' }, { status: 400 })
  } catch (error) {
    return getErrorResponse(error)
  }
}