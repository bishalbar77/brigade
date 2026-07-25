# 04 — Design system

> **Status: structure defined, visual direction pending.** Palette and typography are deliberately
> left open here and will be set by the `frontend-design` skill, then folded back into this file.
> Everything below — the density split, the token *names*, the accessibility floor — is fixed and
> does not depend on which palette wins.

## The central constraint: one system, two densities

Brigade has two audiences with almost opposite needs. Most hackathon projects style both surfaces
identically, and it's why staff tooling in them looks like a marketing page.

|  | Guest surface | Ops surface |
|---|---|---|
| Device | Phone, held one-handed | Wall-mounted screen (KDS) · desktop (manager) |
| Distance | ~30 cm | ~200 cm for KDS |
| Environment | Dim, loud restaurant | Hot, bright, glare, grease-filmed screen |
| Hands | Free-ish | Busy, often gloved — **no mouse on KDS** |
| Session | 90 seconds, once | Entire 8-hour service |
| Emotional job | Appetite, confidence, calm | Situational awareness, zero ambiguity |
| Therefore | Generous spacing, large imagery, warm, big tap targets | Dense, glanceable, huge type, zero decoration |

**They share one token system and diverge only in scale and density.** Same colour semantics, same type
families, same motion vocabulary — different spacing scale, different type scale, different information
density. A shared `data-density="guest" | "ops"` attribute on the layout root switches the scale.

## Token structure

Defined as CSS custom properties. Names are fixed now so components can be written against them
before the palette exists.

```css
:root {
  /* colour — semantic, never raw hex in components */
  --bg, --bg-raised, --bg-sunken
  --fg, --fg-muted, --fg-subtle
  --border, --border-strong
  --accent, --accent-fg           /* the one bold voice */
  --ok, --warn, --danger, --info  /* status; see redundancy rule below */

  /* runway states — the product's own semantic scale */
  --runway-plenty, --runway-low, --runway-critical, --runway-out

  /* type */
  --font-display, --font-body, --font-mono
  --step--1 … --step-6           /* fluid type scale, clamp() based */

  /* space — density-switched */
  --space-1 … --space-8
  --radius-sm, --radius-md, --radius-lg
  --shadow-sm, --shadow-md

  /* motion */
  --dur-fast: 120ms; --dur-base: 240ms; --dur-slow: 480ms;
  --ease-out: cubic-bezier(.2,.8,.2,1);
}

[data-density="ops"] { /* compressed space scale, larger minimum type */ }
```

Rule: **components reference semantic tokens only.** No raw hex, no `text-slate-600`. A palette change
must be a one-file change.

## Typography

Per the aesthetics guidance in [`CLAUDE.md`](../CLAUDE.md): no Inter, Roboto, Open Sans, Lato, or system
stacks. Three roles —

- `--font-display` — characterful, used with restraint (headings, the runway numerals)
- `--font-body` — comfortable at small sizes on a phone
- `--font-mono` — dockets, ticket numbers, quantities, timers. **Load-bearing, not decorative:** the KDS
  is a tabular reading task and monospace digits stop numbers from jittering as they count down.

Use extremes rather than middles — 200 against 800, not 400 against 600; size jumps of 3× rather than
1.5×. Final families chosen by `frontend-design`.

## The signature element: the runway countdown

The one thing the product is remembered by. A dish's remaining life rendered as a **physical, depleting
thing** rather than a number in a badge — the visual claim being that you are watching stock drain in
real time.

Constraints on whatever form it takes:

- Must read at 2 m on the KDS and at 30 cm on a phone, from the same component
- Must degrade to a plain number + text label with `prefers-reduced-motion`
- Must not animate continuously — a permanently moving element in a kitchen is noise. It animates on
  *change*, then rests.

## Colour and status: the redundancy rule

**Status is never encoded in colour alone.** Every status carries at least two of: colour, icon/glyph,
text label, position. Two reasons, both concrete rather than box-ticking:

1. Rahul (see [01-overview.md](01-overview.md)) reads the KDS through glare on a greasy screen where hue
   separation collapses.
2. Colourblind cooks exist, and a mis-read ticket state means a wasted plate.

Runway states specifically:

| State | Colour | Also encoded as |
|---|---|---|
| plenty | `--runway-plenty` | no badge at all |
| low | `--runway-low` | "12 left" text |
| critical | `--runway-critical` | "86s ~20:40" + glyph |
| out | `--runway-out` | struck-through name + "86" label |

## Motion

Per the cookbook: one well-orchestrated moment beats scattered micro-interactions.

- **Guest menu load** — the orchestrated moment. Staggered reveal via `animation-delay`, CSS-only.
- **Runway change** — the number transitions; the element does not loop.
- **New docket on KDS** — enters with a brief, unmissable emphasis. This one is functional: a cook
  must notice a ticket arriving without watching the screen.
- **Everything else** — 120ms state transitions or nothing.

`@media (prefers-reduced-motion: reduce)` removes all of it. Nothing above is required to understand
the interface.

## Quality floor

Non-negotiable, applied without announcing it in the UI:

- Responsive to 375 px; no horizontal body scroll at any width
- Visible keyboard focus on every interactive element; never `outline: none` without a replacement
- `prefers-reduced-motion` respected
- Text contrast ≥ 4.5:1 body, ≥ 3:1 large
- KDS legible at 2 m — minimum 24 px effective body size on that surface
- Tap targets ≥ 44 px on guest surfaces
- Form fields have real labels, not placeholder-only
- Empty and error states designed, never a bare spinner or blank panel

## Charts

Analytics visualisations follow the `dataviz` skill — load it before writing the first chart. Chart
colours come from the same semantic tokens; categorical series get their own validated scale rather
than reusing status colours, since "red" must keep meaning *critical* and not *the third series*.

## Writing

Copy is design material. Guidance applied throughout:

- Name things by what people control: "notifications," not "webhook config"
- Active voice on controls; the label matches the outcome — "Publish" produces "Published"
- One vocabulary across a flow; a term never changes mid-journey
- Errors say what happened and how to fix it; they don't apologise and they're never vague
- Empty states invite an action
- **Ops surfaces use kitchen vernacular** (the pass, 86, fire, docket) because that's what staff
  recognise; **guest surfaces use plain language**, because a diner doesn't know what expo means
