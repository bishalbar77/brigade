# 04 — Design system

> **Status: built.** Implemented in `app/globals.css`.

## The direction: blue is the only colour food never is

Professional kitchens use blue for everything that must not be mistaken for food — food-safe gloves,
blue catering plasters, blue boards for raw fish — precisely because no ingredient is blue, so it reads
instantly against anything. That turns the palette into a rule rather than a preference:

> **Blue = the system talking. Warm = the food talking.**

Every interactive element is steel blue. Every scarcity state is amber → flame → drained ash. The two
vocabularies cannot be confused, which is what the never-colour-alone rule below is actually
protecting against.

**The ground is dark and warm**, because both audiences need dark for reasons that happen to agree: a
diner in a dim room (a bright screen blinds her and kills the mood) and a cook on an eight-hour shift
(dark reduces fatigue, bone-on-espresso holds contrast at 2 m). Warm rather than neutral because the
guest side has to be appetising — a dining room at service, not a dashboard.

Contrast ratios below are **computed, not estimated** — every foreground is checked against
both `--color-bg` and `--color-raised`, and all eight clear the 4.5:1 body threshold on both.

| Token | Hex | on bg | on raised | Role |
|---|---|---|---|---|
| `--color-bg` | `#1E1815` | — | — | espresso — the room at service |
| `--color-bg-raised` | `#2A2320` | — | — | cards, dockets |
| `--color-fg` | `#F4EFE6` | 15.3:1 | 13.5:1 | enamel white, warm |
| `--color-fg-muted` | `#B3A79B` | 7.5:1 | 6.6:1 | secondary text |
| `--color-fg-subtle` | `#93897E` | 5.1:1 | 4.5:1 | eyebrows, captions |
| `--color-accent` | `#3D90D9` | 5.2:1 | 4.6:1 | food-safe blue — the system's voice |
| `--color-runway-plenty` | `#6FA98A` | 6.5:1 | 5.7:1 | sage — calm; shows no badge |
| `--color-runway-low` | `#E0A33C` | 7.9:1 | 7.0:1 | amber |
| `--color-runway-critical` | `#DE674A` | 5.1:1 | 4.5:1 | flame |
| `--color-runway-out` | `#938A80` | 5.2:1 | 4.6:1 | ash — drained, because it's gone |

**Three of those values were corrected after measuring them.** The first pass used a hotter
flame (`#D9502F`), a darker ash (`#7D7266`) and a darker subtle grey (`#8A7F73`), all chosen by
eye. Measured against `--color-bg-raised` — which is what a docket and a menu card actually sit
on — they came in at **3.78:1, 3.29:1 and 3.94:1**: fine for large text, failing for the small
labels they were being used on. Each was lightened by the smallest amount that clears 4.5:1 on
both surfaces rather than by taste. Softening the flame costs little because urgency is carried
redundantly anyway — weight, a glyph and a text label all say it too.

The lesson worth keeping: contrast is computable, so compute it. Three of eight were wrong.

**Typefaces.** `--font-display` **Bricolage Grotesque** — irregular, industrial-editorial, restrained
to titles and runway numerals. `--font-body` **Newsreader** — real menus are set in serif; it signals
restaurant rather than dashboard, and it's the appetite lever on the guest side. `--font-mono`
**IBM Plex Mono** — load-bearing, not decorative: tabular figures stop a countdown's digits jittering
as they change, and dockets are a tabular read.

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

No Inter, Roboto, Open Sans, Lato, or system stacks — see
[Prompting for Frontend Aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
for why those read as defaults rather than choices. Three roles —

- `--font-display` — characterful, used with restraint (headings, the runway numerals)
- `--font-body` — comfortable at small sizes on a phone
- `--font-mono` — dockets, ticket numbers, quantities, timers. **Load-bearing, not decorative:** the KDS
  is a tabular reading task and monospace digits stop numbers from jittering as they count down.

Use extremes rather than middles — 200 against 800, not 400 against 600; size jumps of 3× rather than
1.5×.

## Calibration: the defaults to avoid

AI-generated design currently clusters around three looks. All three are legitimate for some brief, but
they turn up regardless of subject, which makes them defaults rather than choices. Where a brief pins a
direction, the brief wins; where it leaves an axis free, that freedom should not be spent here.

1. Warm cream background (near `#F4F1EA`) + high-contrast serif display + terracotta accent
2. Near-black background + a single bright acid-green or vermilion accent
3. Broadsheet layout — hairline rules, zero border-radius, dense newspaper columns

How the chosen direction clears each: no cream and no terracotta; the ground is visibly warm espresso
rather than near-black and the accent is a mid blue rather than an acid pop, with warm reds appearing
only as *status* and never as the brand voice; and the docket stays a **component** with its own
surface instead of the page becoming a broadsheet.

That third one was a live risk rather than a hypothetical — a thermal-printed chit aesthetic is
genuinely right for a kitchen ticket and sits one step from cluster 3. The paper reference is kept to
the monospace and the tear edge.

Source: [Prompting for Frontend Aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb).

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
