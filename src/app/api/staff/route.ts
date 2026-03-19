import { NextRequest, NextResponse } from 'next/server'

import { isStaffRole, type StaffRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

type StaffAuthRole = StaffRole

type StaffAuthFunctionResponse = {
  error?: string
  id?: string
  email?: string | null
}

async function syncStaffAuthLink(supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'], staffId: string, authUserId: string) {
  const { data, error } = await supabase.from('staff').update({ auth_user_id: authUserId }).eq('id', staffId).select('*').single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function assertAdmin() {
  const { supabase, user, session } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  if (user.user_metadata?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) }
  }

  if (!session?.access_token) {
    return { error: NextResponse.json({ error: 'Authenticated session is required.' }, { status: 401 }) }
  }

  return { supabase, session, user }
}

async function callStaffAuthFunction(accessToken: string, payload: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase URL is not configured.')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/manage_staff_auth`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'x-staff-auth-token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  })

  const data = (await response.json()) as StaffAuthFunctionResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'Staff auth function request failed.')
  }

  return data
}

export async function GET() {
  try {
    const context = await assertAdmin()

    if ('error' in context) {
      return context.error
    }

    const { data, error } = await context.supabase.from('staff').select('*').order('active', { ascending: false }).order('name')

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
    const context = await assertAdmin()

    if ('error' in context) {
      return context.error
    }

    const body = (await request.json()) as {
      name?: string
      role?: StaffAuthRole
      dailyRateGhs?: number
      email?: string
      password?: string
    }

    if (!body.name || !body.role || typeof body.dailyRateGhs !== 'number' || !body.email || !body.password) {
      return NextResponse.json({ error: 'Name, role, dailyRateGhs, email, and password are required.' }, { status: 400 })
    }

    if (!isStaffRole(body.role)) {
      return NextResponse.json({ error: 'Unsupported staff role.' }, { status: 400 })
    }

    if (body.dailyRateGhs <= 0) {
      return NextResponse.json({ error: 'Daily rate must be greater than zero.' }, { status: 400 })
    }

    if (body.role === 'admin' && context.user.email !== 'manager@universityhotel.com') {
      return NextResponse.json({ error: 'Only the hotel manager account can provision additional admin users.' }, { status: 403 })
    }

    const { data: staffMember, error: staffError } = await context.supabase
      .from('staff')
      .insert({
        name: body.name.trim(),
        role: body.role,
        daily_rate_ghs: body.dailyRateGhs,
        on_shift: false,
        active: true
      })
      .select('*')
      .single()

    if (staffError) {
      return NextResponse.json({ error: staffError.message }, { status: 500 })
    }

    let createdAuthUserId: string | null = null

    try {
      const authUser = await callStaffAuthFunction(context.session.access_token, {
        action: 'create',
        email: body.email.trim().toLowerCase(),
        password: body.password,
        name: staffMember.name,
        role: body.role,
        staffId: staffMember.id,
        active: true
      })

      if (!authUser.id) {
        throw new Error('Staff auth function did not return an auth user id.')
      }

      createdAuthUserId = authUser.id
      const linkedStaff = await syncStaffAuthLink(context.supabase, staffMember.id, authUser.id)

      return NextResponse.json({ staff: linkedStaff, authUser }, { status: 201 })
    } catch (error) {
      if (createdAuthUserId) {
        try {
          await callStaffAuthFunction(context.session.access_token, {
            action: 'delete',
            authUserId: createdAuthUserId
          })
        } catch {
          // Preserve the original creation error and still remove the staff row below.
        }
      }

      await context.supabase.from('staff').delete().eq('id', staffMember.id)
      throw error
    }
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

    const body = (await request.json()) as {
      action?: 'toggle_shift' | 'update_identity'
      archive?: boolean
      id?: string
      onShift?: boolean
      authUserId?: string
      name?: string
      role?: StaffAuthRole
      dailyRateGhs?: number
      email?: string
      password?: string
    }

    if ((body.action ?? 'toggle_shift') === 'update_identity') {
      if (!body.id || !body.authUserId || !body.name || !body.role || typeof body.dailyRateGhs !== 'number' || !body.email) {
        return NextResponse.json({ error: 'Staff id, authUserId, name, role, dailyRateGhs, and email are required.' }, { status: 400 })
      }

      if (!isStaffRole(body.role)) {
        return NextResponse.json({ error: 'Unsupported staff role.' }, { status: 400 })
      }

      if (body.dailyRateGhs <= 0) {
        return NextResponse.json({ error: 'Daily rate must be greater than zero.' }, { status: 400 })
      }

      if (body.role === 'admin' && context.user.email !== 'manager@universityhotel.com') {
        return NextResponse.json({ error: 'Only the hotel manager account can assign admin role.' }, { status: 403 })
      }

      if (body.authUserId === context.user.id && body.role !== 'admin') {
        return NextResponse.json({ error: 'You cannot remove admin access from your own account.' }, { status: 400 })
      }

      const { data: existingStaff, error: existingStaffError } = await context.supabase
        .from('staff')
        .select('*')
        .eq('id', body.id)
        .single()

      if (existingStaffError) {
        return NextResponse.json({ error: existingStaffError.message }, { status: 500 })
      }

      const { data: staffMember, error: staffError } = await context.supabase
        .from('staff')
        .update({
          name: body.name.trim(),
          role: body.role,
          daily_rate_ghs: body.dailyRateGhs,
          auth_user_id: body.authUserId
        })
        .eq('id', body.id)
        .select('*')
        .single()

      if (staffError) {
        return NextResponse.json({ error: staffError.message }, { status: 500 })
      }

      const authUser = await callStaffAuthFunction(context.session.access_token, {
        action: 'update',
        authUserId: body.authUserId,
        email: body.email.trim().toLowerCase(),
        password: body.password?.trim() ? body.password : undefined,
        name: staffMember.name,
        role: body.role,
        staffId: staffMember.id,
        active: (existingStaff as { active?: boolean | null }).active !== false
      })

      if (staffMember.auth_user_id !== body.authUserId) {
        await syncStaffAuthLink(context.supabase, staffMember.id, body.authUserId)
      }

      return NextResponse.json({ staff: staffMember, authUser })
    }

    if (!body.id || typeof body.onShift !== 'boolean') {
      return NextResponse.json({ error: 'Staff id and onShift are required.' }, { status: 400 })
    }

    const { data: staffMember, error: lookupError } = await context.supabase
      .from('staff')
      .select('*')
      .eq('id', body.id)
      .single()

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 })
    }

    const { error: shiftError } = body.onShift
      ? await context.supabase.from('shifts').insert({ staff_id: body.id })
      : await context.supabase
          .from('shifts')
          .update({ ended_at: new Date().toISOString() })
          .eq('staff_id', body.id)
          .is('ended_at', null)

    if (shiftError) {
      return NextResponse.json({ error: shiftError.message }, { status: 500 })
    }

    const { data, error } = await context.supabase
      .from('staff')
      .update({ on_shift: body.onShift })
      .eq('id', staffMember.id)
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

export async function DELETE(request: NextRequest) {
  try {
    const context = await assertAdmin()

    if ('error' in context) {
      return context.error
    }

    const body = (await request.json()) as { id?: string; authUserId?: string; active?: boolean }

    if (!body.id || !body.authUserId) {
      return NextResponse.json({ error: 'Staff id and authUserId are required.' }, { status: 400 })
    }

    if (body.authUserId === context.user.id) {
      return NextResponse.json({ error: 'You cannot archive your own account.' }, { status: 400 })
    }

    const { data: targetStaff, error: targetLookupError } = await context.supabase
      .from('staff')
      .select('*')
      .eq('id', body.id)
      .single()

    if (targetLookupError) {
      return NextResponse.json({ error: targetLookupError.message }, { status: 500 })
    }

    if (targetStaff.role === 'admin') {
      const { count, error: adminCountError } = await context.supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true)

      if (adminCountError) {
        return NextResponse.json({ error: adminCountError.message }, { status: 500 })
      }

      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'The last active admin account cannot be archived.' }, { status: 400 })
      }

      if (context.user.email !== 'manager@universityhotel.com') {
        return NextResponse.json({ error: 'Only the hotel manager account can archive admin users.' }, { status: 403 })
      }
    }

    const { error: closeShiftError } = await context.supabase
      .from('shifts')
      .update({ ended_at: new Date().toISOString() })
      .eq('staff_id', body.id)
      .is('ended_at', null)

    if (closeShiftError) {
      return NextResponse.json({ error: closeShiftError.message }, { status: 500 })
    }

    await callStaffAuthFunction(context.session.access_token, {
      action: 'update',
      authUserId: body.authUserId,
      active: body.active ?? false,
      role: isStaffRole(targetStaff.role) ? targetStaff.role : 'receptionist',
      name: targetStaff.name,
      staffId: targetStaff.id
    })

    const { data, error: updateStaffError } = await context.supabase
      .from('staff')
      .update({ active: body.active ?? false, on_shift: false })
      .eq('id', body.id)
      .select('*')
      .single()

    if (updateStaffError) {
      return NextResponse.json({ error: updateStaffError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}