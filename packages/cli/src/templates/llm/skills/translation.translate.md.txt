---
name: translation-translate
description: Translate and complete the `translations.json` / `translations.yml` dictionaries of one or more modules — optionally first extracting hardcoded user-facing text into keys — filling every target locale meaning-for-meaning from the `en` source.
when_to_use: Use when the user asks to translate a module's translations, complete missing locales, add a language to a dictionary, or localize hardcoded strings. Distinct from `translation-create`, which scaffolds a new translation class/hook.
model: sonnet
effort: medium
agent: general-purpose
context: fork
argument-hint: [module...] [locale...]
---

# Translate Module Translations

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing.

Complete the locale translations of one or more modules' dictionaries, and (when asked) first pull hardcoded user-facing text into them. **Run every command from the monorepo root.** Orchestrates two agents:

- **`translation-extractor`** — finds hardcoded text in a module and rewires it to `trans(...)`, adding `en` source keys.
- **`translation-translator`** — fills every target locale of a dictionary from its `en` source.

## 1. Resolve the scope

For each module the user names, read `modules/<module>/<module>.yml` for its flavor and dictionary location:

| Flavor (`type` in `<module>.yml`) | Dictionary location |
|---|---|
| `spa` | `modules/<module>/src/features/*/translations/translations.json` (one per feature) |
| backend (`module`/untyped) | `modules/<module>/src/translations/translations.yml` |

Glob for the actual files (a spa module has one dictionary per feature slice). If a module has no dictionary yet, create it with `/translation-create` first, then translate the result.

## 2. Determine the target locales

- User named languages → use those.
- Otherwise → the union of every locale already present across the dictionary's leaves, so all keys cover the same set. If only `en` exists and no language was requested, ask which locales to add.

Valid codes: `ar bg cs da de el en eo es et eu fi fr hu hy it ja ko lt nl no pl pt ro ru sk sv th uk zh zh-tw`. `en` is the source and is never overwritten.

## 3. (Optional) Extract hardcoded text first

If the user wants hardcoded strings localized too, dispatch **`translation-extractor`** **once per module** before translating, giving it the module name and scope; it adds `en` keys and rewires the source. Skip when the user only wants existing entries completed.

## 4. Translate each dictionary

Dispatch **`translation-translator`** **once per dictionary file**, passing the file path and the target locales from step 2. Run the per-file translations in parallel when there are several; each agent edits only its own dictionary file.

## 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing — a malformed JSON/YAML dictionary or a broken `trans(...)` rewire must be corrected.

## Quality bar

- **Meaning, not words** — preserve intent, tone, and register; phrase each string as a native speaker writing the product UI would. Reject literal glosses.
- **Placeholders verbatim** — `{{ name }}`, `{{ count }}` are never translated, renamed, or dropped; only surrounding words change.
- **Context-aware** — read the key path and `en` text to tell a button label from a heading from an error sentence, and match the target language's conventions (capitalization, punctuation spacing, plural forms — translate `_plural`/`_zero` siblings with each locale's correct grammatical number).
- **Consistent & idempotent** — translate a recurring term the same way everywhere; never overwrite a correct existing translation, only fill blanks and add requested locales.
- **Keys are stable** — never invent, rename, or remove dictionary keys; only locale entries are added.

## Report

Summarize per module: dictionaries touched, locales completed, any hardcoded text extracted (old → key), anything left untranslated and why, and the lint/format/test result.
