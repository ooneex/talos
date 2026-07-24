use rust_cli::templates::llm::assistants::{
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
