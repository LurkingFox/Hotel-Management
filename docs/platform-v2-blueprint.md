# University Hotel HMS v2 Blueprint

## Why v2 exists

The current system is operationally useful, but it is still centered on front-desk transactions and manager review pages. It does not yet behave like a full hotel operating system.

Current strengths:

- booking, room, payment, staff, and access workflows are functional
- Seam-backed guest access is live
- admin reporting, settings, and operational history exist
- receptionist and admin roles are separated

Current gaps:

- weak manager to front-desk coordination model
- no guest self-service layer
- no structured service request workflow beyond service charges
- no real guest identity and KYC model
- limited decision-ready analytics and charts
- too much navigation and too much parallel surface area for managers
- inconsistent table scaling patterns across data-heavy pages

## Product direction

v2 should become a three-sided hospitality operations platform:

1. manager command and control
2. front-desk execution
3. guest self-service and request handling

These must all feed the same operational truth and the same audit trail.

## Product pillars

### 1. Operations coordination

Hotels run on handoffs, approvals, exceptions, and follow-ups. The system needs structured coordination, not only records.

New capabilities:

- shift handoff logs
- approval queue for manager-owned decisions
- exception queue with severity and owner
- internal notes on bookings, rooms, guests, and requests
- SLA tracking for unresolved requests
- explicit task ownership

### 2. Guest self-service

Guests should be able to complete common hotel interactions without always calling or walking to reception.

Guest portal capabilities:

- housekeeping requests
- laundry requests
- food and minibar requests
- issue reporting
- extension request
- checkout assistance request
- bill summary view
- request tracking and status visibility
- room access validity visibility

### 3. Guest identity and KYC

Bookings cannot remain only name-plus-phone records.

Needed guest identity coverage:

- full legal name
- phone
- email
- nationality
- date of birth
- address
- ID type and number
- ID image or scan metadata
- emergency contact
- guest preferences
- watchlist or review flags

### 4. Manager intelligence

Reports should evolve into decision support.

Required analytics:

- occupancy rate
- ADR
- RevPAR
- average stay length
- extension rate
- cancellation rate
- outstanding balance aging
- payment mix
- service request volume and resolution time
- room turnaround time
- staff workload and shift coverage
- access failure rate

### 5. UI and information architecture

The product should move from navigation-heavy to context-heavy. Managers should open a command center, not a menu. Reception should open a working console, not a dashboard gallery.

## Role model

### Manager

Manager priorities:

- exceptions and approvals
- occupancy and finance health
- team accountability
- service quality
- risk and operational delays

### Front desk

Front-desk priorities:

- check-in and checkout
- booking adjustments
- payment collection
- guest support
- request logging and escalation

### Guest

Guest priorities:

- simple service access
- current-stay visibility
- fast issue reporting
- no unnecessary friction

## New information architecture

### Manager shell

Top-level areas:

1. Today
2. Guests
3. Rooms
4. Service Desk
5. Finance
6. Team
7. Insights
8. Settings

Mapping from current areas:

- Today: pending confirmations, due-outs, unresolved exceptions, urgent requests
- Guests: bookings, in-house guests, guest profiles, guest access
- Rooms: room board, maintenance state, readiness, room-device mapping
- Service Desk: guest requests, service execution, housekeeping, maintenance
- Finance: payments, receipts, balances, service-charge settlement
- Team: staff, shifts, handoffs, accountability history
- Insights: charts, trend boards, reports, exports
- Settings: hotel identity, branding, integrations, policies

### Reception shell

Top-level areas:

1. Desk
2. In-House
3. Requests
4. Payments
5. Attendance

### Guest portal

Top-level areas:

1. Stay home
2. Request service
3. Track requests
4. Access and stay info
5. Support

## New domain modules

### Service requests

This becomes a first-class domain, separate from financial service charges.

Core fields:

- source: guest_portal, reception, manager
- category: housekeeping, maintenance, food, laundry, minibar, billing, other
- priority: low, normal, high, urgent
- status: new, acknowledged, assigned, in_progress, completed, cancelled
- booking_id
- room_id
- guest_profile_id
- assigned_staff_id
- due_at
- resolved_at
- resolution_note

### Manager approvals

Approvals should cover cases like:

- stay extensions
- refunds or waivers
- disputed service costs
- late checkout exceptions
- blocked room release

### Handoffs

Front-desk shift changes need structured carryover:

- unresolved guest issues
- pending approvals
- VIP arrivals
- balance risks
- room readiness concerns

## Data model additions

Recommended new tables:

- guest_profiles
- guest_identity_documents
- guest_preferences
- guest_flags
- service_requests
- service_request_events
- service_request_messages
- manager_approvals
- operational_handoffs
- guest_portal_sessions
- room_maintenance_tickets
- dashboard_snapshots or materialized KPI views

## Guest portal architecture

The guest portal should be a dedicated guest-facing surface, not a reduced copy of the admin UI.

Design principles:

- simple touch-first interface
- hosted for hotel LAN access, but cloud-synced
- QR and short-link fallback even if captive portal auto-open does not trigger
- tied to active stay identity, not only to a door code

Authentication options, preferred order:

1. guest portal token generated at check-in
2. QR link tied to active booking access credential
3. Seam access code plus surname or phone fragment as fallback

Do not rely on Seam code alone as the only guest portal authentication factor.

## Design direction

The product should feel like hospitality operations software, not generic SaaS.

Desired traits:

- calm under pressure
- strong scanning hierarchy
- fewer simultaneous choices
- clear urgency and status semantics
- better mobile support for desk and guest flows

Visual direction:

- fewer decorative panels
- tighter role-based shells
- stronger command-center layout for managers
- operational console layout for reception
- premium hospitality palette and typography

## Delivery strategy

The overhaul should not start with charts or cosmetics. It should start with the operating model.

Implementation order:

1. operations backbone
2. guest identity and KYC
3. guest self-service portal
4. manager analytics
5. full UI redesign pass

## Immediate v2 goal

The first concrete target is to introduce a service request system and supporting operations backbone without breaking current booking, payment, access, or reporting flows.