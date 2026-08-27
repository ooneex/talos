use cli::commands::project_check::output::{command_line, render, write};
use cli::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ERROR_DETAIL, ProjectCheckArgs, ProjectReport, WARN_DETAIL,
};
use cli::utils::{OUTPUT_DIR, OutputFormat};

fn args() -> ProjectCheckArgs {
    ProjectCheckArgs {
        strict: true,
        modules: Some("user".to_string()),
        ..Default::default()
    }
}

fn report() -> ProjectReport {
    ProjectReport {
        root: "/workspace".to_string(),
        duration_ms: 42_000,
        outcomes: vec![
            CheckOutcome {
                duration_ms: 900,
                ..CheckOutcome::new(CheckId::Structure, CheckStatus::Passed, "12 modules · clean")
            },
            CheckOutcome {
                duration_ms: 1_200,
                ..CheckOutcome::new(CheckId::Routes, CheckStatus::Failed, "modules/user · 2 errors")
                    .with_details(vec![
                        format!("{ERROR_DETAIL}modules/user/src/controllers/user.controller.ts:12 — route has no name"),
                        format!("{WARN_DETAIL}modules/user/src/controllers/user.controller.ts:30 — route has no description"),
                    ])
                    .with_hint("Name every route with @Route({ name })")
            },
            CheckOutcome {
                duration_ms: 300,
                ..CheckOutcome::new(CheckId::Todos, CheckStatus::Warned, "3 TODOs left behind")
            },
            CheckOutcome {
                duration_ms: 0,
                ..CheckOutcome::new(CheckId::Docker, CheckStatus::Skipped, "no Dockerfile")
            },
        ],
    }
}

#[test]
fn markdown_leads_with_the_checks_that_need_work() {
    let markdown = render(OutputFormat::Md, &report(), &args());

    assert!(markdown.starts_with("# talos project:check report"));
    assert!(markdown.contains("**Verdict:** FAILED — 1 check failed and 1 warned"));
    assert!(markdown.contains("`talos project:check --modules=user --strict`"));
    assert!(markdown.contains("- **Workspace:** /workspace"));
    assert!(markdown.contains("## How to use this file"));

    // Failures before warnings, each with what the check verifies and the
    // command that re-runs that one check.
    assert!(markdown.contains("## Work to do (2)"));
    let failed = markdown.find("### Routes — failed").expect("the failure");
    let warned = markdown.find("### Todos — warning").expect("the warning");
    assert!(failed < warned);
    assert!(
        markdown.contains("- Verifies: unique endpoints, named, described, versioned and guarded")
    );
    assert!(
        markdown.contains("- Re-run: `talos project:check --only=routes --modules=user --strict`")
    );
    assert!(markdown.contains("route has no name"));
    assert!(markdown.contains("How to fix it:"));
    assert!(markdown.contains("- Name every route with @Route({ name })"));

    // What needs nothing is named, not detailed — a skipped check is not a
    // green one, so the two are never merged.
    assert!(markdown.contains("## Passing checks (1)"));
    assert!(markdown.contains("`structure`"));
    assert!(markdown.contains("## Skipped checks (1)"));
    assert!(markdown.contains("- `docker` — no Dockerfile"));
}

#[test]
fn markdown_of_a_green_run_carries_no_work() {
    let report = ProjectReport {
        root: "/workspace".to_string(),
        duration_ms: 1_000,
        outcomes: vec![CheckOutcome::new(
            CheckId::Structure,
            CheckStatus::Passed,
            "12 modules · clean",
        )],
    };
    let markdown = render(OutputFormat::Md, &report, &ProjectCheckArgs::default());

    assert!(markdown.contains("**Verdict:** PASSED — every check is green"));
    assert!(!markdown.contains("## Work to do"));
    assert!(markdown.contains("## Passing checks (1)"));
}

#[test]
fn markdown_says_a_run_that_only_warned_still_passed() {
    let report = ProjectReport {
        root: "/workspace".to_string(),
        duration_ms: 1_000,
        outcomes: vec![CheckOutcome::new(
            CheckId::Todos,
            CheckStatus::Warned,
            "3 TODOs left behind",
        )],
    };
    let markdown = render(OutputFormat::Md, &report, &ProjectCheckArgs::default());

    assert!(markdown.contains("**Verdict:** PASSED with 1 warning"));
    assert!(markdown.contains("## Work to do (1)"));
}

#[test]
fn json_carries_the_same_run_in_a_parsable_shape() {
    let json = render(OutputFormat::Json, &report(), &args());
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");

    assert_eq!(value["tool"], "talos project:check");
    assert_eq!(value["root"], "/workspace");
    assert_eq!(value["strict"], true);
    assert_eq!(value["passed"], false);
    assert_eq!(value["counts"]["failed"], 1);
    assert_eq!(value["counts"]["warnings"], 1);
    assert_eq!(value["counts"]["passed"], 1);
    assert_eq!(value["counts"]["skipped"], 1);
    assert_eq!(value["work"][0], "routes");
    assert_eq!(value["work"][1], "todos");

    let checks = value["checks"].as_array().expect("checks");
    assert_eq!(checks.len(), 4);
    let routes = checks
        .iter()
        .find(|check| check["id"] == "routes")
        .expect("the routes check");
    assert_eq!(routes["status"], "failed");
    assert_eq!(
        routes["rerun"],
        "talos project:check --only=routes --modules=user --strict"
    );
    assert_eq!(
        routes["verifies"],
        "unique endpoints, named, described, versioned and guarded"
    );
    assert!(
        routes["details"][0]
            .as_str()
            .expect("a detail")
            .contains("route has no name")
    );
    assert!(
        value["instructions"]
            .as_array()
            .expect("instructions")
            .len()
            >= 4
    );
}

#[test]
fn a_report_is_written_under_var_outputs() {
    let dir = tempfile::tempdir().expect("tempdir");
    let report = report();
    let args = args();

    let markdown =
        write(dir.path(), OutputFormat::Md, &report, &args).expect("the markdown is written");
    let json = write(dir.path(), OutputFormat::Json, &report, &args).expect("the json is written");

    assert_eq!(
        markdown,
        dir.path().join(OUTPUT_DIR).join("talos_project_check.md")
    );
    assert_eq!(
        json,
        dir.path().join(OUTPUT_DIR).join("talos_project_check.json")
    );
    assert!(
        std::fs::read_to_string(&markdown)
            .expect("markdown")
            .contains("# talos project:check report")
    );
    assert!(
        serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&json).expect("json"))
            .is_ok()
    );
}

#[test]
fn the_command_line_is_the_run_without_its_own_output_flag() {
    let args = ProjectCheckArgs {
        only: Some("routes".to_string()),
        skip: Some("docker".to_string()),
        packages: Some("core".to_string()),
        modules: Some("user".to_string()),
        audit_level: Some("high".to_string()),
        threshold: Some(85.0),
        concurrency: Some(4),
        e2e: true,
        outdated: true,
        strict: true,
        logs: true,
        no_cache: true,
        json: true,
        output: Some(OutputFormat::Md),
        cwd: Some("./here".to_string()),
    };

    assert_eq!(
        command_line(&args),
        "talos project:check --only=routes --skip=docker --packages=core --modules=user --audit-level=high --threshold=85 --concurrency=4 --e2e --outdated --strict --logs --no-cache"
    );
}

#[test]
fn the_command_line_of_a_bare_run_is_bare() {
    assert_eq!(
        command_line(&ProjectCheckArgs::default()),
        "talos project:check"
    );
}
