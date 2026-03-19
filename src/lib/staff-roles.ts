export const STAFF_ROLE_OPTIONS = ['admin', 'receptionist', 'housekeeping', 'security', 'maintenance'] as const

export type StaffRole = (typeof STAFF_ROLE_OPTIONS)[number]

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return typeof value === 'string' && STAFF_ROLE_OPTIONS.includes(value as StaffRole)
}

export function isFrontDeskRole(role: string | null | undefined) {
  return role === 'admin' || role === 'receptionist'
}

export function getDefaultPathForRole(role: string | null | undefined) {
  if (role === 'admin') {
    return '/admin/dashboard'
  }

  if (role === 'receptionist') {
    return '/reception/desk'
  }

  return '/attendance'
}

export function getRoleLabel(role: string | null | undefined) {
  if (!role) {
    return 'staff'
  }

  return role.replaceAll('_', ' ')
}