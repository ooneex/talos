---
name: design-update
description: Sync a local design module with upstream skeleton-design — clone the latest source, create missing src/ files, and merge existing ones while preserving local customizations.
when_to_use: Use when pulling upstream changes into an existing design module. To scaffold one from scratch, use `talos design:create`.
model: sonnet
effort: high
allowed-tools: Bash(git clone *), Bash(rm *), Bash(bun add *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<name>]
---

# Update Design Module

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

> **Module location:** `<module>` = `modules/<module>/` or `packages/<module>/`. Check both roots.

Refresh a design module against upstream `skeleton-design`. Idempotent and additive: new upstream files are created, existing local files are **merged** (never overwritten), local-only files are left untouched. Mirrors `talos design:create` but non-destructive.

## Steps

1. **Locate.** Use `--name`, else find the module whose `<name>.yml` has `type: "design"` (`grep -rl 'type: "design"' modules/*/ packages/*/`). Refuse any module without that declaration. Its source is `<module>/src/`.

2. **Clone.**
   ```bash
   rm -rf "$TMPDIR/talos-design-<name>"
   git clone --depth 1 https://github.com/ooneex/skeleton-design.git "$TMPDIR/talos-design-<name>"
   ```

3. **Rewrite imports** across the clone's `src/`: `from "@/` → `from "@module/<name>/"`. Do this before comparing so alias differences aren't mistaken for conflicts.

4. **Mirror `src/`.** For each upstream file vs. its counterpart under `<module>/src/`:
   - **Missing locally** → create it verbatim.
   - **Identical** → skip.
   - **Both differ** → merge: adopt upstream's changes, keep local additions/edits; where the same region diverges, resolve toward local intent on upstream's structure. Leave **no** `<<<<<<<`/`>>>>>>>` markers. Never drop a local export or file.

   Do not delete local files absent upstream.

5. **Deps.** From the clone's `package.json`, install only deps not already in the root/module `package.json`: `bun add <new>` / `bun add -D <new-dev>`. Don't touch existing versions.

6. **Clean up + verify.**
   ```bash
   rm -rf "$TMPDIR/talos-design-<name>"
   talos monorepo:check --modules=<name> --logs
   ```
   Fix every failure (usually an unresolved import or type error from the merge). Report files created, files merged, and deps added. Hand app-code failures to the `debug` skill.
