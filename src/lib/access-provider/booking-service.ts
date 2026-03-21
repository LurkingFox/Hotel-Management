import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import { getAccessMigrationState } from '@/lib/access-provider/config'
import { getSeamConfig } from '@/lib/access-provider/seam'
import { Seam } from 'seam'

import type {
  BookingAccessExtendInput,
  BookingAccessIssueInput,
  BookingAccessOperationResult,
  BookingAccessRevokeInput,
  BookingAccessService
} from '@/lib/access-provider/types'

type SupabaseClient = Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase']

type RoomAccessDeviceRow = {
  display_name: string | null
  external_device_id: string
  id: string
  provider: 'seam'
  room_id: string
}

type BookingAccessCredentialRow = {
  credential_code: string | null
  id: string
  note: string | null
  provider: 'local_rfid' | 'seam'
  provider_device_id: string | null
  provider_reference: string | null
  room_id: string | null
  status: 'active' | 'revoked'
}

function toAccessWindowStart(value: string) {
  return `${value}T00:00:00.000Z`
}

function toAccessWindowEnd(value: string) {
  return `${value}T23:59:59.000Z`
}

function buildCredentialResult(
  provider: 'seam',
  details: Partial<Omit<BookingAccessOperationResult, 'provider'>> = {}
): BookingAccessOperationResult {
  return {
    credentialCode: details.credentialCode ?? null,
    credentialLabel: details.credentialLabel ?? (provider === 'seam' ? 'access code' : 'keycard'),
    externalRecordId: details.externalRecordId ?? null,
    localRecordId: details.localRecordId ?? null,
    note: details.note ?? null,
    provider,
    roomDeviceId: details.roomDeviceId ?? null
  }
}

async function createAccessCredentialRecord(
  supabase: SupabaseClient,
  values: {
    bookingId: string
    credentialCode?: string | null
    issuedBy?: string | null
    issuedTo?: string | null
    note?: string | null
    provider: 'seam'
    providerDeviceId?: string | null
    providerReference?: string | null
    roomId?: string | null
    validFrom?: string | null
    validUntil?: string | null
  }
) {
  const { data, error } = await supabase
    .from('booking_access_credentials')
    .insert({
      booking_id: values.bookingId,
      credential_code: values.credentialCode ?? null,
      issued_by: values.issuedBy ?? null,
      issued_to: values.issuedTo ?? null,
      note: values.note ?? null,
      provider: values.provider,
      provider_device_id: values.providerDeviceId ?? null,
      provider_reference: values.providerReference ?? null,
      room_id: values.roomId ?? null,
      status: 'active',
      valid_from: values.validFrom ?? null,
      valid_until: values.validUntil ?? null
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data?.id ?? null
}

async function resolveSeamRoomDevice(supabase: SupabaseClient, roomId: string | null) {
  if (!roomId) {
    throw new Error('Room assignment is required before issuing Seam access.')
  }

  const { data: persistedDevice, error: persistedDeviceError } = await supabase
    .from('room_access_devices')
    .select('id, room_id, provider, external_device_id, display_name')
    .eq('room_id', roomId)
    .eq('provider', 'seam')
    .maybeSingle<RoomAccessDeviceRow>()

  if (persistedDeviceError) {
    throw new Error(persistedDeviceError.message)
  }

  if (persistedDevice) {
    return persistedDevice
  }

  const { data: room, error: roomError } = await supabase.from('rooms').select('id, number').eq('id', roomId).single()

  if (roomError || !room) {
    throw new Error(roomError?.message ?? 'Room not found for Seam access issuance.')
  }

  const mappedDeviceId = getSeamConfig().roomDeviceMap[room.number]

  if (!mappedDeviceId) {
    throw new Error(`No Seam device mapping found for room ${room.number}.`)
  }

  return {
    display_name: null,
    external_device_id: mappedDeviceId,
    id: '',
    provider: 'seam' as const,
    room_id: room.id
  }
}

async function upsertSeamRoomDevice(
  supabase: SupabaseClient,
  values: { displayName: string | null; externalDeviceId: string; roomId: string }
) {
  const { data, error } = await supabase
    .from('room_access_devices')
    .upsert(
      {
        display_name: values.displayName,
        external_device_id: values.externalDeviceId,
        provider: 'seam',
        room_id: values.roomId,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'room_id' }
    )
    .select('id, room_id, provider, external_device_id, display_name')
    .single<RoomAccessDeviceRow>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function listActiveAccessCredentials(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase
    .from('booking_access_credentials')
    .select('id, provider, provider_reference, provider_device_id, credential_code, note, room_id, status')
    .eq('booking_id', bookingId)
    .eq('status', 'active')
    .returns<BookingAccessCredentialRow[]>()

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

function createSeamClient() {
  const migrationState = getAccessMigrationState()

  if (!migrationState.seamApiKey) {
    throw new Error('SEAM_API_KEY must be configured before using Seam booking access.')
  }

  return new Seam({ apiKey: migrationState.seamApiKey })
}

function createSeamBookingAccessService(supabase: SupabaseClient): BookingAccessService {
  return {
    provider: 'seam',

    async issueBookingAccess(input: BookingAccessIssueInput): Promise<BookingAccessOperationResult> {
      const seam = createSeamClient()
      const roomDevice = await resolveSeamRoomDevice(supabase, input.roomId)
      const device = await seam.devices.get({ device_id: roomDevice.external_device_id })

      if (!device.can_program_online_access_codes) {
        throw new Error(`Seam device ${device.display_name} cannot program online access codes.`)
      }

      const persistedDevice = await upsertSeamRoomDevice(supabase, {
        displayName: device.display_name,
        externalDeviceId: device.device_id,
        roomId: roomDevice.room_id
      })

      const accessCode = await seam.accessCodes.create({
        device_id: device.device_id,
        ends_at: toAccessWindowEnd(input.validUntil),
        name: `${input.issuedTo} · Room access`,
        starts_at: toAccessWindowStart(input.validFrom)
      })

      const localRecordId = await createAccessCredentialRecord(supabase, {
        bookingId: input.bookingId,
        credentialCode: accessCode.code,
        issuedBy: input.issuedBy,
        issuedTo: input.issuedTo,
        note: persistedDevice.display_name ?? device.display_name,
        provider: 'seam',
        providerDeviceId: device.device_id,
        providerReference: accessCode.access_code_id,
        roomId: input.roomId,
        validFrom: toAccessWindowStart(input.validFrom),
        validUntil: toAccessWindowEnd(input.validUntil)
      })

      return buildCredentialResult('seam', {
        credentialCode: accessCode.code,
        credentialLabel: 'access code',
        externalRecordId: accessCode.access_code_id,
        localRecordId,
        note: persistedDevice.display_name ?? device.display_name,
        roomDeviceId: device.device_id
      })
    },

    async extendBookingAccess(input: BookingAccessExtendInput): Promise<BookingAccessOperationResult> {
      const seam = createSeamClient()
      const activeCredentials = await listActiveAccessCredentials(supabase, input.bookingId)
      const seamCredentials = activeCredentials.filter(
        (credential) => credential.provider === 'seam' && credential.provider_reference
      )

      for (const credential of seamCredentials) {
        const accessCodeId = credential.provider_reference

        if (!accessCodeId) {
          continue
        }

        await seam.accessCodes.update({
          access_code_id: accessCodeId,
          device_id: credential.provider_device_id ?? undefined,
          ends_at: toAccessWindowEnd(input.validUntil)
        })
      }

      const { error } = await supabase
        .from('booking_access_credentials')
        .update({ updated_at: new Date().toISOString(), valid_until: toAccessWindowEnd(input.validUntil) })
        .eq('booking_id', input.bookingId)
        .eq('provider', 'seam')
        .eq('status', 'active')

      if (error) {
        throw new Error(error.message)
      }

      const activeCredential = seamCredentials[0] ?? null

      return buildCredentialResult('seam', {
        credentialCode: activeCredential?.credential_code ?? null,
        externalRecordId: activeCredential?.provider_reference ?? null,
        localRecordId: activeCredential?.id ?? null,
        note: activeCredential?.note ?? null,
        roomDeviceId: activeCredential?.provider_device_id ?? null
      })
    },

    async revokeBookingAccess(input: BookingAccessRevokeInput): Promise<BookingAccessOperationResult> {
      const seam = createSeamClient()
      const activeCredentials = await listActiveAccessCredentials(supabase, input.bookingId)
      const seamCredentials = activeCredentials.filter(
        (credential) => credential.provider === 'seam' && credential.provider_reference
      )

      for (const credential of seamCredentials) {
        const accessCodeId = credential.provider_reference

        if (!accessCodeId) {
          continue
        }

        await seam.accessCodes.delete({
          access_code_id: accessCodeId,
          device_id: credential.provider_device_id ?? undefined
        })
      }

      const { error } = await supabase
        .from('booking_access_credentials')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('booking_id', input.bookingId)
        .eq('provider', 'seam')
        .eq('status', 'active')

      if (error) {
        throw new Error(error.message)
      }

      const activeCredential = seamCredentials[0] ?? null

      return buildCredentialResult('seam', {
        credentialCode: activeCredential?.credential_code ?? null,
        externalRecordId: activeCredential?.provider_reference ?? null,
        localRecordId: activeCredential?.id ?? null,
        note: activeCredential?.note ?? null,
        roomDeviceId: activeCredential?.provider_device_id ?? null
      })
    }
  }
}

export function createBookingAccessService(supabase: SupabaseClient) {
  return createSeamBookingAccessService(supabase)
}