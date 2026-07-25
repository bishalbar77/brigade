# Brigade

Restaurant operations platform. VibeAthon 6.0, 25–27 July 2026, solo.

**Read [`PROGRESS.md`](PROGRESS.md) first** — it holds live build state, the next action, and credential
state. Then [`docs/`](docs/README.md) for the spec (9 top-level docs + 15 feature docs).

**The thesis in one line:** a printed menu is a promise the kitchen may not be able to keep. Brigade makes
the menu a live function of the pantry and computes **runway** — minutes until each dish 86s at tonight's
actual sell rate — then acts on it.

**Why that framing matters:** Toast and Square already ship recipe→stock depletion with automatic 86, so
that part is table stakes and building only it would be the clone the problem statement forbids. The
differentiators are that availability reaches the *guest*, and that scarcity is *predicted* rather than
reported.

Non-negotiables when working in this repo:

- **Stock is only ever mutated by `place_order()` or `adjust_stock()`** — never a bare
  `UPDATE ingredients SET stock_qty`. The ledger and the projection must agree.
- **Availability is computed, never stored.** There is no `is_available` column.
- **Authorization lives in Postgres RLS**, not UI conditionals.
- **Money is integer cents.** No floats.
- **No LLM in the product.** The intelligence layer is deterministic statistics, by decision.
- **Never cut the KDS or the runway board.** They are the demo.
- Ops surfaces use kitchen vernacular (the pass, 86, fire, docket); guest surfaces use plain language.

## Frontend aesthetics

Source: [Anthropic cookbook — Prompting for Frontend Aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)

<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>

### Typography specifics

Never use: Inter, Roboto, Open Sans, Lato, default system fonts.

Impact choices by register:
- Code aesthetic: JetBrains Mono, Fira Code
- Editorial: Playfair Display, Crimson Pro, Fraunces
- Startup: Clash Display, Satoshi, Cabinet Grotesk
- Technical: IBM Plex family, Source Sans 3
- Distinctive: Bricolage Grotesque, Obviously, Newsreader

Pairing principle: high contrast = interesting. Display + monospace, serif + geometric sans, or one variable font across weights.

Use extremes: 100/200 weight against 800/900, not 400 against 600. Size jumps of 3x+, not 1.5x.

Pick one distinctive font, use it decisively, load from Google Fonts, and state the choice before coding.

### Known AI-design clusters to avoid

Per the frontend-design skill, current AI design clusters around three looks. Treat all three as defaults rather than choices, and do not spend a free design axis on them:

1. Warm cream background (near `#F4F1EA`) + high-contrast serif display + terracotta accent
2. Near-black background + a single bright acid-green or vermilion accent
3. Broadsheet layout with hairline rules, zero border-radius, dense newspaper columns

Where a brief explicitly asks for one of these, the brief wins.
