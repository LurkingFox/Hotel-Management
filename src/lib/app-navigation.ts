import { isFrontDeskRole } from '@/lib/staff-roles'

export type AppNavItem = {
  description: string
  href: string
  icon: string
  label: string
}

export type AppNavSection = {
  items: AppNavItem[]
  title: string
}

export type AppShellKind = 'admin' | 'reception'

const adminSections = [
  {
    title: 'Command Center',
    items: [
      { href: '/admin/today', icon: 'activity', label: 'Today', description: 'Pending confirmations, arrivals, due-outs, and manager exceptions.' },
      { href: '/admin/approvals', icon: 'approval', label: 'Approvals', description: 'Extension reviews and receipt confirmations in one queue.' },
      { href: '/admin/dashboard', icon: 'desk', label: 'Dashboard', description: 'Command overview and live hotel status.' }
    ]
  },
  {
    title: 'Guests',
    items: [
      { href: '/admin/bookings', icon: 'bed', label: 'Bookings', description: 'Arrivals, extensions, cancellations, and stays.' },
      { href: '/admin/guests', icon: 'guest', label: 'Guests', description: 'Profiles, KYC progress, and identity records.' },
      { href: '/admin/guest-access', icon: 'door', label: 'Guest access', description: 'Access codes, provider state, and validity control.' }
    ]
  },
  {
    title: 'Rooms',
    items: [{ href: '/admin/rooms', icon: 'room', label: 'Rooms', description: 'Inventory, readiness, and nightly pricing.' }]
  },
  {
    title: 'Service Desk',
    items: [{ href: '/admin/service-desk', icon: 'request', label: 'Service desk', description: 'Guest requests, priorities, and staff assignment queue.' }]
  },
  {
    title: 'Finance',
    items: [{ href: '/admin/payments', icon: 'payment', label: 'Payments', description: 'Receipts, balances, and collection channels.' }]
  },
  {
    title: 'Team',
    items: [
      { href: '/admin/staff', icon: 'team', label: 'Staff', description: 'Roster, shifts, and access-linked identities.' },
      { href: '/admin/handoffs', icon: 'handoff', label: 'Handoffs', description: 'Reception carryover work and shift continuity board.' }
    ]
  },
  {
    title: 'Insights',
    items: [
      { href: '/admin/reports?mode=outlook', icon: 'report', label: 'Reports outlook', description: 'Operational signals, watchlists, and manager analysis.' },
      { href: '/admin/reports?mode=export', icon: 'export', label: 'Export studio', description: 'Prepare printable report packs and PDF exports.' },
      { href: '/admin/access-log', icon: 'archive', label: 'Access log', description: 'Granted, denied, and expired entry history.' }
    ]
  },
  {
    title: 'Settings',
    items: [{ href: '/admin/settings', icon: 'settings', label: 'Settings', description: 'Hotel identity, logo, and Seam room-device mappings.' }]
  },
  {
    title: 'Front office',
    items: [
      { href: '/reception/desk', icon: 'desk', label: 'Reception desk', description: 'Jump into the live front-desk workflow.' },
      { href: '/reception/services', icon: 'payment', label: 'Reception services', description: 'Post and resolve guest service charges.' },
      { href: '/attendance', icon: 'activity', label: 'Attendance', description: 'Open the staff attendance portal.' }
    ]
  }
] satisfies AppNavSection[]

const receptionSections = [
  {
    title: 'Desk',
    items: [
      { href: '/reception/desk', icon: 'desk', label: 'Desk', description: 'Reservations, walk-ins, and checkout handling.' },
      { href: '/reception/guests', icon: 'guest', label: 'Guests', description: 'Capture guest profiles, documents, and booking linkage.' }
    ]
  },
  {
    title: 'Requests',
    items: [
      { href: '/reception/requests', icon: 'request', label: 'Requests', description: 'Guest requests, service follow-up, and issue escalation.' },
      { href: '/reception/services', icon: 'payment', label: 'Services', description: 'Charge laundry, food, minibar, and extras.' }
    ]
  },
  {
    title: 'Shift Support',
    items: [
      { href: '/reception/handoffs', icon: 'handoff', label: 'Handoffs', description: 'Package carryover work for the next shift or manager.' },
      { href: '/attendance', icon: 'activity', label: 'Attendance', description: 'Clock in and out of active shifts.' }
    ]
  },
  {
    title: 'Manager handoff',
    items: [{ href: '/admin/today', icon: 'activity', label: 'Today', description: 'Visible when admin users enter reception flow.' }]
  }
] satisfies AppNavSection[]

export function getNavigationSections(shell: AppShellKind, role?: string | null) {
  if (shell === 'admin') {
    return adminSections
  }

  if (role === 'admin') {
    return receptionSections
  }

  if (isFrontDeskRole(role)) {
    return receptionSections.filter((section) => section.title !== 'Manager handoff')
  }

  return [
    {
      title: 'Staff access',
      items: [{ href: '/attendance', icon: 'activity', label: 'Attendance', description: 'Clock in, clock out, and review recent shifts.' }]
    }
  ]
}