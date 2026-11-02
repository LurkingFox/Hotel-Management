# University Hotel HMS v2 Phase 1

## Phase 1 objective

Introduce the operational backbone required for a real hotel operating system while preserving current production workflows.

Phase 1 is intentionally not a full redesign. It adds the missing coordination and service-request layers that the current system lacks.

## Scope

Phase 1 includes:

1. service request domain
2. manager approval queue foundation
3. shift handoff foundation
4. notification taxonomy cleanup
5. table and pagination standardization plan
6. manager and reception navigation simplification plan

## Delivery principles

- expand the current model instead of replacing working flows
- keep Seam access, bookings, payments, and current reports intact
- use additive schema changes first
- expose new features beside existing ones until migration is safe
- keep receptionist and manager responsibilities explicit

## Implementation slices

### Slice 1. Service request engine

Goal:

Add a true request workflow that can later power guest self-service, reception logging, and manager oversight.

Database additions:

- service_requests
- service_request_events

Initial statuses:

- new
- acknowledged
- assigned
- in_progress
- completed
- cancelled

Initial categories:

- housekeeping
- maintenance
- laundry
- food
- minibar
- billing
- other

Initial priority levels:

- low
- normal
- high
- urgent

API surfaces:

- GET /api/service-requests
- POST /api/service-requests
- PATCH /api/service-requests

Initial UI surfaces:

- manager queue page
- reception request page
- request cards on Today page

Relationship to current service charges:

- keep service_charges for financial posting
- allow a service request to optionally produce a service charge when needed
- do not overload service_charges as the request system anymore

### Slice 2. Manager approvals

Goal:

Create a reusable approval model instead of one-off confirmation logic per feature.

Database additions:

- manager_approvals

Initial approval types:

- booking_extension
- service_receipt_confirmation
- refund_exception
- room_release_exception

UI surfaces:

- Today page approval queue
- approval summaries on dashboard

### Slice 3. Shift handoffs

Goal:

Create structured operational continuity between front-desk shifts.

Database additions:

- operational_handoffs
- operational_handoff_items

Initial data points:

- carryover guests
- unresolved requests
- payment risks
- VIP arrivals
- room issues

### Slice 4. Notification taxonomy

Goal:

Turn notifications into actionable operational signals.

Add categories or standard types for:

- approval_required
- request_created
- request_overdue
- request_completed
- guest_issue_reported
- device_offline
- balance_due

## New page map proposed for implementation

Manager:

- /admin/today
- /admin/guests
- /admin/rooms
- /admin/service-desk
- /admin/finance
- /admin/team
- /admin/insights
- /admin/settings

Reception:

- /reception/desk
- /reception/in-house
- /reception/requests
- /reception/payments
- /attendance

Phase 1 should not move everything at once. Start by adding the new pages beside the existing ones and switch navigation only when they become useful.

## Technical backlog order

### Step 1

Schema foundation:

- add service request enums and tables
- add approval table
- add handoff tables
- add indexes and foreign keys

### Step 2

Types and server helpers:

- regenerate or align Supabase types
- add service-request helper module
- add approval helper module

### Step 3

API layer:

- add service-request API routes
- unify notification creation for request events
- connect request completion to optional charge creation

### Step 4

UI rollout:

- add manager service desk page
- add reception requests page
- add Today widgets for urgent requests and approvals

### Step 5

Navigation cleanup:

- simplify admin shell
- reduce duplicate entry points
- preserve existing links behind transition labels until migration is stable

## Success criteria for phase 1

- guests and staff requests can be tracked as operational work, not only as charges
- manager can see pending approvals in one queue
- reception can hand off unresolved work between shifts
- current booking, payment, and access flows remain stable
- current reports still work while new data structures are introduced

## Immediate next implementation task

Start with Slice 1.

The next code change should be:

1. add Supabase migration for service request enums and tables
2. update type surface
3. add API route for service requests
4. add first manager and reception request screens