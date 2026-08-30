---
name: cli-command-integrate
description: Finish the loop after a `talos`/`oo` CLI command is added, renamed, or has its flags changed in packages/cli/src/commands/ — sync the four shell-completion templates and the matching assistant skill/agent/reference docs in the Skeleton repo. Use right after writing or editing a command file under packages/cli/src/commands/ and registering it in commands/mod.rs. Triggers on "add completions for this command", "sync the skill for this command", "wire up talos {x}:{y}", or as the last step of adding a new CLI command.
---

# CLI Command Integrate

A new/changed Rust command in `packages/cli/src/commands/` is invisible to users and to Claude until three more things happen: it's registered with clap, it completes in a shell, and an assistant skill teaches Claude how to drive it. This skill covers the last two — completions here in Talos, and the Skeleton `.claude/` templates that every generated project's assistant reads.

> Work across two repos: `/Volumes/Projects/Ooneex/Talos` (this one) and `/Volumes/Projects/Ooneex/Skeleton`. Confirm both paths exist before editing; if Skeleton isn't checked out alongside Talos, say so and skip steps 3–4.

## 1. Read the command's real shape

Don't guess the command's contract — read it:

- The command file itself: `Args` struct (every flag, its type, required vs `Option`), and what `run()` actually does.
- Its registration in `packages/cli/src/commands/mod.rs`: the `#[command(name = "...")]` kebab `namespace:action` name and the doc-comment line above the variant (clap's `about`, and the one used in completion descriptions) — add one if missing.
- The dispatch arm further down `mod.rs` (`Commands::X(args) => x::run(args)`) — confirm it's wired, not just declared.

Classify the command against the existing patterns:

- **Resource generator** — flags are exactly `--name`, `--module`, optionally `--override`/`--no-cache`, and it scaffolds a class + test (like `command:create`, `entity:create`, `cache:create`). These share one completion case and one Skeleton skill shape.
- **Check/audit** — reports or fixes findings across the workspace (`security:check`, `coverage:check`, `project:check`).
- **One-off** — its own flag set, e.g. `docker:create`, `app:start`.

## 2. Update the four completion templates

All four live in `packages/cli/src/templates/completions/` and are hand-maintained (baked into the binary via `include_str!` in `completion_zsh.rs`/`completion_bash.rs`/`completion_fish.rs` — there is no generator, editing the `.txt` files directly *is* the fix). `_oo.txt` just delegates to `_talos`; skip it unless you're touching `oo`-only behavior.

For a **resource generator** that fits the shared `--name`/`--module`/`--override` shape, add its name to the existing shared group in each file instead of writing a new block:

- **`_talos.txt`** (zsh): add `'<ns>\:<action>:<Description>'` to the `commands=(...)` array (colons escaped with `\:`), and append `<ns>:<action>` to the pipe-separated case pattern that starts `ai:chat:create|ai:tool:create|...)` (search for `_arguments -s \` right after it to confirm you found the right block).
- **`talos.bash.txt`**: append `<ns>:<action>` to the `commands="..."` string, and to the case pattern `ai:chat:create | ai:tool:create | ... )` that sets `opts="--name --module --override"`.
- **`talos.fish.txt`**: add a `complete -c $cmd -f -n __fish_use_subcommand -a <ns>:<action> -d '<Description>'` line in the subcommand block, and append `<ns>:<action>` to the `set -l __talos_resource_cmds \` list.

For a **check/audit or one-off** command, add a dedicated block instead, following the nearest sibling as a template:

- zsh: new `commands=(...)` entry, new `'<ns>\:<action>')` case arm under the big `case "$words[2]"`-style switch with its own `_arguments -s \` flags (use `_talos_modules`/`_talos_packages` etc. for dynamic completions if a flag takes a module/package name).
- bash: new `commands="..."` entry, new `<ns>:<action>)` case arm setting `opts="..."` and any `candidates=`/`dirs=1` lines; add a `_talos_xxx()` helper near the top if a flag needs dynamic values not already covered.
- fish: new `complete -c $cmd -f -n __fish_use_subcommand -a ...` line, plus one `complete -c $cmd -n "__fish_seen_subcommand_from <ns>:<action>" -l <flag> ...` line per flag.

Keep every list alphabetically/logically grouped the way the surrounding entries already are — don't just append at the end.

### Verify

```bash
cd packages/cli
zsh -n src/templates/completions/_talos.txt
bash -n src/templates/completions/talos.bash.txt
fish --no-execute src/templates/completions/talos.fish.txt   # if fish is installed; skip otherwise
cargo check   # confirms commands/mod.rs registration + dispatch arm compile
```

## 3. Sync the Skeleton skill/agent templates

`/Volumes/Projects/Ooneex/Skeleton/.claude/{agents,skills}` is the canonical source `talos agent:skills:create` fetches (see `packages/cli/src/utils/skeleton.rs` — it clones `github.com/ooneex/skeleton`). Every generated project's assistant config comes from there, so a command Claude should be able to drive needs a home in Skeleton too.

**Resource generator** — mirror an existing sibling skill (`command-create`, `entity-create`, `cache-create`, ...) almost verbatim:

- Read `.claude/skills/command-create/SKILL.md` (or the closest sibling) as the template.
- Create `.claude/skills/<noun>-create/SKILL.md` with frontmatter `allowed-tools: Bash(talos <ns>:<action> *), Bash(talos check *), Read, Edit, Write, Grep, Glob`, `argument-hint: '[--name=<Name>] [--module=<module>]'`.
- Body: run the generator, complete the generated class per its actual TS interface (read the equivalent `@talosjs/<package>` interface this command scaffolds against — check `packages/<package>/src/types.ts` in Talos), complete the test file, lint/format/test, following the exact section structure of the sibling skill.
- Only add a new skill if one doesn't already cover it — check `.claude/skills/*-create/SKILL.md` first.

**Check/audit** — mirror `security-check`/`coverage-check`: a skill that runs `talos <ns>:<action> ...`, reports grouped findings, and supports an `--issues` mode that files one YAML issue per finding. Only add a paired `*-founder`/`*-fixer` agent if the command's findings are large enough to want per-file autonomous fixing (that's the exception, not the default — most commands just need the skill).

**One-off** — usually no new skill; instead extend the most relevant existing reference skill (e.g. `talos-commands`, `talos-scaffold`) with the new invocation.

Whichever shape applies, also update the **`talos-commands`** reference skill (`.claude/skills/talos-commands/SKILL.md`) — this is the flag/command cheat sheet every other skill assumes is current:

- Resource generators: append `<ns>` to the backtick-separated list after *"Class generators share the form..."* and, if it wraps a new skill, note it's covered by the matching `/<noun>-create` skill (already implied by the existing closing sentence — no per-command edit needed unless the artifact name needs spelling out, e.g. `spa:feature`).
- Everything else: add a `talos <ns>:<action> --flag <value> ...  # <description>` line under the matching `##` section (Bootstrap / Application / Generators / Issues / Marketing / Custom commands / etc.), matching the inline-comment style already there.

## 4. Verify and report

```bash
cd /Volumes/Projects/Ooneex/Skeleton && git status --short .claude
cd /Volumes/Projects/Ooneex/Talos && git status --short packages/cli/src/templates/completions packages/cli/src/commands
```

Report, per repo: files created vs. edited, and one line on which completion pattern (resource-generator shared group vs. dedicated block) and which Skeleton shape (new skill / extended skill / reference-only) was used and why. Don't commit — leave that to the `commit` skill.
