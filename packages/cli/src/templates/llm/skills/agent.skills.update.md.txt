---
name: agent-skills-update
description: Sync the project's on-disk assistant config (AGENTS.md, skills, agents) with the canonical templates bundled in the installed Talos CLI. Scaffolds a fresh copy into a tmp folder via talos agent:skills:create, then smart-merges each file into its local counterpart — creating missing files, reconciling diverged ones, and refactoring the result to be token efficient.
when_to_use: Use to refresh the local config for any Talos-supported assistant (.claude, .codex, .cursor, .gemini, .windsurf, .cline, .junie, .roo, .continue, .zed) — its skills, agents, and AGENTS.md — after upgrading Talos, or to pull upstream template changes without losing local edits. Triggers on "update agent skills", "sync skills", "refresh AGENTS.md".
model: sonnet
effort: high
agent: general-purpose
context: fork
argument-hint: [--agents=.claude,.codex]
allowed-tools: Bash(talos agent:skills:create *), Bash(mkdir *), Bash(rm *), Bash(find *), Bash(diff *), Read, Write, Edit, Glob, Grep
---

# Update Agent Skills

> **Run autonomously — don't ask questions; pick the recommended option. Run every command from the monorepo root.**

Refresh the assistant config with the **canonical** templates `talos agent:skills:create` emits for the installed Talos version, keeping local customizations. Canonical wins on *structure and new content*; local wins on *project-specific edits*. Regenerate into a throwaway folder, then merge file-by-file into the working tree.

## 1. Resolve assistants

Pick the config dirs to sync (multiple allowed, comma-separated or repeated: `--agents=.claude,.codex` = `--agents=.claude --agents=.codex`):

- `--agents` given → use those.
- Else → every dir present at the root among `.claude`, `.codex`, `.cursor`, `.gemini`, `.windsurf`, `.cline`, `.junie`, `.roo`, `.continue`, `.zed`.
- None present → `.claude`, `.codex`.

Root `AGENTS.md` is always in scope.

## 2. Scaffold into tmp

Regenerate into a throwaway folder, never straight into the working tree. Pass every assistant from step 1 to `--agents`:

```bash
rm -rf tmp/agent-skills-sync
talos agent:skills:create --cwd=tmp/agent-skills-sync --agents=.claude,.codex
```

`--cwd` retargets writes under the tmp folder; `--agents` skips the interactive prompt — both required non-interactively.

## 3. Map generated files to local paths

`find tmp/agent-skills-sync -type f`. The local counterpart is the same path minus the `tmp/agent-skills-sync/` prefix (e.g. `tmp/agent-skills-sync/.claude/skills/review/SKILL.md` → `.claude/skills/review/SKILL.md`).

## 4. Smart-sync each file

`diff` each generated file against its local counterpart:

- **Missing locally** → create it verbatim (make parent dirs).
- **Identical** → skip.
- **Diverged** → merge into one clean file with **no conflict markers**: take canonical structural/new content, keep deliberate local edits (project instructions, tuned frontmatter, extra sections), reconcile clashing sections yourself. Prefer canonical for plain template refreshes, local for clear customizations.

Only touch files the generator produced; never delete local-only files.

## 5. Refactor for token efficiency

Tighten every file you changed — cut duplication and dead merge leftovers, shorten prose. **Preserve all instructions, commands, frontmatter, and semantics** — shorten wording, never scope.

## 6. Clean up and report

```bash
rm -rf tmp/agent-skills-sync
```

Report assistants synced and files **created** / **merged** (one line per non-trivial merge) / **unchanged**. Flag any merge you were unsure about.
