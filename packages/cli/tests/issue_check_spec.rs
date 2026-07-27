use std::fs;
use std::path::{Path, PathBuf};

use clap::Parser;
use cli::commands::issue_check::{
    CheckOptions, CheckReport, IssueCheckArgs, Severity, execute, expected_goal_section,
    find_dependency_cycle, is_kebab_case, is_valid_issue_id,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: IssueCheckArgs,
}

const PLANNED: &str = r#"id: "ABC-100000"
module: "user"
title: "Add user create endpoint"
state: "Planned"
priority: "High"
labels:
  - "Feature"
  - "API"
context: |
  Users cannot be created yet.
goal: |
  Expose a create endpoint.

  ## Technical Notes

  ### Data Model
  - `User.posts` → `@OneToMany(() => Post, (post) => post.user)` — one user has many posts
dod: |
  - [ ] The endpoint returns 201 on success
  - [ ] Duplicate emails are rejected
testing: |
  1. [ ] Run `talos monorepo:check` — lint, types and tests pass.
  2. [ ] POST `/users` with a new email — responds 201.
dependencies: []
"#;

fn root() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

fn write_module(root: &Path, name: &str, module_type: Option<&str>) {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(dir.join("issues")).expect("create issues dir");
    if let Some(module_type) = module_type {
        fs::write(
            dir.join(format!("{name}.yml")),
            format!("name: \"{name}\"\ntype: \"{module_type}\"\n"),
        )
        .expect("write module descriptor");
    }
}

fn write_issue(root: &Path, module: &str, id: &str, content: &str) -> PathBuf {
    let path = root
        .join("modules")
        .join(module)
        .join("issues")
        .join(format!("{id}.yml"));
    fs::create_dir_all(path.parent().expect("parent")).expect("create issues dir");
    fs::write(&path, content).expect("write issue");
    path
}

fn check(root: &Path) -> CheckReport {
    execute(root, &CheckOptions::default())
}

fn rules(report: &CheckReport) -> Vec<&'static str> {
    report.rules()
}

fn has(report: &CheckReport, rule: &str) -> bool {
    report.diagnostics.iter().any(|entry| entry.rule == rule)
}

fn severity_of(report: &CheckReport, rule: &str) -> Option<Severity> {
    report
        .diagnostics
        .iter()
        .find(|entry| entry.rule == rule)
        .map(|entry| entry.severity)
}

// --- Argument parsing ---------------------------------------------------------

#[test]
fn issue_check_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--module",
        "user,product",
        "--id",
        "ABC-100000",
        "--strict",
        "--json",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(
        cli.args.module,
        vec!["user".to_string(), "product".to_string()]
    );
    assert_eq!(cli.args.id, vec!["ABC-100000".to_string()]);
    assert!(cli.args.strict);
    assert!(cli.args.json);
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn issue_check_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.module.is_empty());
    assert!(cli.args.id.is_empty());
    assert!(!cli.args.strict);
    assert!(!cli.args.json);
}

#[test]
fn issue_check_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// --- Format helpers -----------------------------------------------------------

#[test]
fn valid_issue_ids_cover_generated_and_tracker_formats() {
    for id in ["ABC-100000", "OON-1", "ENG-45", "A1B-999999", "123"] {
        assert!(is_valid_issue_id(id), "{id} should be valid");
    }
    for id in [
        "abc-100000",
        "AB",
        "ABC-",
        "-100000",
        "ABC-1234567",
        "ABC 100",
    ] {
        assert!(!is_valid_issue_id(id), "{id} should be invalid");
    }
}

#[test]
fn kebab_case_rejects_uppercase_and_stray_dashes() {
    assert!(is_kebab_case("add-user-create"));
    assert!(!is_kebab_case("Add-User"));
    assert!(!is_kebab_case("add--user"));
    assert!(!is_kebab_case("-add"));
    assert!(!is_kebab_case(""));
}

#[test]
fn goal_sections_follow_the_module_type() {
    assert_eq!(expected_goal_section("module"), Some("### Data Model"));
    assert_eq!(expected_goal_section("api"), Some("### Data Model"));
    assert_eq!(
        expected_goal_section("spa"),
        Some("### Front-End Structure")
    );
    assert_eq!(
        expected_goal_section("design"),
        Some("### Design System Structure")
    );
    assert_eq!(expected_goal_section("sdk"), None);
}

#[test]
fn dependency_cycles_are_detected() {
    let graph = [
        ("A".to_string(), vec!["B".to_string()]),
        ("B".to_string(), vec!["C".to_string()]),
        ("C".to_string(), vec!["A".to_string()]),
    ]
    .into_iter()
    .collect();
    let cycle = find_dependency_cycle(&graph).expect("a cycle should be found");
    assert!(cycle.contains(&"A".to_string()));

    let acyclic = [
        ("A".to_string(), vec!["B".to_string()]),
        ("B".to_string(), vec![]),
    ]
    .into_iter()
    .collect();
    assert!(find_dependency_cycle(&acyclic).is_none());
}

// --- Happy path ---------------------------------------------------------------

#[test]
fn a_fully_planned_issue_reports_nothing() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(&root, "user", "ABC-100000", PLANNED);

    let report = check(&root);

    assert_eq!(report.files, 1);
    assert_eq!(report.modules, 1);
    assert!(
        report.diagnostics.is_empty(),
        "expected no diagnostics, got {:?}",
        rules(&report)
    );
}

#[test]
fn a_scaffolded_todo_issue_only_warns_about_missing_content() {
    let (_guard, root) = root();
    write_module(&root, "shared", None);
    write_issue(
        &root,
        "shared",
        "ABC-200000",
        "id: \"ABC-200000\"\nmodule: \"shared\"\ntitle: \"Add a thing\"\nstate: \"Todo\"\npriority: \"Medium\"\ndescription: null\nlabels: []\n",
    );

    let report = check(&root);

    assert_eq!(report.errors(), 0, "{:?}", rules(&report));
    assert!(has(&report, "issue.todo.no-content"));
    assert_eq!(
        severity_of(&report, "issue.todo.no-content"),
        Some(Severity::Warning)
    );
}

#[test]
fn packages_are_scanned_alongside_modules() {
    let (_guard, root) = root();
    let dir = root.join("packages").join("shared");
    fs::create_dir_all(dir.join("issues")).expect("create issues dir");
    fs::write(
        dir.join("issues").join("ABC-100000.yml"),
        PLANNED.replace("module: \"user\"", "module: \"shared\""),
    )
    .expect("write issue");

    let report = check(&root);

    assert_eq!(report.files, 1);
    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}

#[test]
fn an_empty_project_reports_nothing() {
    let (_guard, root) = root();

    let report = check(&root);

    assert_eq!(report.files, 0);
    assert!(report.diagnostics.is_empty());
}

// --- Broken file guards -------------------------------------------------------

#[test]
fn invalid_yaml_is_reported_without_further_checks() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\n  bad: [\n",
    );

    let report = check(&root);

    assert!(has(&report, "issue.yaml.parse"), "{:?}", rules(&report));
    assert!(!has(&report, "issue.title.missing"));
}

#[test]
fn a_non_mapping_document_is_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(&root, "user", "ABC-100000", "- one\n- two\n");

    let report = check(&root);

    assert!(has(&report, "issue.yaml.not-a-mapping"));
}

#[test]
fn an_empty_file_is_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(&root, "user", "ABC-100000", "\n   \n");

    let report = check(&root);

    assert!(has(&report, "issue.file.empty"));
}

#[test]
fn duplicate_top_level_keys_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("dependencies: []", "dependencies: []\nstate: \"Done\""),
    );

    let report = check(&root);

    assert!(
        has(&report, "issue.yaml.duplicate-key"),
        "{:?}",
        rules(&report)
    );
}

#[test]
fn tab_indentation_is_rejected_before_parsing() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\nlabels:\n\t- \"Feature\"\n",
    );

    let report = check(&root);

    assert!(has(&report, "issue.file.tab-indentation"));
    assert!(!has(&report, "issue.yaml.parse"));
}

#[test]
fn a_byte_order_mark_is_reported() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    let path = write_issue(&root, "user", "ABC-100000", PLANNED);
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(&fs::read(&path).expect("read issue"));
    fs::write(&path, bytes).expect("write issue with bom");

    let report = check(&root);

    assert!(has(&report, "issue.file.bom"));
}

#[test]
fn invalid_utf8_is_reported_without_panicking() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    let path = write_issue(&root, "user", "ABC-100000", PLANNED);
    fs::write(&path, [0x69, 0x64, 0x3A, 0x20, 0xFF, 0xFE, 0x0A]).expect("write invalid utf8");

    let report = check(&root);

    assert!(has(&report, "issue.file.encoding"));
}

#[test]
fn oversized_files_are_refused() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(&root, "user", "ABC-100000", &"# padding\n".repeat(60_000));

    let report = check(&root);

    assert!(has(&report, "issue.file.too-large"));
}

#[test]
fn stray_files_in_the_issues_directory_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    fs::write(
        root.join("modules")
            .join("user")
            .join("issues")
            .join("notes.yaml"),
        "id: \"ABC-100000\"\n",
    )
    .expect("write stray file");

    let report = check(&root);

    assert!(has(&report, "issue.file.extension"));
}

// --- Identity -----------------------------------------------------------------

#[test]
fn the_id_must_match_the_file_name_and_format() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("id: \"ABC-100000\"", "id: \"nope\""),
    );

    let report = check(&root);

    assert!(has(&report, "issue.id.format"));
    assert!(has(&report, "issue.id.filename-mismatch"));
}

#[test]
fn the_module_field_must_match_the_owning_directory() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("module: \"user\"", "module: \"product\""),
    );

    let report = check(&root);

    assert!(has(&report, "issue.module.mismatch"));
}

#[test]
fn duplicate_ids_across_modules_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_module(&root, "product", Some("module"));
    write_issue(&root, "user", "ABC-100000", PLANNED);
    write_issue(
        &root,
        "product",
        "ABC-100000",
        &PLANNED.replace("module: \"user\"", "module: \"product\""),
    );

    let report = check(&root);

    assert_eq!(
        report
            .diagnostics
            .iter()
            .filter(|entry| entry.rule == "issue.id.duplicate")
            .count(),
        2
    );
}

#[test]
fn unknown_fields_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("dependencies: []", "dependencies: []\nassignee: \"me\""),
    );

    let report = check(&root);

    assert!(has(&report, "issue.field.unknown"));
}

// --- Vocabularies -------------------------------------------------------------

#[test]
fn states_and_priorities_are_case_sensitive() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED
            .replace("state: \"Planned\"", "state: \"planned\"")
            .replace("priority: \"High\"", "priority: \"urgent\""),
    );

    let report = check(&root);

    assert!(has(&report, "issue.state.invalid"));
    assert!(has(&report, "issue.priority.invalid"));
}

#[test]
fn labels_must_come_from_the_vocabulary_with_a_change_type_first() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "labels:\n  - \"Feature\"\n  - \"API\"",
            "labels:\n  - \"API\"\n  - \"Feature\"\n  - \"Nonsense\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.labels.unknown"));
    assert!(has(&report, "issue.labels.change-type-first"));
}

#[test]
fn duplicate_labels_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "labels:\n  - \"Feature\"\n  - \"API\"",
            "labels:\n  - \"Feature\"\n  - \"Feature\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.labels.duplicate"));
}

// --- Planned structure --------------------------------------------------------

#[test]
fn planned_issues_require_the_full_structure() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\nmodule: \"user\"\ntitle: \"Add user create endpoint\"\nstate: \"Planned\"\npriority: \"High\"\n",
    );

    let report = check(&root);

    for rule in [
        "issue.labels.missing",
        "issue.context.missing",
        "issue.goal.missing",
        "issue.dod.missing",
        "issue.testing.missing",
    ] {
        assert!(
            has(&report, rule),
            "expected {rule} in {:?}",
            rules(&report)
        );
    }
}

#[test]
fn a_legacy_description_is_rejected_once_planned() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "dependencies: []",
            "dependencies: []\ndescription: \"Old text\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.description.legacy"));
}

#[test]
fn dod_items_must_be_checkboxes() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "  - [ ] The endpoint returns 201 on success",
            "  The endpoint returns 201 on success",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.dod.format"), "{:?}", rules(&report));
}

#[test]
fn dod_items_must_not_carry_implementation_syntax() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "  - [ ] Duplicate emails are rejected",
            "  - [ ] `posts` — `@OneToMany(() => Post)`\n  - [ ] `addressId` — the user address",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.dod.implementation-detail"));
    assert!(has(&report, "issue.dod.id-suffix"));
}

#[test]
fn testing_steps_must_be_numbered_sequentially() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "  2. [ ] POST `/users` with a new email — responds 201.",
            "  4. [ ] POST `/users` with a new email — responds 201.",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.testing.numbering"));
}

#[test]
fn goal_sections_must_match_the_module_type() {
    let (_guard, root) = root();
    write_module(&root, "storefront", Some("spa"));
    write_issue(
        &root,
        "storefront",
        "ABC-100000",
        &PLANNED.replace("module: \"user\"", "module: \"storefront\""),
    );

    let report = check(&root);

    assert!(
        has(&report, "issue.goal.section-mismatch"),
        "{:?}",
        rules(&report)
    );
}

// --- Implementation states ----------------------------------------------------

#[test]
fn issues_in_review_need_a_branch_and_every_box_checked() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("state: \"Planned\"", "state: \"In Review\""),
    );

    let report = check(&root);

    assert!(has(&report, "issue.branch.missing"));
    assert!(has(&report, "issue.dod.unchecked"));
    assert!(has(&report, "issue.testing.unchecked"));
}

#[test]
fn a_complete_in_review_issue_passes() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED
            .replace("state: \"Planned\"", "state: \"In Review\"")
            .replace(
                "priority: \"High\"",
                "priority: \"High\"\nbranch: \"feat/ABC-100000-add-user-create\"\npr: \"https://github.com/acme/api/pull/12\"",
            )
            .replace("- [ ]", "- [x]")
            .replace(". [ ]", ". [x]"),
    );

    let report = check(&root);

    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}

#[test]
fn a_branch_must_match_its_issue_and_labels() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "priority: \"High\"",
            "priority: \"High\"\nbranch: \"docs/ABC-999999-something\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.branch.id-mismatch"));
    assert!(has(&report, "issue.branch.type-mismatch"));
}

#[test]
fn a_pr_must_be_a_pull_request_url() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "priority: \"High\"",
            "priority: \"High\"\npr: \"https://github.com/acme/api/issues/12\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.pr.format"));
}

#[test]
fn to_merge_requires_a_pull_request() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED
            .replace("state: \"Planned\"", "state: \"To Merge\"")
            .replace(
                "priority: \"High\"",
                "priority: \"High\"\nbranch: \"feat/ABC-100000-add-user-create\"",
            )
            .replace("- [ ]", "- [x]")
            .replace(". [ ]", ". [x]"),
    );

    let report = check(&root);

    assert!(has(&report, "issue.pr.missing"));
    assert_eq!(
        severity_of(&report, "issue.pr.missing"),
        Some(Severity::Error)
    );
}

// --- Dependencies -------------------------------------------------------------

#[test]
fn unknown_and_self_dependencies_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "dependencies: []",
            "dependencies:\n  - \"ABC-100000\"\n  - \"ZZZ-999999\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.dependencies.self"));
    assert!(has(&report, "issue.dependencies.unknown"));
}

#[test]
fn dependency_cycles_across_files_are_rejected() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("dependencies: []", "dependencies:\n  - \"ABC-100001\""),
    );
    write_issue(
        &root,
        "user",
        "ABC-100001",
        &PLANNED
            .replace("ABC-100000", "ABC-100001")
            .replace("dependencies: []", "dependencies:\n  - \"ABC-100000\""),
    );

    let report = check(&root);

    assert!(
        has(&report, "issue.dependencies.cycle"),
        "{:?}",
        rules(&report)
    );
}

#[test]
fn a_valid_dependency_chain_passes() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100001",
        &PLANNED.replace("ABC-100000", "ABC-100001"),
    );
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("dependencies: []", "dependencies:\n  - \"ABC-100001\""),
    );

    let report = check(&root);

    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}

// --- Nested structures --------------------------------------------------------

#[test]
fn comments_require_a_message_and_known_fields() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "dependencies: []",
            "dependencies: []\ncomments:\n  - author: \"Alice\"\n  - message: \"Hi\"\n    role: \"lead\"",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.comments.message"));
    assert!(has(&report, "issue.comments.unknown-field"));
}

#[test]
fn a_spec_block_is_validated() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace(
            "dependencies: []",
            "dependencies: []\nspec:\n  name: \"organization create\"\n  roles: \"ROLE_ADMIN\"\n  extra: true",
        ),
    );

    let report = check(&root);

    assert!(has(&report, "issue.spec.name"));
    assert!(has(&report, "issue.spec.roles"));
    assert!(has(&report, "issue.spec.unknown-field"));
}

// --- Robustness ---------------------------------------------------------------

#[test]
fn adversarial_content_never_panics() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100000",
        "id: \"ABC-100000\"\nmodule: \"user\"\ntitle: \"Ajouter la création d'un utilisateur 🚀 — 日本語\"\nstate: \"In Review\"\npriority: \"Medium\"\nlabels:\n  - \"Feature\"\ncontext: |\n  Contexte é🚀日本\ngoal: |\n  但し書き\n\n  ### Modèle de données 🚀\ndod: |\n  - [\n  - [] é\n  - [ ]\n  - [ ] 🚀 `é`\n     - [x] déjà fait\n  -[ ] serré\ntesting: |\n  1. [ ] 🚀 étape\n  é. [ ] pas un numéro\n  2. [x] 日本語\ndependencies: []\n",
    );

    let report = check(&root);

    assert!(report.errors() > 0);
    assert!(
        report
            .diagnostics
            .iter()
            .all(|entry| !entry.message.is_empty())
    );
}

#[test]
fn a_deeply_nested_dependency_chain_is_handled() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    for index in 0..60 {
        let id = format!("ABC-2{index:05}");
        let dependency = format!("ABC-2{:05}", index + 1);
        let dependencies = if index == 59 {
            "dependencies: []".to_string()
        } else {
            format!("dependencies:\n  - \"{dependency}\"")
        };
        write_issue(
            &root,
            "user",
            &id,
            &PLANNED
                .replace("ABC-100000", &id)
                .replace("dependencies: []", &dependencies),
        );
    }

    let report = check(&root);

    assert_eq!(report.files, 60);
    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}

// --- Filters ------------------------------------------------------------------

#[test]
fn the_module_filter_narrows_the_report() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_module(&root, "product", Some("module"));
    write_issue(&root, "user", "ABC-100000", PLANNED);
    write_issue(
        &root,
        "product",
        "ABC-100001",
        &PLANNED
            .replace("ABC-100000", "ABC-100001")
            .replace("module: \"user\"", "module: \"nope\""),
    );

    let report = execute(
        &root,
        &CheckOptions {
            modules: vec!["user".to_string()],
            ..CheckOptions::default()
        },
    );

    assert_eq!(report.files, 1);
    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}

#[test]
fn the_id_filter_narrows_the_report_but_keeps_dependencies_resolvable() {
    let (_guard, root) = root();
    write_module(&root, "user", Some("module"));
    write_issue(
        &root,
        "user",
        "ABC-100001",
        &PLANNED.replace("ABC-100000", "ABC-100001"),
    );
    write_issue(
        &root,
        "user",
        "ABC-100000",
        &PLANNED.replace("dependencies: []", "dependencies:\n  - \"ABC-100001\""),
    );

    let report = execute(
        &root,
        &CheckOptions {
            ids: vec!["ABC-100000".to_string()],
            ..CheckOptions::default()
        },
    );

    assert_eq!(report.files, 1);
    assert!(report.diagnostics.is_empty(), "{:?}", rules(&report));
}
