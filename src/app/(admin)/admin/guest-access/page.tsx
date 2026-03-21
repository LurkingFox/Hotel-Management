import { redirect } from 'next/navigation'

import { AdminGuestAccessClient } from '@/app/(admin)/admin/guest-access/admin-guest-access-client'
import { getAccessMigrationState } from '@/lib/access-provider/config'
import {
  applyGuestAccessFilters,
  buildGuestAccessQueryString,
  getMatchingGuestAccessBookingIds,
  getMatchingGuestAccessRoomIds,
  parseGuestAccessStatus,
  type GuestAccessFilters
} from '@/lib/admin-history/guest-access'
import { getPage, getSingleParam, isDateInput } from '@/lib/admin-history/shared'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type RoomAccessDeviceRow = Database['public']['Tables']['room_access_devices']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']
type AccessCredentialStatus = 'active' | 'revoked'

type AccessCredentialWithRelations = AccessCredentialRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type GuestAccessSearchParams = {
  from?: string | string[]
  page?: string | string[]
  query?: string | string[]
  status?: string | string[]
  to?: string | string[]
}

const PAGE_SIZE = 12

export default async function AdminGuestAccessPage({ searchParams }: { searchParams?: GuestAccessSearchParams }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()
  const migrationState = getAccessMigrationState()

  if (!user) {
    redirect('/login')
  }

  const query = getSingleParam(searchParams?.query).trim()
  const fromDate = getSingleParam(searchParams?.from)
  const toDate = getSingleParam(searchParams?.to)
  const statusParam = getSingleParam(searchParams?.status)
  const requestedPage = getPage(searchParams?.page)
  const status: 'all' | AccessCredentialStatus = parseGuestAccessStatus(statusParam)

  const filters: GuestAccessFilters = {
    fromDate: isDateInput(fromDate) ? fromDate : '',
    query,
    status,
    toDate: isDateInput(toDate) ? toDate : ''
  }

  const roomIds = await getMatchingGuestAccessRoomIds(supabase, filters.query)
  const bookingIds = await getMatchingGuestAccessBookingIds(supabase, filters.query, roomIds)
  const rangeFrom = (requestedPage - 1) * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  let credentialsQuery = supabase
    .from('booking_access_credentials')
    .select('*, bookings(id, guest_name, status, check_in, check_out_expected), rooms(id, number, type, status)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  credentialsQuery = applyGuestAccessFilters(credentialsQuery, filters, bookingIds, roomIds)

  const [credentialsResponse, summaryResponse, roomsResponse, liveCoverageResponse, deviceMappingsResponse] = await Promise.all([
    credentialsQuery,
    applyGuestAccessFilters(supabase.from('booking_access_credentials').select('status, provider, provider_status, room_id'), filters, bookingIds, roomIds),
    supabase.from('rooms').select('*').order('number'),
    supabase.from('booking_access_credentials').select('room_id, provider, status').eq('status', 'active'),
    supabase.from('room_access_devices').select('room_id, external_device_id, display_name').eq('provider', 'seam')
  ])

  if (credentialsResponse.error) {
    throw new Error(credentialsResponse.error.message)
  }

  if (summaryResponse.error) {
    throw new Error(summaryResponse.error.message)
  }

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message)
  }

  if (liveCoverageResponse.error) {
    throw new Error(liveCoverageResponse.error.message)
  }

  if (deviceMappingsResponse.error) {
    throw new Error(deviceMappingsResponse.error.message)
  }

  const totalCount = credentialsResponse.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(requestedPage, totalPages)

  if (safePage !== requestedPage) {
    const queryString = buildGuestAccessQueryString(filters, safePage)
    redirect(queryString ? `/admin/guest-access?${queryString}` : '/admin/guest-access')
  }

  const rooms = (roomsResponse.data ?? []) as RoomRow[]
  const summaryRows = (summaryResponse.data ?? []) as Array<Pick<AccessCredentialRow, 'room_id' | 'status'> & { provider?: string | null; provider_status?: string | null }>
  const liveCoverageRows = (liveCoverageResponse.data ?? []) as Array<Pick<AccessCredentialRow, 'room_id' | 'status'> & { provider?: string | null }>
  const deviceMappings = (deviceMappingsResponse.data ?? []) as Array<Pick<RoomAccessDeviceRow, 'display_name' | 'external_device_id' | 'room_id'>>
  const mappingByRoomId = new Map(deviceMappings.map((mapping) => [mapping.room_id, mapping]))

  const roomCoverage = rooms.map((room) => ({
    activeCredentials: liveCoverageRows.filter((credential) => credential.room_id === room.id).length,
    mappedDeviceId: mappingByRoomId.get(room.id)?.external_device_id ?? null,
    mappedDeviceName: mappingByRoomId.get(room.id)?.display_name ?? null,
    room
  }))

  return (
    <AdminGuestAccessClient
      activeProvider={migrationState.bookingOperationsProvider}
      currentPage={safePage}
      filters={filters}
      credentials={(credentialsResponse.data ?? []) as AccessCredentialWithRelations[]}
      roomCoverage={roomCoverage}
      summary={{
        active: summaryRows.filter((credential) => credential.status === 'active').length,
        legacyRfid: summaryRows.filter((credential) => credential.provider === 'local_rfid').length,
        revoked: summaryRows.filter((credential) => credential.status === 'revoked').length,
        roomsCovered: new Set(summaryRows.map((credential) => credential.room_id).filter(Boolean)).size,
        seam: summaryRows.filter((credential) => credential.provider === 'seam').length,
        warnings: summaryRows.filter((credential) => credential.provider_status === 'error' || credential.provider_status === 'warning').length
      }}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}