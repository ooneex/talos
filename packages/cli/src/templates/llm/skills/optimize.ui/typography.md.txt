# Typography

- Use the design system's type scale — don't introduce new font sizes. A muddy scale with many close sizes (14/15/16px) is the most common typographic failure; a handful of clearly distinct sizes reads as more deliberate.
- Cap body measure at ~65–75 characters per line; when a container widens, scale font-size with it so the measure stays in range instead of drifting into very long or very short lines.
- Apply `font-variant-numeric: tabular-nums` to dynamically-updating numbers (counters, timers, live prices, table columns) so digit width doesn't shift layout on update; skip it on static/decorative numbers.
- Use `text-wrap: pretty` (no line-count limit) as the default for headings/captions/short body copy to avoid orphans; `text-wrap: balance` works only up to a handful of lines and is silently ignored beyond that, so don't rely on it for longer text.
- Never signal emphasis with `background-clip: text` gradient text — decorative, not meaningful; use weight or size instead.
