use cli::templates::llm::assistants::{
    ASSISTANTS, ScaffoldInput, default_config_dirs, resolve_adapter,
};

fn minimal_input() -> ScaffoldInput {
    ScaffoldInput {
        agents_md: "# Talos\n".to_string(),
        agents: Vec::new(),
        skills: Vec::new(),
    }
}

#[test]
fn default_config_dirs_returns_only_claude_and_codex() {
    assert_eq!(
        default_config_dirs(),
        vec![".claude".to_string(), ".codex".to_string()]
    );
}

#[test]
fn default_config_dirs_matches_the_enabled_flag_in_the_registry() {
    let expected: Vec<String> = ASSISTANTS
        .iter()
        .filter(|(_, _, enabled)| *enabled)
        .map(|(_, dir, _)| (*dir).to_string())
        .collect();

    assert_eq!(default_config_dirs(), expected);
}

#[test]
fn every_registered_assistant_resolves_an_adapter_that_writes_agents_md() {
    let input = minimal_input();

    for (_, config_dir, _) in ASSISTANTS {
        let adapter = resolve_adapter(config_dir);
        let files = adapter(&input, config_dir);

        assert!(
            files
                .iter()
                .any(|file| file.path == std::path::Path::new("AGENTS.md")),
            "{config_dir} adapter should emit AGENTS.md"
        );
    }
}

// ---------------------------------------------------------------------------
// per-adapter layouts
// ---------------------------------------------------------------------------

use std::path::{Path, PathBuf};

use cli::templates::llm::assistants::{
    GeneratedFile, SkillInput, cline_adapter, codex_adapter, continue_adapter, cursor_adapter,
    default_adapter, gemini_adapter, junie_adapter, roo_adapter, windsurf_adapter, zed_adapter,
};

/// An agent template in the shape the loader hands the adapters: Claude front
/// matter followed by the instruction body.
const AGENT: &str = "\
---
name: api-issue-fixer
description: Implements a planned issue in an api module.
tools: Read, Edit, Write, Bash
---

Do the work, then run the checks.
";

const SKILL: &str = "\
---
name: commit
description: Create commit messages grouped by module.
---

Group the changes, then write one commit per module.
";

fn full_input() -> ScaffoldInput {
    ScaffoldInput {
        agents_md: "# Talos\n\nThe project guide.\n".to_string(),
        agents: vec![("api-issue-fixer".to_string(), AGENT.to_string())],
        skills: vec![(
            "talos.commit".to_string(),
            SkillInput {
                source: SKILL.to_string(),
                references: vec![("conventions.md".to_string(), "# Conventions\n".to_string())],
            },
        )],
    }
}

fn paths(files: &[GeneratedFile]) -> Vec<PathBuf> {
    files.iter().map(|file| file.path.clone()).collect()
}

fn content_of<'a>(files: &'a [GeneratedFile], path: &str) -> &'a str {
    files
        .iter()
        .find(|file| file.path == Path::new(path))
        .map(|file| file.content.as_str())
        .unwrap_or_else(|| panic!("{path} should have been generated"))
}

#[test]
fn default_adapter_lays_agents_and_skills_out_under_the_config_dir() {
    let files = default_adapter(&full_input(), ".claude");

    let paths = paths(&files);
    assert!(paths.contains(&PathBuf::from("AGENTS.md")));
    assert!(paths.contains(&Path::new(".claude/agents/api-issue-fixer.md").to_path_buf()));
    assert!(paths.contains(&Path::new(".claude/skills/talos-commit/SKILL.md").to_path_buf()));
    assert!(paths.contains(
        &Path::new(".claude/skills/talos-commit/references/conventions.md").to_path_buf()
    ));
}

#[test]
fn default_adapter_passes_the_claude_sources_through_untouched() {
    let files = default_adapter(&full_input(), ".claude");

    assert_eq!(
        content_of(&files, ".claude/agents/api-issue-fixer.md"),
        AGENT
    );
    assert_eq!(
        content_of(&files, ".claude/skills/talos-commit/SKILL.md"),
        SKILL
    );
}

#[test]
fn cursor_adapter_emits_body_only_slash_commands() {
    let files = cursor_adapter(&full_input(), ".cursor");

    let command = content_of(&files, ".cursor/commands/api-issue-fixer.md");
    assert!(command.contains("Do the work, then run the checks."));
    // Cursor commands carry no front matter at all.
    assert!(!command.contains("---"));
    assert!(!command.contains("description:"));
}

#[test]
fn default_adapter_honours_whatever_config_dir_it_is_given() {
    let files = default_adapter(&full_input(), ".custom");

    assert!(paths(&files).contains(&Path::new(".custom/agents/api-issue-fixer.md").to_path_buf()));
}

#[test]
fn codex_adapter_writes_toml_agents_and_trimmed_skills() {
    let files = codex_adapter(&full_input(), ".codex");

    let paths = paths(&files);
    assert!(paths.contains(&Path::new(".codex/agents/api-issue-fixer.toml").to_path_buf()));
    assert!(paths.contains(&Path::new(".codex/skills/talos-commit/SKILL.md").to_path_buf()));
    assert!(paths.contains(
        &Path::new(".codex/skills/talos-commit/references/conventions.md").to_path_buf()
    ));
    // The reference doc is copied verbatim whatever the assistant.
    assert_eq!(
        content_of(
            &files,
            ".codex/skills/talos-commit/references/conventions.md"
        ),
        "# Conventions\n"
    );
}

#[test]
fn every_adapter_slugifies_a_dotted_skill_name() {
    let input = full_input();

    for adapter in [
        default_adapter,
        codex_adapter,
        gemini_adapter,
        cursor_adapter,
        windsurf_adapter,
        cline_adapter,
        junie_adapter,
        roo_adapter,
        continue_adapter,
        zed_adapter,
    ] {
        let files = adapter(&input, ".claude");

        assert!(
            files
                .iter()
                .all(|file| !file.path.to_string_lossy().contains("talos.commit")),
            "a dotted skill name should never reach the filesystem"
        );
    }
}

/// Not every assistant has somewhere to put an agent's metadata: cursor,
/// cline and junie render body-only prompts, so their front matter is stripped
/// rather than carried over.
#[test]
fn every_metadata_carrying_adapter_keeps_the_agent_description() {
    let input = full_input();

    for (name, adapter) in [
        (
            "default",
            default_adapter as fn(&ScaffoldInput, &str) -> Vec<GeneratedFile>,
        ),
        ("codex", codex_adapter),
        ("gemini", gemini_adapter),
        ("windsurf", windsurf_adapter),
        ("roo", roo_adapter),
        ("continue", continue_adapter),
        ("zed", zed_adapter),
    ] {
        let files = adapter(&input, ".claude");
        let all: String = files.iter().map(|file| file.content.as_str()).collect();

        assert!(
            all.contains("Implements a planned issue in an api module."),
            "{name}: the agent description should survive the conversion"
        );
    }
}

#[test]
fn the_body_only_adapters_strip_front_matter_entirely() {
    let input = full_input();

    for (name, adapter) in [
        (
            "cursor",
            cursor_adapter as fn(&ScaffoldInput, &str) -> Vec<GeneratedFile>,
        ),
        ("cline", cline_adapter),
        ("junie", junie_adapter),
    ] {
        let files = adapter(&input, ".claude");
        let rendered: String = files
            .iter()
            .filter(|file| file.path != Path::new("AGENTS.md"))
            .map(|file| file.content.as_str())
            .collect();

        assert!(
            !rendered.contains("Implements a planned issue in an api module."),
            "{name}: renders prompts only, so the description should be stripped"
        );
        assert!(
            rendered.contains("Do the work, then run the checks."),
            "{name}: the instruction body is the whole point and must survive"
        );
    }
}

#[test]
fn every_adapter_carries_the_instruction_body_into_its_output() {
    let input = full_input();

    for adapter in [
        default_adapter,
        codex_adapter,
        gemini_adapter,
        cursor_adapter,
        windsurf_adapter,
        cline_adapter,
        junie_adapter,
        roo_adapter,
        continue_adapter,
        zed_adapter,
    ] {
        let files = adapter(&input, ".claude");
        let all: String = files.iter().map(|file| file.content.as_str()).collect();

        assert!(
            all.contains("Do the work, then run the checks."),
            "the agent body should survive the conversion"
        );
    }
}

#[test]
fn roo_adapter_declares_a_custom_mode_per_agent() {
    let files = roo_adapter(&full_input(), ".roo");

    let roomodes = content_of(&files, ".roomodes");
    assert!(roomodes.starts_with("customModes:\n"));
    assert!(roomodes.contains("- slug: api-issue-fixer"));
    assert!(roomodes.contains("roleDefinition:"));
    assert!(roomodes.contains("groups:"));
    assert!(roomodes.contains("customInstructions:"));
}

#[test]
fn roo_adapter_grants_write_access_only_to_agents_that_need_it() {
    let read_only = ScaffoldInput {
        agents_md: "# Talos\n".to_string(),
        agents: vec![(
            "reviewer".to_string(),
            "---\nname: reviewer\ndescription: Reviews code.\ntools: Read, Grep\n---\n\nReview it.\n"
                .to_string(),
        )],
        skills: Vec::new(),
    };

    let writer = roo_adapter(&full_input(), ".roo");
    let reader = roo_adapter(&read_only, ".roo");

    assert!(content_of(&writer, ".roomodes").contains("groups: [read, edit, command]"));
    assert!(content_of(&reader, ".roomodes").contains("groups: [read]"));
}

#[test]
fn every_adapter_copes_with_nothing_to_render() {
    let empty = ScaffoldInput {
        agents_md: "# Talos\n".to_string(),
        agents: Vec::new(),
        skills: Vec::new(),
    };

    for adapter in [
        default_adapter,
        codex_adapter,
        gemini_adapter,
        cursor_adapter,
        windsurf_adapter,
        cline_adapter,
        junie_adapter,
        roo_adapter,
        continue_adapter,
        zed_adapter,
    ] {
        let files = adapter(&empty, ".claude");

        // AGENTS.md is unconditional; everything else is derived from input.
        assert!(files.iter().any(|file| file.path == Path::new("AGENTS.md")));
        assert_eq!(content_of(&files, "AGENTS.md"), "# Talos\n");
    }
}

#[test]
fn no_adapter_emits_the_same_path_twice() {
    let input = full_input();

    for adapter in [
        default_adapter,
        codex_adapter,
        gemini_adapter,
        cursor_adapter,
        windsurf_adapter,
        cline_adapter,
        junie_adapter,
        roo_adapter,
        continue_adapter,
        zed_adapter,
    ] {
        let mut paths = paths(&adapter(&input, ".claude"));
        let before = paths.len();
        paths.sort();
        paths.dedup();

        assert_eq!(paths.len(), before, "a path was generated twice");
    }
}
