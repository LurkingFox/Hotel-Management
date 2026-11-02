# Design System Specification: The Executive Concierge

## 1. Overview & Creative North Star
**The Creative North Star: "The Digital Curator"**

This design system rejects the frantic, high-density clutter of traditional "SaaS dashboards." Instead, it adopts the poise of a high-end boutique hotel’s physical ledger. We aim for an experience that feels like a "Boutique Hotel Executive Command Center"—authoritative, calm, and curated. 

The aesthetic breaks the "template" look through **Intentional Asymmetry**. Rather than a rigid 12-column grid, we use expansive margins and off-center focal points. By layering warm parchment textures with deep midnight anchors, we create a digital environment that feels more like an editorial layout than a software interface.

---

## 2. Colors & Tonal Architecture
The palette transitions from the deep, nocturnal weight of a private study to the airy, sun-drenched warmth of a lobby lounge.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. Use `surface-container-low` (#f6f3ee) for large background sections and `surface-container` (#f0ede8) for interactive regions. Separating content with a line is a failure of spacing; use the **8px (3)** or **16px (4)** spacing tokens instead.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of fine stationery.
*   **Base:** `surface` (#fcf9f4) — The primary canvas.
*   **Secondary Layer:** `surface-container-low` (#f6f3ee) — For sidebars or secondary navigation.
*   **Actionable Layer:** `surface-container-lowest` (#ffffff) — For cards or modal content, creating a subtle "lift" against the parchment background.

### The "Glass & Gradient" Rule
To avoid a flat, "Bootstrap" feel, floating elements (like dropdowns or floating action buttons) should use **Glassmorphism**. Apply `surface-container-lowest` at 85% opacity with a `backdrop-blur` of 12px. For primary CTA backgrounds, use a subtle linear gradient from `primary` (#000000) to `primary_container` (#131b2e) to give the deep navy a sense of physical depth and "soul."

---

## 3. Typography: The Editorial Voice
We contrast the heritage of a serif with the clinical precision of a geometric sans.

*   **Display & Headlines (`notoSerif`):** Used for storytelling and high-level summaries. These should be set with tight letter-spacing (-0.02em) to feel like a premium magazine masthead.
*   **Titles & Body (`manrope`):** Used for operational data. *Manrope* provides the geometric clarity required for room numbers, guest names, and timestamps.
*   **The Hierarchy of Authority:**
    *   **Display-LG (3.5rem):** Reserved for singular hero numbers (e.g., "98% Occupancy").
    *   **Label-SM (0.6875rem):** Used for technical metadata, always in All-Caps with +0.05em tracking to ensure "Command Center" readability.

---

## 4. Elevation & Depth
We eschew traditional "box-shadows" in favor of **Tonal Layering**.

### The Layering Principle
Depth is achieved by "stacking" surface tiers. Place a `surface-container-lowest` card (Pure White) on a `surface-container-low` (Parchment) section. This creates a natural, soft lift that mimics the way light hits layered paper.

### Ambient Shadows
When a physical "float" is required (e.g., a guest profile modal), use **Ambient Shadows**:
*   **Color:** 8% opacity of `on-surface` (#1c1c19).
*   **Blur:** 24px - 40px.
*   **Offset:** 8px downward.
The shadow must feel like a soft glow of dark ink, not a harsh grey drop-shadow.

### The "Ghost Border" Fallback
If accessibility requires a border, use a **Ghost Border**: `outline-variant` (#c6c6cd) at **15% opacity**. This provides a guide for the eye without creating a visual cage.

---

## 5. Components

### Buttons
*   **Primary:** Deep `primary_container` (#131b2e) background, `on-primary` (#ffffff) text. Use `md` (0.375rem) rounding. No border.
*   **Secondary:** `surface-container-highest` (#e5e2dd) background. High-contrast `on-surface` text.
*   **Tertiary/Ghost:** No background. Underlined with a 2px `secondary` (#9b4500) stroke on hover only.

### Cards & Lists
*   **Forbidden:** Divider lines between list items.
*   **Standard:** Use `1.4rem (4)` vertical padding between items. Differentiate the "active" item by shifting the background to `surface-container-high` (#ebe8e3) and adding a 4px vertical "accent bar" of `secondary` (#9b4500) on the left edge.

### Input Fields
*   **Style:** Minimalist. No background fill. Only a bottom border using `outline` (#76777d) at 30% opacity. 
*   **Focus State:** The bottom border transitions to `secondary` (#9b4500) with a subtle 4px "glow" (ambient shadow).

### Specialized Component: The "Status Seal"
Instead of generic badges, use a "Seal" for status (e.g., "VIP," "Check-out"). It uses the `tertiary_fixed` (#ffdea5) background with `on_tertiary_fixed_variant` (#5d4201) text, set in `label-sm` All-Caps. It should look like a wax seal or a premium luggage tag.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Negative Space:** If a screen feels "empty," leave it. Premium experiences breathe.
*   **Use Intentional Asymmetry:** Align the main headline to the left, but place the primary action button on a floating "island" on the right.
*   **Monochrome Data:** Keep charts and graphs in scales of `primary` and `primary_container`, using `secondary` (Terracotta) only for critical alerts.

### Don’t:
*   **No Default Grids:** Do not let elements span 100% width unless they are images. Limit text measure to 60-70 characters for readability.
*   **No High-Contrast Borders:** Never use a 100% opaque border to separate the sidebar from the main content. Use a background color shift instead.
*   **No "App-y" Icons:** Avoid bubbly, rounded icons. Use thin-stroke (1.5pt), sharp-cornered icons that feel like architectural drawings.

### Accessibility Note:
While we utilize soft tonal shifts, always ensure that `on-surface` text against `surface-container` tiers maintains a minimum contrast ratio of 4.5:1. When using the Sandstone neutrals, prioritize `title-md` weight to maintain legibility.