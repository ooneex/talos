//! Scaffolding a whole project, and the assistant configuration that goes with it.
//!
//! `app:init` copies the skeleton into a new directory and renames what carries
//! the project's name; `agent:skills:create` renders the skeleton's `.claude`
//! tree into one directory per assistant. Both read the skeleton, so both run
//! against a miniature one — seeded into `$HOME/.talos/skeleton` for the first
//! and handed over with `--source-dir` for the second.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use cli::commands::app_init::{AppInitOptions, execute, scaffold_destination};

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("a parent")).expect("create parent");
    fs::write(path, content).expect("write file");
}

/// A miniature skeleton: a root manifest, an app module with an example
/// environment, a README to rename, and the `.claude` tree the assistant
/// scaffolder reads.
fn skeleton(dir: &Path) {
    write(
        &dir.join("package.json"),
        "{\n  \"name\": \"skeleton\"\n}\n",
    );
    write(&dir.join("bun.lock"), "{}\n");
    write(&dir.join("README.md"), "# skeleton\n\nA starting point.\n");
    write(&dir.join("tsconfig.json"), "{ \"compilerOptions\": {} }\n");
    write(&dir.join(".dockerignore"), "node_modules\n");
    write(
        &dir.join("modules/app/.env.example.yml"),
        "server:\n  port: 3000\n",
    );
    write(
        &dir.join("modules/app/package.json"),
        "{ \"name\": \"@module/app\" }\n",
    );
    write(&dir.join(".git/HEAD"), "ref: refs/heads/main\n");

    write(
        &dir.join("AGENTS.md"),
        "# {{NAME}}\n\nConventions for {{NAME}}.\n",
    );
    write(
        &dir.join(".claude/agents/reviewer.md"),
        "---\nname: reviewer\ndescription: Reviews a diff\n---\n\nReview the diff.\n",
    );
    write(
        &dir.join(".claude/skills/deploy/SKILL.md"),
        "---\nname: deploy\ndescription: Deploys the app\n---\n\nRun the deploy.\n",
    );
    write(
        &dir.join(".claude/skills/deploy/references/checklist.md"),
        "- [ ] Tag the release\n",
    );
}

/// A `$HOME` whose skeleton cache holds the miniature skeleton.
fn seeded_home() -> tempfile::TempDir {
    let home = tempfile::tempdir().expect("create temp home");
    skeleton(&home.path().join(".talos/skeleton"));
    home
}

fn talos(cwd: &Path, home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .current_dir(cwd)
        .env("HOME", home)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|_| panic!("{} should exist", path.display()))
}

// ---------------------------------------------------------------------------
// scaffold_destination
// ---------------------------------------------------------------------------

#[test]
fn scaffolding_copies_the_skeleton_and_renames_what_carries_the_project_name() {
    let source = tempfile::tempdir().expect("create temp dir");
    let target = tempfile::tempdir().expect("create temp dir");
    skeleton(source.path());
    let destination = target.path().join("my-app");

    scaffold_destination(source.path(), &destination, "my-app", None).expect("scaffolded");

    assert!(destination.join("package.json").is_file());
    assert!(
        !destination.join(".git").exists(),
        "the skeleton's own history does not come along"
    );
    assert!(
        !destination.join("bun.lock").exists(),
        "the lockfile is left for the install to write"
    );
    assert_eq!(
        read(&destination.join("modules/my-app/.env.yml")),
        "server:\n  port: 3000\n",
        "the example environment becomes the real one"
    );
    assert!(
        !destination.join("modules/my-app/.env.example.yml").exists(),
        "and the example is removed"
    );
    assert!(
        !destination.join("modules/app").exists(),
        "the app module directory is renamed to the project's name"
    );
    assert!(
        read(&destination.join("README.md")).starts_with("# my-app"),
        "the first heading takes the project's name"
    );
}

#[test]
fn scaffolding_over_an_existing_directory_replaces_it() {
    let source = tempfile::tempdir().expect("create temp dir");
    let target = tempfile::tempdir().expect("create temp dir");
    skeleton(source.path());
    let destination = target.path().join("my-app");
    write(&destination.join("leftover.txt"), "from an earlier run\n");

    scaffold_destination(source.path(), &destination, "my-app", None).expect("scaffolded");

    assert!(
        !destination.join("leftover.txt").exists(),
        "the earlier run is cleared out first"
    );
}

#[test]
fn scaffolding_from_a_directory_that_is_not_there_is_an_error_rather_than_a_panic() {
    let target = tempfile::tempdir().expect("create temp dir");

    let result = scaffold_destination(
        Path::new("/definitely/not/a/skeleton"),
        &target.path().join("my-app"),
        "my-app",
        None,
    );

    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// app:init
// ---------------------------------------------------------------------------

#[test]
fn initializing_a_project_lands_a_git_repository_carrying_the_skeleton() {
    let home = seeded_home();
    let target = tempfile::tempdir().expect("create temp dir");
    let destination = target.path().join("my-app");
    // `execute` reads the skeleton through `$HOME`, which is process-wide.
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    let created = execute(AppInitOptions {
        name: "MyApp".to_string(),
        destination: destination.clone(),
        silent: true,
        app_type: None,
        no_cache: false,
        announce: true,
    })
    .expect("the project was initialized");

    assert_eq!(created, destination);
    assert!(destination.join("package.json").is_file());
    assert!(
        destination.join(".git").is_dir(),
        "the new project gets a history of its own"
    );
    assert!(read(&destination.join("README.md")).starts_with("# my-app"));
}

#[test]
fn app_init_refuses_to_run_without_git_on_the_path() {
    let home = seeded_home();
    let workdir = tempfile::tempdir().expect("create temp dir");

    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args([
            "app:init",
            "--name=my-app",
            "--destination=my-app",
            "--silent",
        ])
        .current_dir(workdir.path())
        .env("HOME", home.path())
        .env("PATH", "/nonexistent")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output()
        .expect("the talos binary should run");

    assert!(text(&output).contains("git"), "{}", text(&output));
}

// ---------------------------------------------------------------------------
// agent:skills:create
// ---------------------------------------------------------------------------

#[test]
fn the_claude_layout_is_rendered_verbatim_into_the_project() {
    let source = tempfile::tempdir().expect("create temp dir");
    let target = tempfile::tempdir().expect("create temp dir");
    let home = tempfile::tempdir().expect("create temp home");
    skeleton(source.path());

    let output = talos(
        target.path(),
        home.path(),
        &[
            "agent:skills:create",
            "--agents=.claude",
            "--name=my-app",
            &format!("--source-dir={}", source.path().display()),
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert!(
        read(&target.path().join("AGENTS.md")).contains("Conventions for my-app"),
        "the project name is rendered into the conventions"
    );
    assert!(
        target.path().join(".claude/agents/reviewer.md").is_file(),
        "the agents come across"
    );
    assert!(
        target
            .path()
            .join(".claude/skills/deploy/SKILL.md")
            .is_file(),
        "so do the skills"
    );
    assert!(
        target
            .path()
            .join(".claude/skills/deploy/references/checklist.md")
            .is_file(),
        "and the references beside them"
    );
}

#[test]
fn each_assistant_gets_the_layout_it_expects() {
    let source = tempfile::tempdir().expect("create temp dir");
    let target = tempfile::tempdir().expect("create temp dir");
    let home = tempfile::tempdir().expect("create temp home");
    skeleton(source.path());

    let output = talos(
        target.path(),
        home.path(),
        &[
            "agent:skills:create",
            "--name=my-app",
            &format!("--source-dir={}", source.path().display()),
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    let written: Vec<PathBuf> = walk(target.path());
    assert!(
        written.iter().any(|path| path.starts_with(".claude")),
        "{written:?}"
    );
    assert!(
        written.iter().any(|path| path.starts_with(".codex")),
        "{written:?}"
    );
    assert!(
        written.contains(&PathBuf::from(".codex/agents/reviewer.toml")),
        "codex takes the agents in its own format: {written:?}"
    );
}

#[test]
fn a_source_directory_with_no_assistant_tree_writes_nothing_but_the_conventions() {
    let source = tempfile::tempdir().expect("create temp dir");
    let target = tempfile::tempdir().expect("create temp dir");
    let home = tempfile::tempdir().expect("create temp home");
    write(&source.path().join("AGENTS.md"), "# {{NAME}}\n");

    let output = talos(
        target.path(),
        home.path(),
        &[
            "agent:skills:create",
            "--agents=.claude",
            "--name=my-app",
            &format!("--source-dir={}", source.path().display()),
            "--silent",
        ],
    );

    assert!(output.status.success(), "{}", text(&output));
    assert!(
        !target.path().join(".claude/agents").exists(),
        "there was nothing to render"
    );
}

/// Every file below a directory, relative to it.
fn walk(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(relative) = path.strip_prefix(root) {
                found.push(relative.to_path_buf());
            }
        }
    }
    found.sort();
    found
}
