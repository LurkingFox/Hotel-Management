'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

import { AdminSessionActions } from '@/app/(admin)/admin/admin-session-actions'
import { getNavigationSections, type AppNavItem, type AppShellKind } from '@/lib/app-navigation'

type ShellSummaryItem = {
  caption: string
  count: number
  href: string
  label: string
}

type ShellSummary = {
  description: string
  items: ShellSummaryItem[]
  title: string
}

type AppShellProps = {
  actionCounts?: Partial<Record<string, number>>
  children: React.ReactNode
  currentRole?: string | null
  currentUser: string
  shell: AppShellKind
  summary?: ShellSummary
}

type ActiveNavigationContext = {
  item: AppNavItem
  siblingItems: AppNavItem[]
  sectionTitle: string
}

type PaneAccent = {
  activeBadge: string
  activeBorder: string
  activeIcon: string
  activeQuickAction: string
  mutedIcon: string
}

type CountTone = 'critical' | 'neutral' | 'warning'

function isActive(pathname: string, href: string) {
  if (href === '/attendance') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function getCountTone(href: string, count: number): CountTone {
  if (count <= 0) {
    return 'neutral'
  }

  if (href === '/admin/approvals' || href === '/admin/handoffs' || href === '/reception/handoffs') {
    return count >= 5 ? 'critical' : 'warning'
  }

  if (href === '/admin/service-desk' || href === '/reception/requests' || href === '/reception/services') {
    return count >= 8 ? 'critical' : 'warning'
  }

  if (href === '/admin/rooms') {
    return count >= 4 ? 'critical' : 'warning'
  }

  if (href === '/admin/access-log') {
    return count >= 6 ? 'critical' : 'warning'
  }

  if (href === '/admin/guests' || href === '/reception/guests') {
    return count >= 6 ? 'critical' : 'warning'
  }

  if (href === '/admin/staff' || href === '/attendance') {
    return count >= 3 ? 'warning' : 'neutral'
  }

  return count >= 10 ? 'warning' : 'neutral'
}

function getBadgeClassName(tone: CountTone, active: boolean, compact = false) {
  if (active) {
    return compact ? 'bg-white text-ink' : 'bg-ink/8 text-ink'
  }

  if (tone === 'critical') {
    return compact ? 'bg-[#f7d5cf] text-[#7b2317]' : 'bg-[#f7d5cf] text-[#7b2317]'
  }

  if (tone === 'warning') {
    return compact ? 'bg-[#f3e0ae] text-[#694b00]' : 'bg-[#f3e0ae] text-[#694b00]'
  }

  return compact ? 'bg-white/12 text-white' : 'bg-white/12 text-white'
}

function renderCountBadge(href: string, count: number, active: boolean, compact = false) {
  const tone = getCountTone(href, count)

  return (
    <span className={`rounded-full px-2 py-0.5 font-semibold ${getBadgeClassName(tone, active, compact)}`}>
      {count}
    </span>
  )
}

function getPaneAccent(href: string): PaneAccent {
  if (href.includes('approvals') || href.includes('handoffs')) {
    return {
      activeBadge: 'bg-[#ead0c9] text-[#7b2317]',
      activeBorder: 'border-[#cb8f80] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(123,35,23,0.34)]',
      activeIcon: 'bg-[#f4dfd9] text-[#7b2317]',
      activeQuickAction: 'border-[#7b2317] bg-[#7b2317] text-white',
      mutedIcon: 'bg-[#f4dfd9]/20 text-white/84'
    }
  }

  if (href.includes('service-desk') || href.includes('/requests')) {
    return {
      activeBadge: 'bg-[#f3e0ae] text-[#694b00]',
      activeBorder: 'border-[#d4b45b] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(105,75,0,0.28)]',
      activeIcon: 'bg-[#f9edcb] text-[#694b00]',
      activeQuickAction: 'border-[#8b6a12] bg-[#8b6a12] text-white',
      mutedIcon: 'bg-[#f3e0ae]/20 text-white/84'
    }
  }

  if (href.includes('rooms') || href.includes('bookings') || href.includes('/desk')) {
    return {
      activeBadge: 'bg-[#d3ebe4] text-[#114c42]',
      activeBorder: 'border-[#76b0a2] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(17,76,66,0.28)]',
      activeIcon: 'bg-[#ddf1ec] text-[#114c42]',
      activeQuickAction: 'border-[#114c42] bg-[#114c42] text-white',
      mutedIcon: 'bg-[#d3ebe4]/20 text-white/84'
    }
  }

  if (href.includes('payments') || href.includes('services')) {
    return {
      activeBadge: 'bg-[#efdcb5] text-[#7b4d06]',
      activeBorder: 'border-[#d2ae66] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(123,77,6,0.28)]',
      activeIcon: 'bg-[#f5e7c7] text-[#7b4d06]',
      activeQuickAction: 'border-[#7b4d06] bg-[#7b4d06] text-white',
      mutedIcon: 'bg-[#efdcb5]/20 text-white/84'
    }
  }

  if (href.includes('guests') || href.includes('guest-access')) {
    return {
      activeBadge: 'bg-[#dce9d0] text-[#34591f]',
      activeBorder: 'border-[#9eb97f] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(52,89,31,0.28)]',
      activeIcon: 'bg-[#e6f0db] text-[#34591f]',
      activeQuickAction: 'border-[#34591f] bg-[#34591f] text-white',
      mutedIcon: 'bg-[#dce9d0]/20 text-white/84'
    }
  }

  if (href.includes('reports') || href.includes('access-log')) {
    return {
      activeBadge: 'bg-[#d9e4ef] text-[#23476d]',
      activeBorder: 'border-[#8fadcb] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(35,71,109,0.28)]',
      activeIcon: 'bg-[#e2ebf4] text-[#23476d]',
      activeQuickAction: 'border-[#23476d] bg-[#23476d] text-white',
      mutedIcon: 'bg-[#d9e4ef]/20 text-white/84'
    }
  }

  if (href.includes('staff') || href.includes('attendance')) {
    return {
      activeBadge: 'bg-[#e1dfec] text-[#4f4378]',
      activeBorder: 'border-[#a59bc5] bg-white text-ink shadow-[0_18px_38px_-24px_rgba(79,67,120,0.28)]',
      activeIcon: 'bg-[#e9e6f2] text-[#4f4378]',
      activeQuickAction: 'border-[#4f4378] bg-[#4f4378] text-white',
      mutedIcon: 'bg-[#e1dfec]/20 text-white/84'
    }
  }

  return {
    activeBadge: 'bg-emerald-100 text-emerald-900',
    activeBorder: 'border-emerald-300 bg-white text-ink shadow-[0_18px_38px_-24px_rgba(15,61,46,0.26)]',
    activeIcon: 'bg-emerald-50 text-emerald-900',
    activeQuickAction: 'border-ink bg-ink text-white',
    mutedIcon: 'bg-white/10 text-white/84'
  }
}

function NavIcon({ icon, active = false, compact = false }: { icon: string; active?: boolean; compact?: boolean }) {
  const strokeClassName = active ? 'stroke-current' : compact ? 'stroke-current' : 'stroke-current'
  const sizeClassName = compact ? 'h-4 w-4' : 'h-5 w-5'

  switch (icon) {
    case 'activity':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M4 13h4l2-5 4 10 2-5h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'approval':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M9 12.5l2 2 4-5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 3l7 4v5c0 4.2-2.7 7.5-7 9-4.3-1.5-7-4.8-7-9V7l7-4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'archive':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M3 7h18V4H3v3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10 12h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'bed':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M4 18v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M4 14h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M7 10V7h4v3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'desk':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M4 8h16v8H4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8 12h3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M6 20v-4M18 20v-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'door':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M7 20V5.5a1 1 0 0 1 .8-1L16 3v17" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M4 20h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12.5 11.5h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </svg>
      )
    case 'export':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M12 4v10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8.5 7.5L12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'guest':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M16 19v-1a4 4 0 0 0-8 0v1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'handoff':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M7 8h7a3 3 0 1 1 0 6H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M7 5 4 8l3 3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M17 19l3-3-3-3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M17 16h-7a3 3 0 1 1 0-6h5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'payment':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <rect height="14" rx="2" strokeWidth="1.8" width="18" x="3" y="5" />
          <path d="M3 10h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M7 15h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'report':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M6 20V10M12 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'request':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M6 7h12M6 12h8M6 17h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M4 4h16v16H4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'room':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M4 20V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9 10h.01M15 10h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
          <path d="M9 15h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    case 'settings':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M19 12a7 7 0 0 0-.08-1l2.03-1.58-2-3.46-2.42.8a7.2 7.2 0 0 0-1.73-1L14.5 3h-5l-.3 2.76a7.2 7.2 0 0 0-1.73 1l-2.42-.8-2 3.46L5.08 11A7 7 0 0 0 5 12c0 .34.03.67.08 1l-2.03 1.58 2 3.46 2.42-.8c.53.43 1.11.77 1.73 1L9.5 21h5l.3-2.76c.62-.23 1.2-.57 1.73-1l2.42.8 2-3.46L18.92 13c.05-.33.08-.66.08-1z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
        </svg>
      )
    case 'team':
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <path d="M16.5 19v-.8A3.7 3.7 0 0 0 12.8 14.5h-1.6a3.7 3.7 0 0 0-3.7 3.7v.8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M18.5 18.5v-.5a3 3 0 0 0-2.2-2.9M5.5 18.5v-.5a3 3 0 0 1 2.2-2.9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
    default:
      return (
        <svg aria-hidden="true" className={`${sizeClassName} ${strokeClassName}`} fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      )
  }
}

function renderNavLink(pathname: string, item: AppNavItem, count?: number) {
  const active = isActive(pathname, item.href)

  return (
    <Link
      key={item.href}
      className={`block rounded-[0.95rem] border px-2.5 py-2 transition ${
        active
          ? 'border-emerald-700 bg-[linear-gradient(135deg,_#166534,_#0f5f46)] text-white shadow-[0_18px_34px_-24px_rgba(15,95,70,0.6)]'
          : 'border-emerald-900/8 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'
      }`}
      href={item.href}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.8rem] ${
              active ? 'bg-white/14 text-white' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            <NavIcon active={active} icon={item.icon} />
          </span>
          <p className={`truncate text-[12px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>{item.label}</p>
        </div>
        {typeof count === 'number' ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              active ? 'bg-white/14 text-white' : 'bg-emerald-50 text-emerald-900'
            }`}
          >
            {count}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

function getActiveNavigationContext(pathname: string, navigationSections: ReturnType<typeof getNavigationSections>): ActiveNavigationContext | null {
  for (const section of navigationSections) {
    const matchingItem = section.items.find((item) => isActive(pathname, item.href))

    if (matchingItem) {
      return {
        item: matchingItem,
        siblingItems: section.items.filter((item) => item.href !== matchingItem.href),
        sectionTitle: section.title
      }
    }
  }

  return null
}

function renderQuickAction(pathname: string, item: AppNavItem, count?: number) {
  const active = isActive(pathname, item.href)
  const accent = getPaneAccent(item.href)

  return (
    <Link
      key={item.href}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
        active ? accent.activeQuickAction : 'border-emerald-800/10 bg-emerald-50/80 text-ink hover:bg-emerald-100'
      }`}
      href={item.href}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? 'bg-white/16 text-white' : 'bg-ink/8 text-ink'}`}>
        <NavIcon active={active} compact icon={item.icon} />
      </span>
      <span>{item.label}</span>
      {typeof count === 'number' ? renderCountBadge(item.href, count, active, true) : null}
    </Link>
  )
}

function getDefaultExpandedSections(shell: AppShellKind) {
  return shell === 'admin' ? new Set(['Command Center', 'Guests']) : new Set(['Desk', 'Requests'])
}

function isDesktopSectionExpanded(
  title: string,
  shell: AppShellKind,
  activeSectionTitle: string | undefined,
  expandedSections: Record<string, boolean>
) {
  if (activeSectionTitle === title) {
    return true
  }

  if (title in expandedSections) {
    return expandedSections[title]
  }

  return getDefaultExpandedSections(shell).has(title)
}

export function AppShell({ actionCounts, children, currentRole, currentUser, shell, summary }: AppShellProps) {
  const pathname = usePathname()
  const navigationSections = getNavigationSections(shell, currentRole)
  const activeContext = getActiveNavigationContext(pathname, navigationSections)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  return (
    <div className="min-h-screen bg-[#f9fffc] text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1720px] items-stretch">
        <aside className="sticky left-0 top-0 hidden h-screen w-[248px] shrink-0 overflow-hidden border-r border-ink/8 bg-white text-ink xl:flex xl:flex-col">
          <div className="border-b border-ink/8 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.32em] text-ink/50">University Hotel</p>
          </div>

          <div className="flex flex-1 flex-col justify-between px-3 py-3">
            <div>
              <div className="space-y-2">
                {navigationSections.map((section) => {
                  const isExpanded = isDesktopSectionExpanded(section.title, shell, activeContext?.sectionTitle, expandedSections)
                  const isLockedOpen = activeContext?.sectionTitle === section.title

                  return (
                    <section key={section.title} className="rounded-[0.9rem] border border-ink/8 bg-white px-2 py-2">
                      <button
                        className="flex w-full items-center justify-between gap-2 px-1 text-left"
                        disabled={isLockedOpen}
                        onClick={() => {
                          if (isLockedOpen) {
                            return
                          }

                          setExpandedSections((current) => {
                            const nextExpanded = !isDesktopSectionExpanded(section.title, shell, activeContext?.sectionTitle, current)

                            return Object.fromEntries(
                              navigationSections.map((navigationSection) => [
                                navigationSection.title,
                                navigationSection.title === section.title ? nextExpanded : false
                              ])
                            )
                          })
                        }}
                        type="button"
                      >
                        <span className="text-[9px] uppercase tracking-[0.18em] text-ink/42">{section.title}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-emerald-900 shadow-[inset_0_0_0_1px_rgba(15,61,46,0.06)]">{section.items.length}</span>
                          <span className={`text-[11px] text-ink/48 transition ${isExpanded ? 'rotate-180' : ''}`}>⌃</span>
                        </span>
                      </button>
                      {isExpanded ? <div className="mt-2 space-y-1.5">{section.items.map((item) => renderNavLink(pathname, item, actionCounts?.[item.href]))}</div> : null}
                    </section>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-ink/8 pt-3">
              <div className="rounded-[0.95rem] border border-ink/8 bg-white px-2.5 py-2.5 shadow-[0_14px_30px_-24px_rgba(15,61,46,0.24)]">
                <p className="text-[9px] uppercase tracking-[0.18em] text-ink/42">Signed in</p>
                <p className="mt-1 truncate text-[12px] font-semibold text-ink">{currentUser}</p>
              </div>
              <div className="mt-3">
                <AdminSessionActions currentUser={currentUser} showIdentity={false} />
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-ink/10 bg-[rgba(249,255,252,0.92)] backdrop-blur xl:hidden">
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">University Hotel</p>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {navigationSections.flatMap((section) => section.items).map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        active ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-emerald-800/12 bg-white text-ink hover:bg-emerald-50'
                      }`}
                      href={item.href}
                    >
                      <span className="inline-flex items-center gap-2">
                        <NavIcon active={active} compact icon={item.icon} />
                        <span>{item.label}</span>
                      </span>
                      {typeof actionCounts?.[item.href] === 'number' ? renderCountBadge(item.href, actionCounts[item.href] as number, active, true) : null}
                    </Link>
                  )
                })}
              </div>
              <div className="mt-4">
                <AdminSessionActions currentUser={currentUser} />
              </div>
            </div>
          </div>

          <div className="min-h-screen">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}