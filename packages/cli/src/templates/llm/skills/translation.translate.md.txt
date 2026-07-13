---
name: translation-translate
description: Translate and complete the `translations.json` / `translations.yml` dictionaries of one or more modules — optionally first extracting hardcoded user-facing text into keys — filling every target locale meaning-for-meaning from the `en` source. Use when the user asks to translate a module's translations, complete missing locales, add a language to a dictionary, or localize hardcoded strings. Distinct from `translation-create`, which scaffolds a new translation class/hook.
argument-hint: [module...] [locale...]
disallowed-tools: AskUserQuestion
---

# Translate Module Translations

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Complete the locale translations of one or more modules' translation
dictionaries, and (when asked) first pull hardcoded user-facing text into those
dictionaries. Translations must be **accurate and pertinent** — translated
meaning-for-meaning the way a native speaker would phrase the UI, never word-by-
word. This skill orchestrates two agents:

- **`translation-extractor`** — finds hardcoded text in a module and rewires it
  to `trans(...)`, adding `en` source keys to the dictionary.
- **`translation-translator`** — fills every target locale of a dictionary from
  its `en` source.

Run every command from the **monorepo root**.

## Steps

### 1. Resolve the scope

The user names one or more modules ("translate the `dashboard` and `account`
modules"). For each module, read `modules/<module>/<module>.yml` to learn its
flavor and locate its dictionaries:

| Flavor (`type` in `<module>.yml`) | Dictionary location |
|---|---|
| `spa` | `modules/<module>/src/features/*/translations/translations.json` (one per feature) |
| backend (`module`/untyped) | `modules/<module>/src/translations/translations.yml` |

Glob for the actual files — a spa module has one dictionary per feature slice. If
a module has no dictionary yet, create it first with the `/translation-create`
skill, then translate the resulting dictionary.

### 2. Determine the target locales

Decide which locales to fill:

- If the user named languages ("translate to French and Spanish"), use those.
- Otherwise, target the union of every locale already present across the
  dictionary's leaves, so all keys end up covering the same set. If only `en`
  exists and no language was requested, ask which locales to add.

Valid codes: `ar bg cs da de el en eo es et eu fi fr hu hy it ja ko lt nl no pl
pt ro ru sk sv th uk zh zh-tw`. `en` is the source and is never overwritten.

### 3. (Optional) Extract hardcoded text first

If the user wants hardcoded strings localized too ("find hardcoded text and
translate it"), dispatch the **`translation-extractor`** agent **once per
module** before translating. Give it the module name and scope; it adds `en`
keys and rewires the source. Skip this step when the user only wants existing
dictionary entries completed.

### 4. Translate each dictionary

Dispatch the **`translation-translator`** agent **once per dictionary file**,
passing the file path and the target locales from step 2. The agent fills the
missing locales meaning-for-meaning, preserving `{{ placeholders }}` verbatim and
translating pluralization siblings (`_plural`, `_zero`) with each locale's
correct grammatical number. Run the per-file translations in parallel when there
are several. The agent edits only its dictionary file.

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing — a malformed JSON/YAML dictionary or a
broken `trans(...)` rewire must be corrected.

## Quality bar

- **Meaning, not words** — preserve intent, tone, and register; phrase each
  string as a native speaker writing the product UI would. Reject literal glosses.
- **Placeholders stay verbatim** — `{{ name }}`, `{{ count }}` are never
  translated, renamed, or dropped; only the surrounding words change.
- **Context-aware** — read the key path and `en` text to tell a button label from
  a heading from an error sentence, and match the target language's conventions
  (capitalization, punctuation spacing, plural forms).
- **Consistent & idempotent** — translate a recurring term the same way
  everywhere; never overwrite a correct existing translation, only fill blanks
  and add requested locales.
- **Keys are stable** — never invent, rename, or remove dictionary keys while
  translating; only locale entries are added.

## Report

Summarize per module: the dictionaries touched, the locales completed, any
hardcoded text extracted (old → key), anything left untranslated and why, and the
lint/format/test result.
