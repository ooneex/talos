# Layout & spacing

**Space sibling elements with a single `gap` on their parent flex/grid container — never with per-element margins (`mt-*`/`mb-*`/`my-*`).** A `gap` is the one source of truth: spacing stays uniform automatically and survives elements being added, removed, reordered, or swapped. Set `gap-*` on the parent and delete the children's vertical margins.

- A child margin stacked _on top of_ the parent's `gap` is the usual cause of uneven gaps — audit for it when spacing looks inconsistent.
- Keep margins only for spacing _within_ a block that the container's `gap` doesn't govern (e.g. a caption tucked under a heading inside the same child).

```tsx
// ❌ per-element margins stack on top of the parent gap → uneven spacing
<Card className="flex flex-col gap-4">
  <Header className="mb-8" />
  <Body />
  <Footer className="mt-5" />
</Card>

// ✅ one gap on the parent governs every sibling → uniform spacing
<Card className="flex flex-col gap-6">
  <Header />
  <Body />
  <Footer />
</Card>
```

Further rules:

- Use the design system's spacing scale (typically 4pt-based: 4/8/12/16/24/32/48/64/96) for every gap/padding — never an arbitrary pixel value.
- Concentric radii: a nested element's radius should equal `outerRadius - padding` (not match the parent's radius) so nested rounds look intentional, not competing.
- Flexbox for one-dimensional layout (rows, nav, button groups, component internals); Grid for two-dimensional (page structure, dashboards, coordinated rows+columns). Don't reach for Grid where `flex-wrap` suffices.
- Prefer container queries for a component that must adapt to its placement (e.g. a card compact in a sidebar, expanded in main content); reserve viewport/media queries for page-level layout.
- Give flex/grid children `min-width: 0` (and `min-height: 0` in a grid) so they can shrink below their content size — without it they silently overflow.
- Pick breakpoints where content actually breaks, not at device-specific widths, and write mobile-first (`min-width`) queries so small screens don't load unneeded desktop styles first.
- Build hierarchy from at least two combined dimensions (size + weight, or size + spacing) rather than size alone — a heading that's bigger *and* bolder *and* has more space above reads as primary effortlessly.
- Use a semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip) from the design system's tokens; never arbitrary values like `999`/`9999`.
