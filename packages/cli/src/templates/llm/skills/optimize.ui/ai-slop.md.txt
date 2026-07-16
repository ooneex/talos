# Avoid AI slop

Generated UI has a fingerprint, like generated prose (see `humanize`). Each tell below is a default unguided generation reaches for, never the right call — hunt them down and design against them.

- **Purple/indigo gradient as brand color** — `from-purple-500 to-indigo-600` on buttons/headers/heroes regardless of the real brand. Resolve color from design-system tokens; a gradient is correct only when the token set defines one.
- **Glassmorphism as decoration** — frosted `backdrop-blur` panels floating for no functional reason. Reserve blur for a real scrim (modal backdrop, popover over content that must stay legible), never as a default surface.
- **Generic template layout** — centered hero (headline + subhead + two buttons) then a symmetric 3-up feature grid of icon-in-circle + title + one sentence. Build the layout the actual content and hierarchy call for.
- **Icon-in-tinted-circle for every list item** — the same circle-badge-plus-caption unit copy-pasted down a list. Vary the treatment to what each item needs.
- **Checkmark-bullet lists for every enumeration** — ✓ green-check bullets as the default for any list. Use a plain list unless the content is genuinely confirmations.
- **Emoji standing in for the icon set** — 🚀✨🎯 as UI icons or section markers instead of the design system's icon components. Use the system's icons; if one's missing, add it there.
- **Decorative gradient blobs / mesh backgrounds** — blurred colored orbs behind content purely for noise. If it's not reinforcing hierarchy or brand on purpose, cut it.
- **Uniform glow/shadow on everything** — same soft shadow on every card/button/input so the screen floats. Shadows express elevation *differences*; apply them from the system's shadow scale (see `surfaces.md`).
- **Gradient text for emphasis** — `background-clip: text` headlines standing in for real hierarchy (see `typography.md`). Use weight or size.
- **Everything rounded-full** — pill-shaped buttons, inputs, cards, and sections at once, erasing the distinction between structural surfaces and tags/chips (see `surfaces.md` radius guidance).
- **Marketing-cliché copy** — "Unlock the power of…", "Take your X to the next level", "Seamlessly integrate", "Elevate your workflow". Write plain, specific copy that says what the feature does.
- **Symmetric everything, no visual rhythm** — every section the same height/padding, every card the same shape, nothing sized to reflect importance. Build hierarchy from content, not a repeating template (see `layout-spacing.md`).

## Self-check before calling a UI done

- Does this reflect the project's actual design tokens and content, or a generic template?
- Strip any gradient/glow/blur you added — would a shadow/color/weight change from the system's own scale say the same thing? If so, use that.
- Read the UI copy aloud — does it say something concrete, or could it be pasted into any other product unchanged?
