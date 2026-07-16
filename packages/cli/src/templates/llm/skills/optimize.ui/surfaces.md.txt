# Surfaces & depth

- Prefer a layered, low-opacity `box-shadow` over a solid-color border to express elevation on cards/menus/popovers — shadows read correctly over any background, a fixed border color doesn't. Keep real (non-shadow) borders for structural dividers: table cells, list separators, input outlines.
- Build elevation from the design system's shadow scale (sm → md → lg → xl) and use it to reinforce hierarchy (popover above card, modal above popover) — never a shadow purely for decoration.
- Don't combine a full 1px border *and* a soft wide drop-shadow on the same element ("ghost card") — pick one depth treatment.
- Keep corner radii modest on structural surfaces (cards, panels, inputs); reserve full-pill rounding for tags/buttons/chips, not whole sections.
