# Interaction & states

Every interactive element needs a full, consistent state vocabulary — most UI bugs are a missing state, not a wrong one.

- Design/verify all applicable states: default, hover, focus, active, disabled, loading, error, success, selected. Hover-only affordances are the most common miss — keyboard and touch users never see `:hover`.
- Never remove the focus outline without a `:focus-visible` replacement (visible ring, offset not inset, sufficient contrast against adjacent colors).
- Use skeletons mirroring the loaded content's shape for in-context loading, not spinners — they read as faster and prevent layout jumps. Reserve spinners for actions with no predictable shape (e.g. a button's own busy state).
- Optimistic updates (apply immediately, roll back on failure) are only for low-stakes, reversible actions (likes, toggles, follows) — never for payments or destructive/irreversible operations.
- For destructive actions, prefer remove-then-undo (apply immediately, show an undo toast, commit after it expires) over a confirm dialog; reserve confirmation dialogs for truly irreversible or high-cost/batch actions.
- Empty states are an onboarding moment, not a dead end — say what will appear, why it matters, and give one clear next action. Never ship a bare "No items."
- Error messages: what happened + why + how to fix, with an example where useful. Never blame the user ("Invalid input" → "Email addresses need an @ symbol, e.g. name@example.com.") and never use humor in error copy.
- Button/action labels are verb + object, never "OK"/"Submit"/generic "Yes"/"No" — e.g. "Save changes", "Delete 5 items" (show the count for destructive bulk actions).
- Dropdowns/menus/tooltips must not clip inside `overflow: hidden|auto` ancestors — use the design system's overlay/portal primitive (or the Popover API / anchor positioning) instead of nested `position: absolute`.
- Minimum hit area: 44×44px on touch (≥40×40px in dense desktop UI); grow small controls (checkboxes, icon buttons) with an invisible pseudo-element rather than enlarging the visible glyph. Two hit areas must never overlap.
- Keep decision points scannable: cap visible options per screen (nav ≤5 top-level items, form sections ≤4 fields before a break) rather than dumping every choice into one view.
