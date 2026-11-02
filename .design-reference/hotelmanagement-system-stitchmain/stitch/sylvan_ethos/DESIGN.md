# Design System Strategy: The Curated Sanctuary

## 1. Overview & Creative North Star
The hospitality industry is often chaotic; the tools used to manage it should be the opposite. This design system is built on the Creative North Star of **"The Digital Concierge."** We are moving away from the "dashboard" aesthetic and toward a high-end editorial experience. 

The goal is to create a sense of **Organic Order**. We achieve this by breaking the rigid, boxy constraints of traditional SaaS through intentional asymmetry, generous breathing room (white space), and a tactile, layered approach to surfaces. This system should feel like a well-organized physical desk in a boutique hotel—composed, premium, and inherently calm.

---

## 2. Color & Tonal Depth
Our palette is rooted in the earth. It is designed to reduce cognitive load and visual fatigue for staff who use the platform for hours.

### The "No-Line" Rule
**Strict Mandate:** 1px solid borders for sectioning are prohibited. Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background provides all the separation necessary. We rely on the eye’s ability to perceive tonal change rather than drawing "cages" around data.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine, heavy-weight paper.
*   **Base Layer:** `surface` (#fbf9f4) for the main canvas.
*   **Secondary Context:** Use `surface-container-low` (#f5f3ee) for large sidebars or secondary content areas.
*   **Interactive Focus:** Use `surface-container-lowest` (#ffffff) for the most important cards or active input areas to provide a "lifted" feel.

### The "Glass & Gradient" Rule
To add a signature "soul" to the UI, use subtle linear gradients for primary actions. Instead of a flat #4d6054, transition from `primary` to `primary_container` at a 135-degree angle. For floating overlays (like guest profile quick-views), utilize **Glassmorphism**: a semi-transparent `surface` color with a `backdrop-filter: blur(20px)`. This makes the UI feel integrated and airy.

---

## 3. Typography: Editorial Authority
We pair the intellectual, high-contrast personality of **Fraunces** with the approachable utility of **DM Sans** (mapped to Manrope/Noto Serif tokens for technical implementation).

*   **Display & Headlines (`notoSerif` / Fraunces):** These are our "Editorial Moments." Use `display-lg` (3.5rem) for high-impact landing areas and `headline-md` (1.75rem) for section headers. The variable weight of Fraunces should be used to emphasize luxury—don't be afraid of the "Soft" or "Italic" styles for secondary emphasis.
*   **UI & Body (`manrope` / DM Sans):** All functional data, labels, and long-form text use this sans-serif. It provides the clarity needed for room numbers, guest names, and pricing.
*   **The Hierarchy Rule:** Never use two different sizes of Fraunces in the same immediate visual cluster. Pair a Fraunces headline with a DM Sans sub-headline to maintain a clean, sophisticated contrast.

---

## 4. Elevation & Depth
In this system, elevation is a feeling, not a drop shadow.

*   **Tonal Layering:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-high` section creates a natural, soft lift.
*   **Ambient Shadows:** When a "floating" effect is required (e.g., a modal or dropdown), shadows must be extra-diffused. Use a 24px to 48px blur with a 4-6% opacity. The shadow color must be a **tinted taupe** (derived from `on_surface_variant`), never pure black or grey.
*   **The "Ghost Border" Fallback:** If accessibility requirements demand a border, use the `outline_variant` token at 15% opacity. It should be felt, not seen.
*   **Roundedness:** Stick to the `lg` (2rem) and `md` (1.5rem) tokens for main containers. This "Organic" radius is central to the stress-reducing mission of the system.

---

## 5. Components & Primitives

### Buttons (The Tactile Touch)
*   **Primary:** A soft gradient of `primary` to `primary_container`. Border radius: `full`.
*   **Secondary:** `secondary_fixed` (#ffdbce) background with `on_secondary_fixed` text. This terracotta accent should be used sparingly for high-value conversions (e.g., "Book Now").
*   **Tertiary:** Ghost style. No background, no border. Only `primary` text.

### Cards & Lists (The Editorial Layout)
*   **The Divider Ban:** Do not use line dividers between list items. Instead, use a `3` (1rem) or `4` (1.4rem) spacing increment to create separation through negative space.
*   **Card Styling:** Use `surface-container-low` with a border-radius of `lg` (2rem). No borders.

### Input Fields
*   **Style:** Minimalist. Use `surface_container_highest` as a subtle fill. When focused, transition to a `primary` "Ghost Border" (20% opacity) and shift the background to `surface_container_lowest`.

### Signature Component: The "Status Bloom"
Instead of harsh red/green status dots, use soft, pill-shaped chips with 10% opacity backgrounds of the status color (e.g., `error_container` for "Occupied") and high-contrast text.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical layouts. A left-aligned headline paired with a right-aligned card creates a premium, curated feel.
*   **Do** embrace white space. If a screen feels "busy," double the spacing scale value (e.g., move from `8` to `16`).
*   **Do** use the `secondary` terracotta accent only for "warm" interactions—welcoming a guest, confirming a booking, or high-priority notifications.

### Don't
*   **Don't** use 100% black (#000000). Use `on_surface` (#1b1c19) for all text to maintain the organic, soft-black feel.
*   **Don't** use the `full` radius on everything. Keep it for buttons and chips. Use `lg` or `md` for functional containers to maintain structure.
*   **Don't** cram data. If a table has more than 6 columns, use a "Detail View" pattern to hide secondary information. This platform must never feel like a spreadsheet.

---

*Director’s Note: This system is a living organism. When in doubt, ask: "Does this feel like a quiet morning in a luxury suite, or a noisy office?" Aim for the former.*