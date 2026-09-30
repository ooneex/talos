use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use clap::Parser;
use cli::commands::recipe_run::{
    Browser, CoveredRun, PlannedStep, RecipeFile, RecipeLoader, RecipeRunArgs, Report, RunOutcome,
    RunPlan, RunnerEvent, RunnerOptions, StepStatus, chromium_browser, discover_recipes,
    drop_covered_runs, parse_devtools_active_port, plan_recipe, resolve_base_url, runner_plan_json,
    select_recipes,
};
use cli::utils::{Recipe, RecipeStep, recipe_to_yaml};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: RecipeRunArgs,
}

fn parse(args: &[&str]) -> RecipeRunArgs {
    TestCli::parse_from(std::iter::once("test").chain(args.iter().copied())).args
}

fn wait(duration: u64) -> RecipeStep {
    RecipeStep::Wait { duration }
}

fn click(selector: &str) -> RecipeStep {
    RecipeStep::Click {
        selector: selector.to_string(),
    }
}

fn write_recipe(
    root: &Path,
    module: &str,
    id: &str,
    dependencies: &[&str],
    steps: Vec<RecipeStep>,
) -> PathBuf {
    let recipes_dir = root.join("modules").join(module).join("recipes");
    std::fs::create_dir_all(&recipes_dir).expect("recipes dir");
    let path = recipes_dir.join(format!("{id}.yml"));
    let yaml = recipe_to_yaml(&Recipe {
        id: id.to_string(),
        module: module.to_string(),
        title: format!("Recipe {id}"),
        description: None,
        dependencies: dependencies.iter().map(ToString::to_string).collect(),
        steps,
    });
    std::fs::write(&path, yaml).expect("recipe");
    path
}

fn find<'a>(files: &'a [RecipeFile], module: &str, id: &str) -> &'a RecipeFile {
    files
        .iter()
        .find(|file| file.module == module && file.id == id)
        .unwrap_or_else(|| panic!("{module}/{id} was discovered"))
}

fn plan(root: &Path, module: &str, id: &str) -> Result<RunPlan, String> {
    let files = discover_recipes(root);
    plan_recipe(
        &files,
        find(&files, module, id),
        &mut RecipeLoader::default(),
    )
}

/// `(source, step)` pairs of a plan, for compact assertions.
fn layout(plan: &RunPlan) -> Vec<(String, RecipeStep)> {
    plan.steps
        .iter()
        .map(|planned| (planned.source.clone(), planned.step.clone()))
        .collect()
}

fn ids(selected: &[&RecipeFile]) -> Vec<String> {
    selected
        .iter()
        .map(|file| format!("{}/{}", file.module, file.id))
        .collect()
}

#[test]
fn args_default_to_every_recipe_in_a_desktop_viewport() {
    let args = parse(&[]);

    assert!(args.id.is_empty());
    assert!(args.module.is_empty());
    assert_eq!(args.base_url, None);
    assert_eq!(args.timeout, 10_000);
    assert_eq!((args.width, args.height), (1440, 900));
    assert!(!args.headed);
    assert_eq!(args.cwd, None);
}

#[test]
fn args_split_ids_and_modules_on_commas() {
    let args = parse(&[
        "--id",
        "AAA-000001,AAA-000002",
        "--id=AAA-000003",
        "--module",
        "user,shop",
        "--base-url",
        "http://localhost:3033",
        "--timeout",
        "500",
        "--width",
        "390",
        "--height",
        "844",
        "--headed",
    ]);

    assert_eq!(args.id, ["AAA-000001", "AAA-000002", "AAA-000003"]);
    assert_eq!(args.module, ["user", "shop"]);
    assert_eq!(args.base_url.as_deref(), Some("http://localhost:3033"));
    assert_eq!((args.timeout, args.width, args.height), (500, 390, 844));
    assert!(args.headed);
}

#[test]
fn args_reject_a_zero_timeout_or_viewport() {
    for flag in ["--timeout", "--width", "--height"] {
        let result = TestCli::try_parse_from(["test", flag, "0"]);
        assert!(result.is_err(), "{flag} 0 should be rejected");
    }
}

#[test]
fn discover_lists_yml_recipes_sorted_by_module_then_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "user", "BBB-000002", &[], vec![wait(1)]);
    write_recipe(root, "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(root, "admin", "ZZZ-000009", &[], vec![wait(1)]);
    std::fs::write(root.join("modules/user/recipes/notes.md"), "notes").expect("notes");
    std::fs::create_dir_all(root.join("modules/user/recipes/nested.yml")).expect("dir");
    std::fs::create_dir_all(root.join("modules/empty")).expect("module without recipes");

    let files = discover_recipes(root);

    assert_eq!(
        files
            .iter()
            .map(|file| format!("{}/{}", file.module, file.id))
            .collect::<Vec<_>>(),
        ["admin/ZZZ-000009", "user/AAA-000001", "user/BBB-000002"]
    );
    assert_eq!(
        files[1].path,
        root.join("modules/user/recipes/AAA-000001.yml")
    );
}

#[test]
fn discover_is_empty_without_a_modules_directory() {
    let dir = tempfile::tempdir().expect("tempdir");

    assert!(discover_recipes(dir.path()).is_empty());
}

#[test]
fn select_takes_every_recipe_without_filters() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(dir.path(), "shop", "BBB-000001", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());

    let selected = select_recipes(dir.path(), &files, &[], &[]).expect("selection");

    assert_eq!(ids(&selected), ["shop/BBB-000001", "user/AAA-000001"]);
}

#[test]
fn select_narrows_to_the_given_modules() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(dir.path(), "shop", "BBB-000001", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());

    let selected =
        select_recipes(dir.path(), &files, &[" user ".to_string()], &[]).expect("selection");

    assert_eq!(ids(&selected), ["user/AAA-000001"]);
}

#[test]
fn select_keeps_the_id_order_once_each_ignoring_case() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(dir.path(), "user", "BBB-000002", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());
    let wanted = ["bbb-000002", "AAA-000001", "BBB-000002", " "].map(String::from);

    let selected = select_recipes(dir.path(), &files, &[], &wanted).expect("selection");

    assert_eq!(ids(&selected), ["user/BBB-000002", "user/AAA-000001"]);
}

#[test]
fn select_rejects_an_unknown_id_or_module() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());

    let unknown_id = select_recipes(dir.path(), &files, &[], &["ZZZ-000000".to_string()]);
    let unknown_module = select_recipes(dir.path(), &files, &["ghost".to_string()], &[]);

    assert_eq!(unknown_id.unwrap_err(), "Recipe \"ZZZ-000000\" not found");
    assert_eq!(
        unknown_module.unwrap_err(),
        "Module \"ghost\" not found in modules/"
    );
}

#[test]
fn select_asks_for_a_module_when_an_id_is_in_several() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(dir.path(), "shop", "AAA-000001", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());
    let id = ["AAA-000001".to_string()];

    let ambiguous = select_recipes(dir.path(), &files, &[], &id);
    let picked = select_recipes(dir.path(), &files, &["user".to_string()], &id);

    assert_eq!(
        ambiguous.unwrap_err(),
        "Recipe \"AAA-000001\" exists in several modules (shop, user); pass --module to pick one"
    );
    assert_eq!(ids(&picked.expect("selection")), ["user/AAA-000001"]);
}

#[test]
fn plan_runs_dependencies_first_depth_first() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(root, "user", "AAA-000002", &["AAA-000001"], vec![wait(2)]);
    write_recipe(root, "user", "AAA-000003", &[], vec![wait(3)]);
    write_recipe(
        root,
        "user",
        "AAA-000004",
        &["AAA-000002", "AAA-000003"],
        vec![wait(4), click("#done")],
    );

    let plan = plan(root, "user", "AAA-000004").expect("plan");

    assert_eq!(
        (plan.id.as_str(), plan.module.as_str(), plan.title.as_str()),
        ("AAA-000004", "user", "Recipe AAA-000004")
    );
    assert_eq!(
        layout(&plan),
        [
            ("AAA-000001".to_string(), wait(1)),
            ("AAA-000002".to_string(), wait(2)),
            ("AAA-000003".to_string(), wait(3)),
            ("AAA-000004".to_string(), wait(4)),
            ("AAA-000004".to_string(), click("#done")),
        ]
    );
}

#[test]
fn plan_runs_a_shared_dependency_once() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(root, "user", "AAA-000002", &["AAA-000001"], vec![wait(2)]);
    write_recipe(
        root,
        "user",
        "AAA-000003",
        &["AAA-000002", "AAA-000001", "AAA-000001"],
        vec![wait(3)],
    );

    let plan = plan(root, "user", "AAA-000003").expect("plan");

    assert_eq!(
        plan.steps
            .iter()
            .map(|planned| planned.step.clone())
            .collect::<Vec<_>>(),
        [wait(1), wait(2), wait(3)]
    );
}

#[test]
fn plan_reports_a_dependency_cycle() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "user", "AAA-000001", &["AAA-000002"], vec![wait(1)]);
    write_recipe(root, "user", "AAA-000002", &["AAA-000003"], vec![wait(2)]);
    write_recipe(root, "user", "AAA-000003", &["AAA-000002"], vec![wait(3)]);
    write_recipe(root, "user", "AAA-000009", &["AAA-000009"], vec![wait(9)]);

    assert_eq!(
        plan(root, "user", "AAA-000001").unwrap_err(),
        "Dependency cycle: AAA-000002 → AAA-000003 → AAA-000002"
    );
    assert_eq!(
        plan(root, "user", "AAA-000009").unwrap_err(),
        "Dependency cycle: AAA-000009 → AAA-000009"
    );
}

#[test]
fn plan_reports_a_missing_dependency() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(
        dir.path(),
        "user",
        "AAA-000001",
        &["ZZZ-000000"],
        vec![wait(1)],
    );

    assert_eq!(
        plan(dir.path(), "user", "AAA-000001").unwrap_err(),
        "Recipe \"AAA-000001\" depends on \"ZZZ-000000\", which does not exist"
    );
}

#[test]
fn plan_resolves_dependencies_across_modules_preferring_the_dependents() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "auth", "SIG-000001", &[], vec![click("#auth")]);
    write_recipe(root, "shop", "SIG-000001", &[], vec![click("#shop")]);
    write_recipe(root, "auth", "LOG-000001", &[], vec![click("#login")]);
    write_recipe(
        root,
        "shop",
        "BUY-000001",
        &["SIG-000001", "LOG-000001"],
        vec![click("#buy")],
    );

    let plan = plan(root, "shop", "BUY-000001").expect("plan");

    assert_eq!(
        layout(&plan),
        [
            ("SIG-000001".to_string(), click("#shop")),
            ("auth/LOG-000001".to_string(), click("#login")),
            ("BUY-000001".to_string(), click("#buy")),
        ]
    );
}

#[test]
fn plan_rejects_a_dependency_found_only_in_other_modules_several_times() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    write_recipe(root, "auth", "SIG-000001", &[], vec![wait(1)]);
    write_recipe(root, "shop", "SIG-000001", &[], vec![wait(1)]);
    write_recipe(root, "user", "AAA-000001", &["SIG-000001"], vec![wait(1)]);

    assert_eq!(
        plan(root, "user", "AAA-000001").unwrap_err(),
        "Recipe \"AAA-000001\" depends on \"SIG-000001\", which exists in several modules (auth, shop)"
    );
}

#[test]
fn plan_rejects_a_recipe_whose_id_or_module_does_not_match_its_path() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();
    let renamed = write_recipe(root, "user", "AAA-000001", &[], vec![wait(1)]);
    std::fs::rename(&renamed, renamed.with_file_name("AAA-000002.yml")).expect("rename");
    let moved = write_recipe(root, "shop", "BBB-000001", &[], vec![wait(1)]);
    std::fs::create_dir_all(root.join("modules/user/recipes")).expect("dir");
    std::fs::rename(&moved, root.join("modules/user/recipes/BBB-000001.yml")).expect("move");

    assert_eq!(
        plan(root, "user", "AAA-000002").unwrap_err(),
        "modules/user/recipes/AAA-000002.yml declares id \"AAA-000001\"; it must match the file name"
    );
    assert_eq!(
        plan(root, "user", "BBB-000001").unwrap_err(),
        "modules/user/recipes/BBB-000001.yml declares module \"shop\"; it must match its folder"
    );
}

#[test]
fn plan_reports_an_invalid_recipe_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = write_recipe(dir.path(), "user", "AAA-000001", &[], vec![]);
    std::fs::write(
        &path,
        "id: \"AAA-000001\"\nmodule: \"user\"\nsteps:\n  - action: \"hover\"\n",
    )
    .expect("recipe");

    let error = plan(dir.path(), "user", "AAA-000001").unwrap_err();

    assert!(
        error.starts_with("Invalid recipe modules/user/recipes/AAA-000001.yml: "),
        "{error}"
    );
    assert!(error.contains("unknown variant `hover`"), "{error}");
}

#[test]
fn loader_reads_each_recipe_file_once() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    let files = discover_recipes(dir.path());
    let mut loader = RecipeLoader::default();

    loader.load(&files[0]).expect("first load");
    std::fs::remove_file(path).expect("remove");

    assert_eq!(loader.load(&files[0]).expect("cached").steps, [wait(1)]);
}

fn run_plan(id: &str, steps: &[(&str, RecipeStep)]) -> RunPlan {
    RunPlan {
        id: id.to_string(),
        module: "user".to_string(),
        title: format!("Title {id}"),
        steps: steps
            .iter()
            .map(|(source, step)| PlannedStep {
                source: source.to_string(),
                step: step.clone(),
            })
            .collect(),
    }
}

fn run_ids(runs: &[RunPlan]) -> Vec<&str> {
    runs.iter().map(|run| run.id.as_str()).collect()
}

#[test]
fn drop_covered_runs_leaves_out_a_run_another_one_opens_with() {
    let runs = vec![
        run_plan("AAA-000001", &[("AAA-000001", wait(1))]),
        run_plan(
            "AAA-000002",
            &[("AAA-000001", wait(1)), ("AAA-000002", click("#go"))],
        ),
        run_plan("AAA-000003", &[("AAA-000003", wait(3))]),
    ];

    let (kept, covered) = drop_covered_runs(runs);

    assert_eq!(run_ids(&kept), ["AAA-000002", "AAA-000003"]);
    assert_eq!(
        covered,
        [CoveredRun {
            id: "AAA-000001".to_string(),
            by: "AAA-000002".to_string(),
        }]
    );
}

#[test]
fn drop_covered_runs_compares_steps_not_their_source_labels() {
    let runs = vec![
        run_plan("AAA-000001", &[("AAA-000001", wait(1))]),
        run_plan(
            "BBB-000001",
            &[("user/AAA-000001", wait(1)), ("BBB-000001", wait(2))],
        ),
    ];

    let (kept, covered) = drop_covered_runs(runs);

    assert_eq!(run_ids(&kept), ["BBB-000001"]);
    assert_eq!(covered[0].id, "AAA-000001");
}

#[test]
fn drop_covered_runs_names_the_longest_run_which_is_kept() {
    let runs = vec![
        run_plan("AAA-000001", &[("AAA-000001", wait(1))]),
        run_plan(
            "AAA-000002",
            &[("AAA-000001", wait(1)), ("AAA-000002", wait(2))],
        ),
        run_plan(
            "AAA-000003",
            &[
                ("AAA-000001", wait(1)),
                ("AAA-000002", wait(2)),
                ("AAA-000003", wait(3)),
            ],
        ),
    ];

    let (kept, covered) = drop_covered_runs(runs);

    assert_eq!(run_ids(&kept), ["AAA-000003"]);
    assert!(covered.iter().all(|run| run.by == "AAA-000003"));
}

#[test]
fn drop_covered_runs_keeps_runs_a_dependency_does_not_open() {
    // A dependency listed after another does not start from a fresh view.
    let runs = vec![
        run_plan("AAA-000001", &[("AAA-000001", wait(1))]),
        run_plan("AAA-000002", &[("AAA-000002", wait(2))]),
        run_plan(
            "AAA-000003",
            &[("AAA-000001", wait(1)), ("AAA-000002", wait(2))],
        ),
        run_plan("AAA-000004", &[("AAA-000004", wait(4))]),
        run_plan("AAA-000005", &[("AAA-000005", wait(4))]),
    ];

    let (kept, covered) = drop_covered_runs(runs);

    assert_eq!(
        run_ids(&kept),
        ["AAA-000002", "AAA-000003", "AAA-000004", "AAA-000005"]
    );
    assert_eq!(run_ids_of(&covered), ["AAA-000001"]);
}

fn run_ids_of(covered: &[CoveredRun]) -> Vec<&str> {
    covered.iter().map(|run| run.id.as_str()).collect()
}

#[test]
fn runner_plan_json_carries_the_settings_and_the_steps_of_every_run() {
    let runs = [
        run_plan(
            "AAA-000001",
            &[
                ("DEP-000001", wait(5)),
                (
                    "AAA-000001",
                    RecipeStep::Fill {
                        selector: "#q".to_string(),
                        value: "x".to_string(),
                    },
                ),
            ],
        ),
        run_plan("AAA-000002", &[("AAA-000002", click("#go"))]),
    ];
    let options = RunnerOptions {
        base_url: None,
        timeout: 500,
        width: 390,
        height: 844,
        screenshot_dir: PathBuf::from("/project/var/outputs/recipes"),
        browser: None,
    };

    let plan: serde_json::Value =
        serde_json::from_str(&runner_plan_json(&runs, &options)).expect("json");

    assert_eq!(
        plan,
        serde_json::json!({
            "baseUrl": null,
            "timeout": 500,
            "width": 390,
            "height": 844,
            "screenshotDir": "/project/var/outputs/recipes",
            "browser": null,
            "runs": [
                {
                    "id": "AAA-000001",
                    "steps": [
                        { "action": "wait", "duration": 5 },
                        { "action": "fill", "selector": "#q", "value": "x" }
                    ]
                },
                { "id": "AAA-000002", "steps": [{ "action": "click", "selector": "#go" }] }
            ]
        })
    );
}

#[test]
fn base_url_prefers_the_flag_then_the_environment() {
    assert_eq!(
        resolve_base_url(Some("http://flag"), Some("http://env")).as_deref(),
        Some("http://flag")
    );
    assert_eq!(
        resolve_base_url(Some("  "), Some(" http://env ")).as_deref(),
        Some("http://env")
    );
    assert_eq!(resolve_base_url(None, Some("")), None);
    assert_eq!(resolve_base_url(None, None), None);
}

#[test]
fn runner_events_deserialize_from_the_runner_protocol() {
    let event = |line: &str| serde_json::from_str::<RunnerEvent>(line).expect(line);

    assert_eq!(
        event(r#"{"type":"run","run":1}"#),
        RunnerEvent::Run { run: 1 }
    );
    assert_eq!(
        event(
            r#"{"type":"step","run":0,"step":2,"status":"failed","duration":12,"error":"boom","screenshot":"/s.png"}"#
        ),
        RunnerEvent::Step {
            run: 0,
            step: 2,
            status: StepStatus::Failed,
            duration: 12,
            error: Some("boom".to_string()),
            screenshot: Some("/s.png".to_string()),
        }
    );
    assert_eq!(
        event(r#"{"type":"fatal","error":"no browser"}"#),
        RunnerEvent::Fatal {
            run: None,
            error: "no browser".to_string()
        }
    );
}

/// Feeds `lines` to a report and returns its plain-text output and outcomes.
fn render(runs: &[RunPlan], lines: &[&str], finish: Option<&str>) -> (String, Vec<RunOutcome>) {
    let root = Path::new("/project");
    let mut report = Report::new(runs, root);
    let mut out = Vec::new();
    for line in lines {
        report.handle_line(line, &mut out).expect("render");
    }
    if let Some(reason) = finish {
        report.finish(reason, &mut out).expect("finish");
    }
    let text = console::strip_ansi_codes(&String::from_utf8_lossy(&out)).to_string();
    (text, report.outcomes().to_vec())
}

#[test]
fn report_renders_a_passing_run_with_dependency_steps_marked() {
    let runs = [run_plan(
        "AAA-000001",
        &[
            ("auth/SIG-000001", click("#login")),
            ("AAA-000001", wait(1000)),
        ],
    )];

    let (text, outcomes) = render(
        &runs,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":42}"#,
            r#"{"type":"step","run":0,"step":1,"status":"passed","duration":1003}"#,
        ],
        Some("unused"),
    );

    assert_eq!(
        text,
        "▸ AAA-000001 Title AAA-000001\n\
         \x20 ✔ click #login · auth/SIG-000001  42ms\n\
         \x20 ✔ wait 1s                         1.0s\n"
    );
    assert_eq!(outcomes, [RunOutcome::Passed]);
}

#[test]
fn report_renders_a_failed_step_and_skips_the_rest() {
    let runs = [run_plan(
        "AAA-000001",
        &[
            ("AAA-000001", click("#go")),
            ("AAA-000001", click("#next")),
            ("AAA-000001", wait(5)),
        ],
    )];

    let (text, outcomes) = render(
        &runs,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":3}"#,
            r#"{"type":"step","run":0,"step":1,"status":"failed","duration":500,"error":"timeout waiting for '#next' to appear","screenshot":"/project/var/outputs/recipes/AAA-000001.png"}"#,
        ],
        Some("unused"),
    );

    assert_eq!(
        text,
        "▸ AAA-000001 Title AAA-000001\n\
         \x20 ✔ click #go    3ms\n\
         \x20 ✖ click #next  500ms\n\
         \x20   timeout waiting for '#next' to appear\n\
         \x20   Screenshot: var/outputs/recipes/AAA-000001.png\n\
         \x20 ○ wait 5ms     skipped\n"
    );
    assert_eq!(outcomes, [RunOutcome::Failed]);
}

#[test]
fn report_fails_a_run_the_runner_gave_up_on() {
    let runs = [
        run_plan("AAA-000001", &[("AAA-000001", click("#a"))]),
        run_plan("AAA-000002", &[("AAA-000002", click("#b"))]),
    ];

    let (text, outcomes) = render(
        &runs,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"fatal","run":0,"error":"no browser"}"#,
            r#"{"type":"run","run":1}"#,
            r#"{"type":"step","run":1,"step":0,"status":"passed","duration":1}"#,
        ],
        Some("unused"),
    );

    assert_eq!(
        text,
        "▸ AAA-000001 Title AAA-000001\n\
         \x20 ✖ no browser\n\
         \x20 ○ click #a  skipped\n\
         \n\
         ▸ AAA-000002 Title AAA-000002\n\
         \x20 ✔ click #b  1ms\n"
    );
    assert_eq!(outcomes, [RunOutcome::Failed, RunOutcome::Passed]);
}

#[test]
fn report_finish_fails_every_run_left_unfinished() {
    let runs = [
        run_plan(
            "AAA-000001",
            &[("AAA-000001", click("#a")), ("AAA-000001", click("#b"))],
        ),
        run_plan("AAA-000002", &[("AAA-000002", click("#c"))]),
    ];

    let (text, outcomes) = render(
        &runs,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":1}"#,
            r#"{"type":"fatal","error":"Could not read the plan"}"#,
        ],
        Some("The runner exited with exit status: 1"),
    );

    assert_eq!(
        text,
        "▸ AAA-000001 Title AAA-000001\n\
         \x20 ✔ click #a  1ms\n\
         ✖ Recipe runner: Could not read the plan\n\
         \x20 ✖ The runner exited with exit status: 1\n\
         \x20 ○ click #b  skipped\n\
         \n\
         ▸ AAA-000002 Title AAA-000002\n\
         \x20 ✖ The runner exited with exit status: 1\n\
         \x20 ○ click #c  skipped\n"
    );
    assert_eq!(outcomes, [RunOutcome::Failed, RunOutcome::Failed]);
}

#[test]
fn report_fails_a_run_superseded_by_the_next_one() {
    let runs = [
        run_plan("AAA-000001", &[("AAA-000001", click("#a"))]),
        run_plan("AAA-000002", &[("AAA-000002", click("#b"))]),
    ];

    let (_, outcomes) = render(
        &runs,
        &[r#"{"type":"run","run":0}"#, r#"{"type":"run","run":1}"#],
        None,
    );

    assert_eq!(
        outcomes,
        [RunOutcome::Failed, RunOutcome::Running { next: 0 }]
    );
}

#[test]
fn report_echoes_stray_output_and_ignores_unknown_indexes() {
    let runs = [run_plan("AAA-000001", &[("AAA-000001", click("#a"))])];

    let (text, outcomes) = render(
        &runs,
        &[
            "",
            "warning from bun",
            r#"{"type":"run","run":7}"#,
            r#"{"type":"step","run":0,"step":9,"status":"passed","duration":1}"#,
        ],
        None,
    );

    assert_eq!(text, "  warning from bun\n");
    assert_eq!(outcomes, [RunOutcome::Pending]);
}

#[test]
fn runner_plan_names_the_browser_to_connect_to() {
    let options = RunnerOptions {
        base_url: None,
        timeout: 500,
        width: 390,
        height: 844,
        screenshot_dir: PathBuf::from("/project/var/outputs/recipes"),
        browser: Some(Browser {
            name: "Dia".to_string(),
            url: "ws://127.0.0.1:9222/devtools/browser/abc".to_string(),
        }),
    };

    let plan: serde_json::Value =
        serde_json::from_str(&runner_plan_json(&[], &options)).expect("json");

    assert_eq!(
        plan["browser"],
        serde_json::json!({ "name": "Dia", "url": "ws://127.0.0.1:9222/devtools/browser/abc" })
    );
}

#[test]
fn devtools_active_port_names_the_browser_websocket() {
    assert_eq!(
        parse_devtools_active_port("9222\n/devtools/browser/abc-123\n"),
        Some((
            9222,
            "ws://127.0.0.1:9222/devtools/browser/abc-123".to_string()
        ))
    );
    assert_eq!(
        parse_devtools_active_port(" 51234 \r\n/devtools/browser/x\r\n"),
        Some((51234, "ws://127.0.0.1:51234/devtools/browser/x".to_string()))
    );
    assert_eq!(parse_devtools_active_port(""), None);
    assert_eq!(parse_devtools_active_port("9222\n"), None);
    assert_eq!(parse_devtools_active_port("0\n/devtools/browser/x"), None);
    assert_eq!(
        parse_devtools_active_port("port\n/devtools/browser/x"),
        None
    );
    assert_eq!(parse_devtools_active_port("9222\ndevtools/browser/x"), None);
}

#[cfg(target_os = "macos")]
#[test]
fn chromium_browsers_are_known_by_their_bundle_id() {
    assert_eq!(
        chromium_browser("company.thebrowser.dia"),
        Some(("Dia", "Dia/User Data"))
    );
    assert_eq!(
        chromium_browser("com.Google.Chrome"),
        Some(("Google Chrome", "Google/Chrome"))
    );
    assert_eq!(chromium_browser("com.apple.Safari"), None);
    assert_eq!(chromium_browser("org.mozilla.firefox"), None);
}

#[cfg(all(unix, not(target_os = "macos")))]
#[test]
fn chromium_browsers_are_known_by_their_desktop_entry() {
    assert_eq!(
        chromium_browser("chromium-browser"),
        Some(("Chromium", "chromium"))
    );
    assert_eq!(
        chromium_browser("google-chrome"),
        Some(("Google Chrome", "google-chrome"))
    );
    assert_eq!(chromium_browser("firefox"), None);
}

fn talos(root: &Path, path: &str, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(args)
        .current_dir(root)
        .env("NO_COLOR", "1")
        .env("PATH", path)
        .env_remove("E2E_BASE_URL")
        .output()
        .expect("talos should run")
}

fn text(output: &Output) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

/// Puts a `bun` stand-in on a PATH: it answers `--version`, copies the plan and
/// its working directory next to the project, prints `events` and exits with `code`.
#[cfg(unix)]
fn fake_bun(root: &Path, events: &[&str], code: i32) -> String {
    use std::os::unix::fs::PermissionsExt;

    let bin = root.join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    let quoted: Vec<String> = events
        .iter()
        .map(|event| format!("'{}'", event.replace('\'', "'\\''")))
        .collect();
    let script = format!(
        "#!/bin/sh\n\
         if [ \"$1\" = \"--version\" ]; then echo 1.4.3; exit 0; fi\n\
         cp \"$2\" \"{plan}\"\n\
         pwd > \"{cwd}\"\n\
         printf '%s\\n' {events}\n\
         exit {code}\n",
        plan = root.join("plan.json").display(),
        cwd = root.join("cwd.txt").display(),
        events = quoted.join(" "),
    );
    let path = bin.join("bun");
    std::fs::write(&path, script).expect("bun");
    let mut permissions = std::fs::metadata(&path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(&path, permissions).expect("permissions");
    format!("{}:/bin:/usr/bin", bin.display())
}

#[test]
fn cli_warns_when_there_is_nothing_to_run() {
    let dir = tempfile::tempdir().expect("tempdir");

    let output = talos(dir.path(), "/nonexistent", &["recipe:run"]);

    assert!(output.status.success(), "{}", text(&output));
    assert!(
        text(&output).contains("No recipes to run"),
        "{}",
        text(&output)
    );
}

#[test]
fn cli_fails_on_an_unknown_recipe_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);

    let output = talos(
        dir.path(),
        "/nonexistent",
        &["recipe:run", "--id", "ZZZ-000000"],
    );

    assert_eq!(output.status.code(), Some(1));
    assert!(text(&output).contains("Recipe \"ZZZ-000000\" not found"));
}

#[test]
fn cli_skips_a_recipe_without_steps_and_needs_no_browser() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![]);

    let output = talos(dir.path(), "/nonexistent", &["recipe:run"]);

    assert!(output.status.success(), "{}", text(&output));
    assert!(text(&output).contains("AAA-000001 has no steps to run; skipped"));
    assert!(text(&output).contains("0 recipes passed, 1 skipped"));
}

#[test]
fn cli_requires_bun_to_replay_steps() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);

    let output = talos(dir.path(), "/nonexistent", &["recipe:run"]);

    assert_eq!(output.status.code(), Some(1));
    assert!(
        text(&output).contains("\"bun\" is required but was not found on the PATH"),
        "{}",
        text(&output)
    );
}

#[cfg(unix)]
#[test]
fn cli_hands_the_plan_to_bun_outside_the_project_and_renders_its_events() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = std::fs::canonicalize(dir.path()).expect("root");
    write_recipe(&root, "user", "AAA-000001", &[], vec![wait(1)]);
    write_recipe(
        &root,
        "user",
        "AAA-000002",
        &["AAA-000001"],
        vec![click("#go")],
    );
    let screenshots = root.join("var/outputs/recipes");
    std::fs::create_dir_all(&screenshots).expect("screenshots");
    std::fs::write(screenshots.join("AAA-000002.png"), "stale").expect("stale screenshot");
    let path = fake_bun(
        &root,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":4}"#,
            r#"{"type":"step","run":0,"step":1,"status":"passed","duration":8}"#,
        ],
        0,
    );

    let output = Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(["recipe:run", "--id", "AAA-000002", "--timeout", "700"])
        .current_dir(&root)
        .env("NO_COLOR", "1")
        .env("PATH", path)
        .env("E2E_BASE_URL", "http://localhost:3033")
        .output()
        .expect("talos should run");

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(
        output_text.contains("▸ AAA-000002 Recipe AAA-000002"),
        "{output_text}"
    );
    assert!(
        output_text.contains("✔ wait 1ms · AAA-000001"),
        "{output_text}"
    );
    assert!(output_text.contains("✔ click #go"), "{output_text}");
    assert!(output_text.contains("1 recipe passed"), "{output_text}");
    assert!(!screenshots.join("AAA-000002.png").exists());

    let plan: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("plan.json")).expect("plan"))
            .expect("json");
    assert_eq!(plan["baseUrl"], "http://localhost:3033");
    assert_eq!(plan["timeout"], 700);
    assert_eq!(plan["screenshotDir"], screenshots.display().to_string());
    assert_eq!(plan["runs"][0]["id"], "AAA-000002");
    assert_eq!(plan["runs"][0]["steps"].as_array().map(Vec::len), Some(2));

    let cwd = std::fs::read_to_string(root.join("cwd.txt")).expect("cwd");
    assert!(!Path::new(cwd.trim()).starts_with(&root), "{cwd}");
}

#[cfg(unix)]
#[test]
fn cli_does_not_replay_a_dependency_another_run_opens_with() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = std::fs::canonicalize(dir.path()).expect("root");
    write_recipe(
        &root,
        "user",
        "AAA-000002",
        &["AAA-000003"],
        vec![click("#go")],
    );
    write_recipe(&root, "user", "AAA-000003", &[], vec![wait(1)]);
    let path = fake_bun(
        &root,
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":4}"#,
            r#"{"type":"step","run":0,"step":1,"status":"passed","duration":8}"#,
        ],
        0,
    );

    let output = talos(&root, &path, &["recipe:run"]);

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(
        output_text.contains("AAA-000003 runs at the start of AAA-000002; not replayed on its own"),
        "{output_text}"
    );
    assert!(output_text.contains("1 recipe passed"), "{output_text}");
    let plan: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("plan.json")).expect("plan"))
            .expect("json");
    assert_eq!(plan["runs"].as_array().map(Vec::len), Some(1));
    assert_eq!(plan["runs"][0]["id"], "AAA-000002");
}

#[cfg(unix)]
#[test]
fn cli_replays_every_recipe_picked_with_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = std::fs::canonicalize(dir.path()).expect("root");
    write_recipe(
        &root,
        "user",
        "AAA-000002",
        &["AAA-000003"],
        vec![click("#go")],
    );
    write_recipe(&root, "user", "AAA-000003", &[], vec![wait(1)]);
    let path = fake_bun(&root, &[], 0);

    talos(
        &root,
        &path,
        &["recipe:run", "--id", "AAA-000002,AAA-000003"],
    );

    let plan: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("plan.json")).expect("plan"))
            .expect("json");
    assert_eq!(plan["runs"].as_array().map(Vec::len), Some(2));
}

#[cfg(unix)]
#[test]
fn cli_exits_non_zero_when_a_step_fails() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![click("#go")]);
    let path = fake_bun(
        dir.path(),
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"failed","duration":4,"error":"timeout waiting for '#go' to appear"}"#,
        ],
        0,
    );

    let output = talos(dir.path(), &path, &["recipe:run"]);

    assert_eq!(output.status.code(), Some(1), "{}", text(&output));
    assert!(text(&output).contains("timeout waiting for '#go' to appear"));
    assert!(text(&output).contains("1 of 1 recipe failed"));
}

#[cfg(unix)]
#[test]
fn cli_fails_the_runs_a_crashed_runner_left_behind() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![click("#go")]);
    write_recipe(
        dir.path(),
        "user",
        "AAA-000002",
        &["NOPE-000000"],
        vec![wait(1)],
    );
    let path = fake_bun(dir.path(), &[r#"{"type":"run","run":0}"#], 3);

    let output = talos(dir.path(), &path, &["recipe:run"]);

    let output_text = text(&output);
    assert_eq!(output.status.code(), Some(1), "{output_text}");
    assert!(
        output_text.contains("AAA-000002: Recipe \"AAA-000002\" depends on \"NOPE-000000\""),
        "{output_text}"
    );
    assert!(
        output_text.contains("The runner exited with exit status: 3"),
        "{output_text}"
    );
    assert!(output_text.contains("○ click #go"), "{output_text}");
    assert!(
        output_text.contains("2 of 2 recipes failed"),
        "{output_text}"
    );
}

/// A home whose LaunchServices preferences make `bundle_id` the default
/// browser (none: Safari, the macOS fallback).
#[cfg(target_os = "macos")]
fn home_with_default_browser(root: &Path, bundle_id: Option<&str>) -> PathBuf {
    let home = root.join("home");
    let preferences = home.join("Library/Preferences/com.apple.LaunchServices");
    std::fs::create_dir_all(&preferences).expect("preferences");
    let handler = bundle_id.map_or(String::new(), |id| {
        format!(
            "<dict><key>LSHandlerURLScheme</key><string>https</string>\
             <key>LSHandlerRoleAll</key><string>{id}</string></dict>"
        )
    });
    std::fs::write(
        preferences.join("com.apple.launchservices.secure.plist"),
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
             <plist version=\"1.0\"><dict><key>LSHandlers</key><array>\
             <dict><key>LSHandlerURLScheme</key><string>mailto</string>\
             <key>LSHandlerRoleAll</key><string>com.apple.mail</string></dict>\
             {handler}</array></dict></plist>\n"
        ),
    )
    .expect("plist");
    home
}

#[cfg(target_os = "macos")]
fn write_devtools_active_port(home: &Path, port: u16) {
    let profile = home.join("Library/Application Support/Google/Chrome");
    std::fs::create_dir_all(&profile).expect("profile");
    std::fs::write(
        profile.join("DevToolsActivePort"),
        format!("{port}\n/devtools/browser/abc-123\n"),
    )
    .expect("DevToolsActivePort");
}

#[cfg(target_os = "macos")]
fn talos_headed(root: &Path, path: &str, home: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_talos"))
        .args(["recipe:run", "--headed"])
        .current_dir(root)
        .env("NO_COLOR", "1")
        .env("PATH", path)
        .env("HOME", home)
        .env_remove("E2E_BASE_URL")
        .output()
        .expect("talos should run")
}

#[cfg(target_os = "macos")]
#[test]
fn cli_headed_hands_the_default_browser_devtools_endpoint_to_the_runner() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    let path = fake_bun(
        dir.path(),
        &[
            r#"{"type":"run","run":0}"#,
            r#"{"type":"step","run":0,"step":0,"status":"passed","duration":1}"#,
        ],
        0,
    );
    let home = home_with_default_browser(dir.path(), Some("com.google.chrome"));
    let browser = std::net::TcpListener::bind("127.0.0.1:0").expect("listener");
    let port = browser.local_addr().expect("address").port();
    write_devtools_active_port(&home, port);

    let output = talos_headed(dir.path(), &path, &home);

    let output_text = text(&output);
    assert!(output.status.success(), "{output_text}");
    assert!(
        output_text.contains("Replaying in Google Chrome"),
        "{output_text}"
    );
    let plan: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.path().join("plan.json")).expect("plan"))
            .expect("json");
    assert_eq!(
        plan["browser"],
        serde_json::json!({
            "name": "Google Chrome",
            "url": format!("ws://127.0.0.1:{port}/devtools/browser/abc-123"),
        })
    );
}

#[cfg(target_os = "macos")]
#[test]
fn cli_headed_explains_why_the_default_browser_cannot_be_driven() {
    let dir = tempfile::tempdir().expect("tempdir");
    write_recipe(dir.path(), "user", "AAA-000001", &[], vec![wait(1)]);
    let path = fake_bun(dir.path(), &[], 0);

    let safari = talos_headed(
        dir.path(),
        &path,
        &home_with_default_browser(&dir.path().join("safari"), None),
    );
    let chrome_home =
        home_with_default_browser(&dir.path().join("chrome"), Some("com.google.chrome"));
    let debugging_off = talos_headed(dir.path(), &path, &chrome_home);
    let closed_port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .expect("port")
        .port();
    write_devtools_active_port(&chrome_home, closed_port);
    let not_running = talos_headed(dir.path(), &path, &chrome_home);

    for (output, expected) in [
        (&safari, "com.apple.Safari is not a Chromium browser"),
        (
            &debugging_off,
            "Google Chrome does not accept remote debugging",
        ),
        (
            &not_running,
            "Google Chrome is not running with remote debugging on",
        ),
    ] {
        assert_eq!(output.status.code(), Some(1), "{}", text(output));
        assert!(text(output).contains(expected), "{}", text(output));
    }
    for output in [&debugging_off, &not_running] {
        assert!(
            text(output).contains("chrome://inspect/#remote-debugging"),
            "{}",
            text(output)
        );
    }
    assert!(!dir.path().join("plan.json").exists());
}

#[cfg(target_os = "macos")]
fn find_on_path(bin: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(bin))
        .find(|candidate| candidate.is_file())
}

#[cfg(target_os = "macos")]
fn data_url(html: &str) -> String {
    let encoded: String = html
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect();
    format!("data:text/html,{encoded}")
}

/// Drives a real Bun.WebView, so it only runs where the WebKit backend exists
/// and `bun` is installed.
#[cfg(target_os = "macos")]
#[test]
fn cli_replays_recipes_in_a_real_browser() {
    let Some(bun) = find_on_path("bun") else {
        eprintln!("skipped: bun is not on the PATH");
        return;
    };
    let dir = tempfile::tempdir().expect("tempdir");
    // The button only appears once the field holds exactly "new", so the click
    // passes only if `fill` replaced the old value.
    let page = data_url(
        "<input id=\"q\" value=\"old\" oninput=\"if (this.value === 'new' && !document.getElementById('ok')) { const b = document.createElement('button'); b.id = 'ok'; b.textContent = 'ok'; document.body.append(b); }\">",
    );
    let navigate = RecipeStep::Navigate { url: page };
    write_recipe(
        dir.path(),
        "user",
        "AAA-000001",
        &[],
        vec![
            navigate.clone(),
            RecipeStep::Fill {
                selector: "#q".to_string(),
                value: "new".to_string(),
            },
            click("#ok"),
            wait(10),
        ],
    );
    write_recipe(
        dir.path(),
        "user",
        "AAA-000002",
        &[],
        vec![navigate, click("#missing")],
    );
    let path = format!(
        "{}:/bin:/usr/bin",
        bun.parent().expect("bun directory").display()
    );

    let passing = talos(dir.path(), &path, &["recipe:run", "--id", "AAA-000001"]);
    let failing = talos(
        dir.path(),
        &path,
        &["recipe:run", "--id", "AAA-000002", "--timeout", "300"],
    );

    assert!(passing.status.success(), "{}", text(&passing));
    assert!(text(&passing).contains("✔ click #ok"), "{}", text(&passing));
    assert_eq!(failing.status.code(), Some(1), "{}", text(&failing));
    assert!(
        text(&failing).contains("timeout waiting for '#missing' to appear"),
        "{}",
        text(&failing)
    );
    assert!(
        dir.path()
            .join("var/outputs/recipes/AAA-000002.png")
            .is_file()
    );
}
