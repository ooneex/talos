---
name: humanize
description: Rewrite prose so it reads as if a person wrote it, stripping the tells of AI-generated text. Use when drafting or editing any human-facing copy — docs, READMEs, commit bodies, PR descriptions, comments, emails, changelogs, marketing, UI text — and you want it to sound natural, not machine-produced.
argument-hint: [file|text]
disallowed-tools: AskUserQuestion
---

# Humanize Text

> **Run autonomously — do not ask the user questions.** Rewrite in place, keep the meaning, change the voice.

Make writing sound like a real person wrote it on purpose. This skill applies to **prose only** — never touch code, identifiers, config, or literal strings the program depends on. Preserve every fact, number, and link; only the wording changes.

## When to apply

Apply to anything a human reads: READMEs, docs pages, guides, commit bodies, PR descriptions, code comments (the explanatory ones, not directives), release notes, emails, issue write-ups, UI copy. Skip anything a machine parses: code, JSON/YAML keys, CLI flags, API field names, commit *subject lines* under a linter, log format strings.

## The tells to remove

AI writing has a fingerprint. Hunt these down and cut them.

### Vocabulary tells

- **Inflated connectors** — delete or downgrade: *moreover, furthermore, additionally, notably, importantly, it's worth noting, that said, in essence, ultimately, fundamentally.* Most sentences need no connector at all.
- **Empty intensifiers** — *seamless, robust, powerful, cutting-edge, comprehensive, leverage, utilize, facilitate, robustly, effortlessly, elegant, delve, tapestry, realm, landscape, myriad, plethora.* Replace with plain words or delete. Use *use*, not *utilize* or *leverage*.
- **Hedging filler** — *generally, typically, often, in many cases, it depends, arguably* stacked to avoid a claim. Say the thing.
- **Praise padding** — *This is a great question, Certainly, I'd be happy to, Great choice.* Cut entirely.

### Structural tells

- **The rule-of-three sweep** — "fast, reliable, and scalable." Real writers vary counts. Break the reflexive triad; sometimes one adjective is stronger than three.
- **Symmetrical everything** — every paragraph the same length, every bullet the same shape, every section opening with the same cadence. Introduce variation.
- **The "It's not just X, it's Y" frame** and **"Whether you're A or B"** openers. Overused. Rephrase directly.
- **Bullet-listitis** — not every idea needs a list. Prose carries nuance and connection that bullets flatten. Convert lists back to sentences when the items relate to each other.
- **Bold-label bullets** — `**Thing:** explanation` repeated down the page reads as a generated template. Use sparingly.
- **The summary-that-summarizes-nothing** — "In conclusion, X is a powerful tool that..." Cut throat-clearing conclusions.
- **Emoji as decoration** — section headers and bullets sprinkled with 🚀✨🎯. Remove unless the medium genuinely calls for it.

### Tone tells

- **Uniform enthusiasm** — everything is "exciting" and "powerful." Real writing has flat stretches and dry asides.
- **Over-explaining the obvious** — trust the reader. Cut sentences that restate what was just shown.
- **No opinion, no stance** — humans commit to a view. "X is better than Y here because Z," not "both have tradeoffs to consider."
- **Perfect politeness** — a little bluntness reads as human.

## How to rewrite

1. **Read for meaning first** — capture what the text must convey. That is non-negotiable; the phrasing is not.
2. **Cut, then rewrite** — delete filler before rephrasing. Most AI text is 20–40% longer than it needs to be. Shorter is more human.
3. **Vary the rhythm** — mix short sentences with longer ones. A three-word sentence after a long one lands. Don't let every sentence run the same length.
4. **Use plain words** — the word you'd say out loud beats the formal synonym. *Help*, not *facilitate*. *About*, not *regarding*. *Use*, not *utilize*.
5. **Prefer active voice and concrete subjects** — "the parser drops trailing commas," not "trailing commas are handled by the parser."
6. **Keep contractions** — *it's, don't, you'll.* Spelling them out reads stiff (except where the register is formal by design).
7. **Take a stance** — where the text weighs options, recommend one and say why.
8. **Let it be imperfect** — a sentence fragment for emphasis, a dash mid-thought, an aside in parentheses. Deliberate imperfection is the strongest human signal.

## Preserve at all costs

- Every technical fact, version number, path, URL, and command — verbatim.
- Code blocks and inline code — never reword what's inside backticks.
- The document's structure when it's load-bearing (API reference tables, step numbering).
- The author's register: don't make a formal legal notice folksy, or a casual README stuffy. Match the room.

## Quick before/after

**Before (AI-tell heavy):**
> Moreover, this powerful and robust utility seamlessly leverages caching to facilitate a comprehensive performance boost. It's worth noting that whether you're a beginner or an expert, you'll find it incredibly easy to utilize. 🚀

**After (human):**
> It caches results, so repeat calls are fast. Setup is one function call — you won't need to read the internals to use it.

## Self-check before finishing

Run down this list; if any answer is "yes," revise:

- Does a paragraph open with *Moreover / Furthermore / Additionally / It's worth noting*?
- Are there three adjectives where one would do?
- Did you write *leverage, utilize, seamless, robust, comprehensive, delve*?
- Is every bullet the same shape, or every paragraph the same length?
- Is there a conclusion that adds nothing?
- Could you cut 20% of the words without losing meaning? (If yes, cut them.)
- Would you actually say this sentence to a colleague? If not, rewrite it until you would.
