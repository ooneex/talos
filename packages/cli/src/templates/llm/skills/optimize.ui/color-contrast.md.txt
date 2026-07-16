# Color & contrast

- Resolve every color from design-system tokens — never hardcode a hex/rgb inline. If a needed shade is missing, add it to the design module's token set rather than inlining it.
- Contrast: body text ≥4.5:1 against its background; large text (≥18px, or bold ≥14px) ≥3:1. When borderline, push text toward the ink end of the scale, not away.
- Never place gray/muted text directly on a colored/tinted background — it reads washed out. Use a darker shade of that background's own hue, or vary the text's opacity, instead.
- Never use color as the only signal for state (error/success/warning/selected) — pair it with an icon, label, or pattern so it reads for color-blind users and in grayscale.
- Avoid a decorative colored `border-left`/`border-right` accent stripe on cards/alerts/list items — use a full hairline border, a light background tint, or a leading icon instead.
- Reserve accent/brand color for the ~10% of the UI that should draw the eye (primary actions, active/selected state, focus rings); everywhere, it stops meaning "look here."
