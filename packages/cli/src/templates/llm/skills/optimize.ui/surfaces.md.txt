# Surfaces & depth

- Prefer a layered, low-opacity `box-shadow` over a solid-color border to express elevation on cards/menus/popovers — shadows read correctly over any background, while a fixed border color doesn't. Keep real (non-shadow) borders for structural dividers: table cells, list separators, input outlines.
- Build elevation from the design system's shadow scale (sm → md → lg → xl) and use it to reinforce hierarchy (a popover sits above a card, a modal above a popover) — never add a shadow purely for decoration.
- Don't combine a full 1px border *and* a soft wide drop-shadow on the same element ("ghost card") — pick one depth treatment, not both.
- Keep corner radii modest on structural surfaces (cards, panels, inputs) and reserve full-pill rounding for tags/buttons/chips, not whole sections.
