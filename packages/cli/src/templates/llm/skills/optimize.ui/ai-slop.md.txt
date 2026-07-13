# Avoid AI slop

Generated UI has a fingerprint, the same way generated prose does (see the
`humanize` skill). Hunt these tells down and design against them — every rule
below exists because it's the default an unguided generation reaches for, not
because it's ever the right call here.

- **Purple/indigo gradient as the default brand color** — a `from-purple-500
  to-indigo-600`-style gradient slapped on buttons, headers, and hero
  backgrounds regardless of the project's actual brand. Resolve color from the
  design system's tokens; a gradient is only correct when the token set
  defines one.
- **Glassmorphism as decoration** — frosted-glass `backdrop-blur` panels
  floating over busy backgrounds for no functional reason. Reserve blur for a
  real scrim (modal backdrop, popover over content that must stay legible
  behind it), never as a default surface treatment.
- **The generic template layout** — centered hero (headline + subhead +
  two buttons) followed by a symmetric 3-up feature grid, each card holding an
  icon-in-a-circle, a bold title, and one sentence. This is a stock landing-page
  skeleton, not a design decision — build the layout the actual content and
  hierarchy call for.
- **Icon-in-tinted-circle repeated for every list item** — the same
  circle-badge-plus-caption unit copy-pasted down a feature list or stat row.
  Vary the treatment to match what each item actually needs; not everything is
  a feature-grid entry.
- **Checkmark-bullet lists for every enumeration** — ✓ green-check bullets
  used as the default for any list of items, whether or not they're actually
  affirmations of something. Use a plain list unless the content is genuinely
  a list of confirmations.
- **Emoji standing in for the icon set** — 🚀✨🎯 used as UI icons or section
  markers instead of the design system's actual icon components. Use the
  system's icons; if the right one doesn't exist, add it there.
- **Decorative gradient blobs / mesh backgrounds** — blurred colored orbs or
  mesh gradients placed behind content purely for visual noise. If it's not
  reinforcing hierarchy or brand identity on purpose, cut it.
- **Uniform glow/shadow on everything** — every card, button, and input given
  the same soft drop-shadow so the whole screen looks like it's floating.
  Shadows exist to express elevation *differences*; apply them from the
  system's shadow scale (see `references/surfaces.md`), not as a blanket
  default.
- **Gradient text for emphasis** — `background-clip: text` rainbow/duotone
  headlines used as a stand-in for real typographic hierarchy (see
  `references/typography.md`). Use weight or size instead.
- **Everything rounded-full** — pill-shaped buttons, inputs, cards, and
  section containers all at once, erasing the distinction between structural
  surfaces and tags/chips (see `references/surfaces.md`'s radius guidance).
- **Marketing-cliché copy in UI text** — "Unlock the power of…", "Take your
  X to the next level", "Seamlessly integrate", "Elevate your workflow".
  Write plain, specific copy that says what the feature does; if `humanize`
  applies to the surrounding docs/PR, apply the same bar to UI strings.
- **Symmetric everything, no visual rhythm** — every section the same
  height/padding, every card the same shape, nothing sized or weighted to
  reflect actual importance. Build hierarchy from content, not a repeating
  template (see `references/layout-spacing.md`).

## Self-check before calling a UI done

- Does this look like it was assembled from a generic template, or does it
  reflect this project's actual design tokens and content?
- Strip any gradient, glow, or blur you added — would a shadow/color/weight
  change from the system's own scale communicate the same thing? If so, use
  that instead.
- Read the UI copy out loud — does it say something concrete, or could it be
  pasted into any other product unchanged?
