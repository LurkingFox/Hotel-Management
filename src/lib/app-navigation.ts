import { isFrontDeskRole } from '@/lib/staff-roles'

export type AppNavItem = {
  description: string
  href: string
  label: string
}

export type AppNavSection = {
  items: AppNavItem[]
  title: string
}

export type AppShellKind = 'admin' | 'reception'

const adminSections: AppNavSection[] = [
  {
    title: 'Admin operations',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', description: 'Command overview and live hotel status.' },
      { href: '/admin/bookings', label: 'Bookings', description: 'Arrivals, extensions, cancellations, and stays.' },
      { href: '/admin/payments', label: 'Payments', description: 'Receipts, balances, and collection channels.' },
      { href: '/admin/reports', label: 'Reports', description: 'Manager-facing packs, exports, and rollups.' },
      { href: '/admin/rooms', label: 'Rooms', description: 'Inventory, readiness, and nightly pricing.' },
      { href: '/admin/keycards', label: 'Keycards', description: 'Room keys, master keys, and validity control.' },
      { href: '/admin/staff', label: 'Staff', description: 'Roster, shifts, and access-linked identities.' },
      { href: '/admin/access-log', label: 'Access log', description: 'Granted, denied, and expired entry history.' },
      { href: '/admin/settings', label: 'Settings', description: 'Hotel identity, logo, and contact details.' }
    ]
  },
  {
    title: 'Front office',
    items: [
      { href: '/reception/desk', label: 'Reception desk', description: 'Jump into the live front-desk workflow.' },
      { href: '/reception/services', label: 'Reception services', description: 'Post and resolve guest service charges.' },
      { href: '/attendance', label: 'Attendance', description: 'Open the staff attendance portal.' }
    ]
  }
]

const receptionSections: AppNavSection[] = [
  {
    title: 'Reception workflow',
    items: [
      { href: '/reception/desk', label: 'Desk', description: 'Reservations, walk-ins, and checkout handling.' },
      { href: '/reception/services', label: 'Services', description: 'Charge laundry, food, minibar, and extras.' },
      { href: '/attendance', label: 'Attendance', description: 'Clock in and out of active shifts.' }
    ]
  },
  {
    title: 'Admin handoff',
    items: [{ href: '/admin/dashboard', label: 'Admin dashboard', description: 'Visible when admin users enter reception flow.' }]
  }
]

export function getNavigationSections(shell: AppShellKind, role?: string | null) {
  if (shell === 'admin') {
    return adminSections
  }

  if (role === 'admin') {
    return receptionSections
  }

  if (isFrontDeskRole(role)) {
    return receptionSections.filter((section) => section.title !== 'Admin handoff')
  }

  return [
    {
      title: 'Staff access',
      items: [{ href: '/attendance', label: 'Attendance', description: 'Clock in, clock out, and review recent shifts.' }]
    }
  ]
}