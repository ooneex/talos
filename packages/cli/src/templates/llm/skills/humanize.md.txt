---
name: humanize
description: Rewrite prose so it reads as if a person wrote it, stripping the tells of AI-generated text.
when_to_use: Use when drafting or editing any human-facing copy — docs, READMEs, commit bodies, PR descriptions, comments, emails, changelogs, marketing, UI text — and you want it to sound natural, not machine-produced.
model: sonnet
effort: medium
argument-hint: [file|text]
---

# Humanize Text

> **Run autonomously — do not ask the user questions.** Rewrite in place, keep the meaning, change the voice.

Make writing sound like a real person wrote it on purpose. Applies to **prose only** — anything a human reads: READMEs, docs, guides, commit bodies, PR descriptions, explanatory comments, release notes, emails, issue write-ups, UI copy. Preserve every fact, number, and link; only the wording changes.

**Never touch** anything a machine parses: code, identifiers, JSON/YAML keys, CLI flags, API field names, config, literal strings the program depends on, commit *subject lines* under a linter, log format strings.

## The tells to remove

**Vocabulary**
- **Inflated connectors** — delete or downgrade: *moreover, furthermore, additionally, notably, importantly, it's worth noting, that said, in essence, ultimately, fundamentally.* Most sentences need no connector.
- **Empty intensifiers** — *seamless, robust, powerful, cutting-edge, comprehensive, leverage, utilize, facilitate, effortlessly, elegant, delve, tapestry, realm, landscape, myriad, plethora.* Replace with plain words or delete. Use *use*, not *utilize*/*leverage*.
- **Hedging filler** — *generally, typically, often, in many cases, arguably* stacked to avoid a claim. Say the thing.
- **Praise padding** — *This is a great question, Certainly, I'd be happy to, Great choice.* Cut entirely.

**Structure**
- **Rule-of-three sweep** — "fast, reliable, and scalable." Break the reflexive triad; one adjective often beats three.
- **Symmetrical everything** — same paragraph length, same bullet shape, same section cadence. Introduce variation.
- **The "It's not just X, it's Y" frame** and **"Whether you're A or B"** openers. Rephrase directly.
- **Bullet-listitis** — convert lists back to sentences when items relate to each other; prose carries nuance bullets flatten.
- **Bold-label bullets** — `**Thing:** explanation` repeated down the page reads as a template. Use sparingly.
- **Summary-that-summarizes-nothing** — cut throat-clearing conclusions ("In conclusion, X is a powerful tool that...").
- **Emoji as decoration** — 🚀✨🎯 on headers/bullets. Remove unless the medium genuinely calls for it.

**Tone**
- **Uniform enthusiasm** — real writing has flat stretches and dry asides.
- **Over-explaining the obvious** — trust the reader; cut restatement.
- **No stance** — commit to a view: "X is better than Y here because Z," not "both have tradeoffs."
- **Perfect politeness** — a little bluntness reads as human.

## How to rewrite

1. **Read for meaning first** — capture what the text must convey (non-negotiable); the phrasing is not.
2. **Cut, then rewrite** — delete filler before rephrasing. Most AI text is 20–40% longer than it needs to be.
3. **Vary the rhythm** — mix short and long sentences; a three-word sentence after a long one lands.
4. **Use plain words** — *help* not *facilitate*, *about* not *regarding*, *use* not *utilize*.
5. **Prefer active voice and concrete subjects** — "the parser drops trailing commas," not "trailing commas are handled by the parser."
6. **Keep contractions** — *it's, don't, you'll* (except where the register is formal by design).
7. **Take a stance** — where the text weighs options, recommend one and say why.
8. **Let it be imperfect** — a fragment for emphasis, a dash mid-thought, a parenthetical aside. Deliberate imperfection is the strongest human signal.

## Preserve at all costs

- Every technical fact, version number, path, URL, and command — verbatim.
- Code blocks and inline code — never reword what's inside backticks.
- Load-bearing structure (API reference tables, step numbering).
- The author's register — don't make a formal notice folksy or a casual README stuffy. Match the room.

## Before / after

**Before:**
> Moreover, this powerful and robust utility seamlessly leverages caching to facilitate a comprehensive performance boost. It's worth noting that whether you're a beginner or an expert, you'll find it incredibly easy to utilize. 🚀

**After:**
> It caches results, so repeat calls are fast. Setup is one function call — you won't need to read the internals to use it.

## Self-check

Revise if any answer is "yes": Does a paragraph open with an inflated connector? Three adjectives where one would do? Any *leverage/utilize/seamless/robust/comprehensive/delve*? Every bullet the same shape or paragraph the same length? A conclusion that adds nothing? Could you cut 20% without losing meaning? Would you actually say this sentence to a colleague?
