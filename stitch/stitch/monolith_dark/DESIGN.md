# Design System Strategy: Developer-Centric Precision

## 1. Overview & Creative North Star: "The Monolithic Logic"
This design system is built for high-performance developer tools where the interface must vanish to let the code and logic stand front-and-center. Our Creative North Star is **"The Monolithic Logic."** Unlike consumer apps that rely on depth and "fluff," this system treats the UI as a single, high-precision instrument carved from dark matter.

We break the "standard" dashboard template by utilizing **Extreme Negative Space** and **Asymmetric Information Density**. By intentionally grouping functional elements in tight clusters (High-Density) surrounded by vast areas of `#0e0e0e` (Low-Density), we create a rhythmic flow that guides a developer's eye to critical actions without the need for intrusive visual cues.

## 2. Colors: The Void and The Signal
The palette is a study in restrained power. We utilize a "Zero-G" approach to color where backgrounds are near-black to reduce eye strain, and color is used exclusively as a "Signal" for state and intent.

### Core Palette
*   **Surface-Level 0 (The Void):** `#000000` (`surface_container_lowest`). Used for the deepest background layers and primary layout containers to maximize contrast with text.
*   **Surface-Level 1 (The Base):** `#0e0e0e` (`surface`). The standard background for authentication screens and primary dashboard views.
*   **The Signal:** `#adc6ff` (`primary`). A crisp, electric blue reserved for critical actions and active states. It must never be used for decorative elements.

### The "Precision Line" Rule
Contrary to standard material layering, we prohibit the use of elevation shadows. Boundaries are defined strictly by:
1.  **The 1px Rule:** Use `outline_variant` (`#484848`) at 100% opacity for 1px borders. This provides the "Vercel-style" crispness that developers associate with high-end tooling.
2.  **Tonal Shifts:** Transitioning from `surface` (#0e0e0e) to `surface_container_low` (#131313) to denote section changes.

### Signature Textures
Avoid gradients. Instead, use "Micro-Shifts." When a button is hovered, shift the background from `primary` (#adc6ff) to `primary_dim` (#98b8ff). This immediate, flat color snap mimics the responsiveness of a terminal.

## 3. Typography: Editorial Sans
We use **Inter** as our typographic backbone. To achieve a "High-End Editorial" feel, we leverage extreme scale contrast.

*   **The Display Scale:** Use `display-md` (2.75rem) for authentication headers, but set them with `letter-spacing: -0.04em`. This "tight" tracking creates a professional, custom-type feel.
*   **The Utility Scale:** Most developer-facing metadata should use `label-md` or `label-sm`. This creates a hierarchy where the "Work" (the input or code) is large, and the "Instruction" (the label) is diminutive and out of the way.
*   **High-Contrast Readability:** All body text defaults to `on_surface` (#e7e5e4). Secondary information uses `on_surface_variant` (#acabaa). Never drop below this contrast ratio to ensure accessibility in low-light coding environments.

## 4. Elevation & Depth: Tonal Layering
Depth in this system is not "soft" or "airy"; it is structural. We replace the concept of Z-index shadows with **Structural Containment.**

*   **The Layering Principle:** Place a `surface_container_high` (#1f2020) component inside a `surface` (#0e0e0e) background. The 1px `outline_variant` border is the final "seal" that defines the component's edge.
*   **The "Ghost Border" Fallback:** For inactive states (e.g., a disabled input), use `outline` at 20% opacity. This creates a "blueprint" effect, suggesting where an element *would* be without drawing visual attention.
*   **Forced Flatness:** Glassmorphism, blurs, and overlays are strictly forbidden. If a modal or dropdown is required, it should be a solid `surface_container_highest` (#252626) with a 1px border. It should feel like a "tray" sliding over the UI, not a floating cloud.

## 5. Components: Minimalist Primitives

### Buttons
*   **Primary:** Background `primary` (#adc6ff), Text `on_primary` (#003d88). 0.25rem (`DEFAULT`) corner radius. No shadow.
*   **Secondary:** Background `transparent`, 1px border `outline_variant`. On hover, background becomes `surface_bright` (#2c2c2c).
*   **Ghost:** No background, no border. Text `secondary` (#9f9d9d). On hover, text snaps to `on_surface`.

### Input Fields
*   **Base State:** 1px border `outline_variant` (#484848), background `surface_container_lowest` (#000000).
*   **Focus State:** 1px border `primary` (#adc6ff). No "glow" or outer ring. The transition must be an instant color flip.
*   **Error State:** 1px border `error` (#ee7d77). Helper text uses `body-sm` in `error` color.

### Cards & Lists
*   **Monolithic Cards:** Use `surface_container_low` (#131313). Forbid the use of dividers between list items. Instead, use the Spacing Scale `4` (1.4rem) to create separation through "Void Space."
*   **Data Grids:** Use 1px borders for the outer container only. Internal rows should be separated by a simple background toggle on hover (`surface_container_high`).

### Authentication-Specific Components
*   **Code Input:** For 2FA or OTP, use high-contrast boxes with `title-lg` typography.
*   **Status Indicators:** Use 6px solid circles. `primary` for active, `secondary_container` for inactive, and `error` for failed states.

## 6. Do's and Don'ts

### Do
*   **Embrace the Grid:** Use the `px` (1px) spacing for all borders to maintain a "technical drawing" aesthetic.
*   **Use Mono-spacing for Data:** While Inter is the primary font, use a monospace font (like Geist Mono) for any developer-specific data like API keys or tokens.
*   **Tighten the Corners:** Stick to `DEFAULT` (0.25rem) or `sm` (0.125rem) for radii. Large rounded corners break the "precision" feel.

### Don't
*   **No Soft Shadows:** If it looks like it's "floating," it's wrong. It should look "mounted."
*   **No Gradients:** We rely on flat color values to convey a "no-nonsense" developer environment.
*   **No Centered Layouts for Dashboards:** Use left-aligned, asymmetric layouts. Centered layouts feel like marketing pages; left-aligned layouts feel like integrated development environments (IDEs).