export type AccessProviderTarget = 'local_rfid' | 'seam'

export type BookingAccessPresentation = {
  credentialKindLabel: string
  generatedCredentialLabel: string
  manualCredentialLabel: string
  manualCredentialPlaceholder: string
  providerLabel: string
  requiresManualCredential: boolean
  statusNote: string | null
}

export type BookingAccessIssueInput = {
  bookingId: string
  issuedBy: string
  issuedTo: string
  manualCredential?: string | null
  roomId: string | null
  validFrom: string
  validUntil: string
}

export type BookingAccessExtendInput = {
  bookingId: string
  validUntil: string
}

export type BookingAccessRevokeInput = {
  bookingId: string
}

export type BookingAccessOperationResult = {
  credentialCode: string | null
  credentialLabel: string
  externalRecordId: string | null
  localRecordId: string | null
  note: string | null
  provider: AccessProviderTarget
  roomDeviceId: string | null
}

export type BookingAccessService = {
  extendBookingAccess(input: BookingAccessExtendInput): Promise<BookingAccessOperationResult>
  issueBookingAccess(input: BookingAccessIssueInput): Promise<BookingAccessOperationResult>
  provider: AccessProviderTarget
  revokeBookingAccess(input: BookingAccessRevokeInput): Promise<BookingAccessOperationResult>
}