import { redirect } from 'next/navigation'

import { AttendanceClient } from '@/app/(reception)/attendance/attendance-client'
import { isFrontDeskRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']

async function resolveStaffRecord() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login?next=%2Fattendance')
  }

  const metadataStaffId = typeof user.user_metadata?.staff_id === 'string' ? user.user_metadata.staff_id : null
  const role = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null

  let staff: StaffRow | null = null

  const { data: linkedStaff, error: linkedStaffError } = await supabase.from('staff').select('*').eq('auth_user_id', user.id).maybeSingle()

  if (linkedStaffError) {
    throw new Error(linkedStaffError.message)
  }

  staff = linkedStaff

  if (!staff && metadataStaffId) {
    const { data: metadataStaff, error: metadataStaffError } = await supabase.from('staff').select('*').eq('id', metadataStaffId).maybeSingle()

    if (metadataStaffError) {
      throw new Error(metadataStaffError.message)
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
          throw new Error(relinkError.message)
        }

        staff = relinkedStaff
      } else {
        staff = metadataStaff
      }
    }
  }

  const dashboardHref = role === 'admin' ? '/admin/dashboard' : isFrontDeskRole(role) ? '/reception/desk' : null

  if (!staff) {
    return {
      dashboardHref,
      role,
      shifts: [] as ShiftRow[],
      staff: null
    }
  }

  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('*')
    .eq('staff_id', staff.id)
    .order('started_at', { ascending: false })
    .limit(8)

  if (shiftsError) {
    throw new Error(shiftsError.message)
  }

  return {
    dashboardHref,
    role,
    shifts: (shifts ?? []) as ShiftRow[],
    staff
  }
}

export default async function AttendancePage() {
  const { dashboardHref, role, shifts, staff } = await resolveStaffRecord()

  return <AttendanceClient dashboardHref={dashboardHref} role={role} shifts={shifts} staff={staff} />
}