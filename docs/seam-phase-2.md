# Seam Phase 2

Phase 2 cuts live booking access issuance over from local RFID keycards to Seam access codes when `ACCESS_PROVIDER_TARGET=seam` and `SEAM_API_KEY` is configured.

## What Changed

- booking check-in, stay extension, and checkout now run through the provider abstraction instead of writing only to `keycards`
- Seam-backed bookings create, update, and revoke real Seam access codes through the official SDK
- issued guest credentials are persisted in `booking_access_credentials`
- room-to-device mappings are persisted in `room_access_devices`
- `SEAM_ROOM_DEVICE_MAP_JSON` can still be used as a bootstrap source and is written through to the persistent room mapping table on first use
- admin settings now include a Seam room-to-device manager with a "Sync env mappings to Supabase" action
- booking and reception clients now switch between manual RFID entry and auto-generated Seam codes based on the active provider

## New Tables

### `booking_access_credentials`

Stores the provider-agnostic record of every issued guest credential.

- `provider`: `local_rfid` or `seam`
- `provider_reference`: external provider record, such as a Seam `access_code_id`
- `provider_device_id`: mapped Seam device ID
- `credential_code`: guest-facing code when available
- `local_keycard_id`: legacy linkage for RFID-issued records
- `status`: `active` or `revoked`

### `room_access_devices`

Stores the room-to-provider-device mapping used for live Seam issuance.

- one row per hotel room
- currently supports provider `seam`
- populated from `SEAM_ROOM_DEVICE_MAP_JSON` on first live use if no row exists yet

## Runtime Requirements

- `ACCESS_PROVIDER_TARGET=seam`
- `SEAM_API_KEY` set
- at least one room mapping available either:
  - already persisted in `room_access_devices`, or
  - present in `SEAM_ROOM_DEVICE_MAP_JSON`

## Admin Workflow

- open `/admin/settings`
- review or edit the Seam device ID assigned to each room
- use "Sync env mappings to Supabase" to push the current `SEAM_ROOM_DEVICE_MAP_JSON` values into `room_access_devices`
- after the first sync, ongoing operations read from Supabase-backed mappings instead of depending only on deploy-time JSON

`SEAM_WEBHOOK_SECRET` is still required for verified webhook intake on `/api/seam/webhooks`.

## Current Limitations

- admin keycard registry and access log surfaces are still RFID-shaped and have not yet been redesigned into provider-agnostic lock-management screens
- legacy `validate_keycard`, `report_controller_status`, and the Raspberry Pi `rfid-controller` remain in the repo and are not yet retired
- Seam webhook events are verified and can be persisted, but they are not yet reconciling `booking_access_credentials` state transitions

## Suggested Next Phase

- replace or repurpose the keycards/admin access surfaces into a provider-agnostic locks and credentials console
- wire Seam webhook lifecycle events back into local credential status updates
- begin retirement of the legacy RFID validation and controller heartbeat path once the hotel is fully cut over