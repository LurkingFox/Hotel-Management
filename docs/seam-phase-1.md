# Seam Phase 1

This repository is now in the first migration stage from local RFID access control to Seam.

## What Phase 1 Does

- adds an access-provider layer for booking access issuance, extension, and revocation
- keeps live booking operations on the existing RFID-backed keycard flow
- adds verified Seam webhook intake using Svix signatures
- surfaces provider migration state in booking UIs
- documents the environment contract needed for the next phases

## What Phase 1 Does Not Do Yet

- does not cut booking check-in or checkout over to Seam-issued credentials
- does not replace the local keycards table
- does not replace the local controller dashboard
- does not migrate the admin keycards screen to provider-agnostic lock management

## Environment Contract

- `ACCESS_PROVIDER_TARGET`
  - allowed values: `local_rfid`, `seam`
  - default behavior is `local_rfid` when omitted
  - in Phase 1, this is a migration target flag and not a booking cutover switch
- `SEAM_API_KEY`
  - required for future Seam device and access-code operations
- `SEAM_WEBHOOK_SECRET`
  - required now for verifying webhook deliveries to `/api/seam/webhooks`
- `SEAM_ROOM_DEVICE_MAP_JSON`
  - JSON object keyed by hotel room number to Seam device ID
  - example: `{ "101": "device_abc", "102": "device_def" }`
- `SUPABASE_SERVICE_ROLE_KEY`
  - optional in Phase 1
  - if present, verified Seam webhooks are persisted to `notifications`
  - if absent, the webhook route still verifies the payload and returns `202` without persisting

## Operational Guidance

- keep booking issuance on the current RFID flow during Phase 1
- connect and validate the Seam webhook endpoint before attempting cutover
- prepare room-to-device mapping in `SEAM_ROOM_DEVICE_MAP_JSON`
- plan schema changes for provider-agnostic credentials and device identities in Phase 2