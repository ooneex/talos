# Color & contrast

- Resolve every color from the design system's tokens — never hardcode a hex/rgb value inline. If a needed shade doesn't exist, add it to the design module's token set rather than inlining it.
- Body text must hit at least 4.5:1 contrast against its background, large text (≥18px, or bold ≥14px) at least 3:1. When contrast is borderline, push the text color toward the ink end of the scale, not away from it.
- Never place gray/muted text directly on a colored or tinted background — it reads as washed out. Use a darker shade of that background's own hue, or vary the text's own opacity, instead.
- Never use color as the only signal for state (error/success/warning/selected) — always pair it with an icon, label, or pattern so it still reads for color-blind users and in grayscale.
- Avoid a decorative colored `border-left`/`border-right` "accent stripe" on cards/alerts/list items — use a full hairline border, a light background tint, or a leading icon instead.
- Reserve accent/brand color for the ~10% of the UI that should draw the eye (primary actions, active/selected state, focus rings); if it shows up everywhere it stops meaning "look here."
