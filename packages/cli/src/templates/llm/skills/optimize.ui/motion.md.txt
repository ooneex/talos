# Motion & animation

- Use CSS transitions (interruptible, can retarget mid-animation) for interactive state changes (hover, open/close, toggle); reserve keyframe animations for one-shot sequences (page-load entrance, an indeterminate spinner). A keyframe animation on a rapidly toggled element snaps/restarts instead of reversing smoothly.
- Timing guide: ~100–150ms for instant feedback (press, toggle), ~200–300ms for state changes (menu, tooltip), ~300–500ms for layout changes (accordion, modal), ~500–800ms only for larger entrances. Exit animations should run faster and lighter than the matching enter animation.
- Use an ease-out curve (`cubic-bezier` ease-out-quart/quint/expo) for UI motion; avoid bounce/elastic easing, which reads as dated rather than delightful.
- Never `transition: all` (or Tailwind's bare `transition`) — name the exact properties (e.g. `transition-property: transform, opacity`). `transition: all` animates properties you didn't intend and blocks the browser from optimizing.
- Only set `will-change` on `transform`/`opacity`/`filter`/`clip-path`, and only after observing real first-frame stutter — never apply it blanket/preemptively, since each layer has a memory cost.
- Always provide a `prefers-reduced-motion` fallback (crossfade or instant transition) for any non-trivial animation — this is never optional.
- When animating a list/grid, stagger real siblings (roughly 50–100ms apart, capped around 500ms total) — do not apply a uniform fade-in to every page section on scroll; that reads as generic template motion rather than purposeful.
