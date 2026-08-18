//! Unit tests for the checks added on top of the original forty: the framework
//! wiring, the front-end surface, the data layer and the issue markers.
//!
//! Each check exposes the rule it applies as a pure function taking source
//! text, so the tests read the way the rule does — a snippet in, the findings
//! out — with no temporary workspace to build.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use cli::commands::project_check::artifacts::{
    contains_word, declared, is_empty_body, method_body, returned_string,
};
use cli::commands::project_check::modules::WorkspaceModule;
use cli::commands::project_check::routes::Route;
use cli::commands::project_check::{
    Category, CheckId, ProjectCheckArgs, assets, cache, crons, events, exceptions, flags, folders,
    indexes, logging, mailers, middlewares, openapi, pagination, permissions, queries, queues,
    repositories, router, routes, sdk, todos, tokens, transactions, tsconfig, validation,
    workflows,
};

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

#[test]
fn every_check_belongs_to_exactly_one_category() {
    let grouped: usize = Category::ALL
        .iter()
        .map(|category| category.checks().len())
        .sum();
    assert_eq!(grouped, CheckId::ALL.len());
}

#[test]
fn every_check_key_resolves_back_to_itself() {
    for id in CheckId::ALL {
        assert_eq!(CheckId::from_key(id.key()), Some(id), "{}", id.key());
    }
}

#[test]
fn a_category_name_selects_the_checks_it_holds() {
    let selected = cli::commands::project_check::select_checks(Some("runtime"), None, &[])
        .expect("runtime is a category");
    assert_eq!(selected, Category::Runtime.checks());
}

#[test]
fn a_category_can_be_skipped_wholesale() {
    let selected = cli::commands::project_check::select_checks(None, Some("frontend"), &[])
        .expect("frontend is a category");
    assert!(
        !selected.contains(&CheckId::Tokens) && !selected.contains(&CheckId::Router),
        "the front-end checks should be gone"
    );
    assert!(selected.contains(&CheckId::Routes));
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/// A temporary workspace root, kept alive by the returned handle.
fn folder_root() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

/// A module directory carrying the manifest that declares its type.
fn write_module(root: &std::path::Path, name: &str, kind: &str) -> WorkspaceModule {
    let dir = root.join("modules").join(name);
    fs::create_dir_all(&dir).expect("create module directory");
    fs::write(
        dir.join(format!("{name}.yml")),
        format!("type: \"{kind}\"\n"),
    )
    .expect("write manifest");

    WorkspaceModule {
        name: name.to_string(),
        group: "modules".to_string(),
        kind: Some(kind.to_string()),
        dir,
    }
}

/// Whether the layout accepts a folder at that path.
fn accepts(layout: folders::Layout, path: &str) -> bool {
    let segments: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    folders::accepts(layout, &segments)
}

#[test]
fn a_module_type_picks_the_layout_it_is_held_to() {
    assert_eq!(folders::Layout::of(None), Some(folders::Layout::Backend));
    assert_eq!(
        folders::Layout::of(Some("microservice")),
        Some(folders::Layout::Backend)
    );
    assert_eq!(
        folders::Layout::of(Some("admin")),
        Some(folders::Layout::Spa)
    );
    assert_eq!(folders::Layout::of(Some("elm-app")), None);
}

#[test]
fn a_backend_module_holds_only_its_artifact_folders() {
    let backend = folders::Layout::Backend;
    for folder in [
        "controllers",
        "services",
        "repositories",
        "entities",
        "exceptions",
        "constraints",
        "types",
        "utils",
    ] {
        assert!(accepts(backend, &format!("src/{folder}")), "{folder}");
    }
    for folder in ["helpers", "lib", "common", "shared", "components", "core"] {
        assert!(!accepts(backend, &format!("src/{folder}")), "{folder}");
    }
}

#[test]
fn a_backend_artifact_folder_may_group_its_own_files() {
    // Organising controllers by resource is not inventing a layer.
    assert!(accepts(
        folders::Layout::Backend,
        "src/controllers/user/profile"
    ));
}

#[test]
fn the_two_backend_folders_with_subfolders_name_them_exactly() {
    let backend = folders::Layout::Backend;
    assert!(accepts(backend, "src/ai/chats"));
    assert!(accepts(backend, "src/ai/tools"));
    assert!(!accepts(backend, "src/ai/agents"));
    assert!(accepts(backend, "src/workflows/transitions"));
    assert!(!accepts(backend, "src/workflows/steps"));
}

#[test]
fn tests_are_held_to_the_layout_they_mirror() {
    let backend = folders::Layout::Backend;
    assert!(accepts(backend, "tests"));
    assert!(accepts(backend, "tests/services"));
    assert!(!accepts(backend, "tests/helpers"));
}

#[test]
fn a_module_root_holds_only_the_folders_it_is_given() {
    let backend = folders::Layout::Backend;
    for folder in ["src", "bin", "tests", "e2e", "issues"] {
        assert!(accepts(backend, folder), "{folder}");
    }
    for folder in ["docs", "scripts", "assets", "public"] {
        assert!(!accepts(backend, folder), "{folder}");
    }
    // `bin/` owns whatever it groups below, the way an artifact folder does.
    assert!(accepts(backend, "bin/migration"));
    assert!(accepts(folders::Layout::Spa, "bin"));
    // Only a module shipping a browser bundle gets a `public/`.
    assert!(accepts(folders::Layout::Spa, "public"));
}

#[test]
fn a_design_system_is_organised_by_asset_kind() {
    let design = folders::Layout::Design;
    assert!(accepts(design, "src/components/button"));
    assert!(accepts(design, "src/components/language/flags"));
    assert!(accepts(design, "src/fonts/space-grotesk"));
    assert!(accepts(design, "src/inspirations/dashboards"));
    assert!(!accepts(design, "src/features"));
    assert!(!accepts(design, "src/widgets"));
}

#[test]
fn an_icon_sits_at_variant_category_size_and_nowhere_else() {
    let design = folders::Layout::Design;
    assert!(accepts(design, "src/icons/fill/arrows/sm"));
    assert!(accepts(design, "src/icons/outline/animals-nature/lg"));
    assert!(!accepts(design, "src/icons/solid/arrows/sm"));
    assert!(!accepts(design, "src/icons/fill/arrows/xl"));
    assert!(accepts(design, "src/styles/themes"));
    assert!(!accepts(design, "src/styles/tokens"));
}

#[test]
fn a_spa_feature_holds_only_its_layers() {
    let spa = folders::Layout::Spa;
    for layer in [
        "components",
        "hooks",
        "layouts",
        "services",
        "store",
        "types",
    ] {
        assert!(
            accepts(spa, &format!("src/features/user/{layer}")),
            "{layer}"
        );
        assert!(accepts(spa, &format!("src/shared/{layer}")), "{layer}");
    }
    assert!(!accepts(spa, "src/features/user/api"));
    assert!(!accepts(spa, "src/shared/lib"));
    // Below a layer, grouping is the feature's own business.
    assert!(accepts(spa, "src/features/user/components/avatar"));
}

#[test]
fn a_route_folder_is_a_url_segment() {
    assert!(accepts(folders::Layout::Spa, "src/routes/posts/$id/edit"));
}

#[test]
fn a_bootstrap_folder_holds_files_and_nothing_else() {
    assert!(accepts(folders::Layout::Spa, "src/bootstrap"));
    assert!(!accepts(folders::Layout::Spa, "src/bootstrap/providers"));
}

#[test]
fn a_storybook_shared_folder_also_holds_the_story_engine() {
    let storybook = folders::Layout::Storybook;
    assert!(accepts(storybook, "src/shared/story"));
    assert!(!accepts(folders::Layout::Spa, "src/shared/story"));
    // A storybook feature is a folder of story files, with no layers.
    assert!(accepts(storybook, "src/features/avatar"));
    assert!(accepts(storybook, "src/features/icons"));
}

#[test]
fn an_sdk_keeps_its_generated_files_side_by_side() {
    assert!(accepts(folders::Layout::Sdk, "src"));
    assert!(!accepts(folders::Layout::Sdk, "src/clients"));
}

#[test]
fn a_rejected_folder_is_reported_once_rather_than_as_a_subtree() {
    let (dir, root) = folder_root();
    let module = write_module(&root, "user", "module");
    for folder in [
        "src/lib",
        "src/lib/deep",
        "src/lib/deep/deeper",
        "src/services",
    ] {
        fs::create_dir_all(module.dir.join(folder)).expect("create folder");
    }

    let (errors, _) = folders::inspect(&root, &module, folders::Layout::Backend);
    assert_eq!(errors.len(), 1);
    assert!(errors[0].starts_with("modules/user/src/lib:"));
    drop(dir);
}

// ---------------------------------------------------------------------------
// Shared reading
// ---------------------------------------------------------------------------

#[test]
fn a_decorated_class_is_read_with_its_kind() {
    let source = r#"
@decorator.middleware()
export class AuthMiddleware implements IMiddleware {}
"#;
    assert_eq!(
        declared(source, &["middleware"]),
        vec![("middleware".to_string(), "AuthMiddleware".to_string())]
    );
}

#[test]
fn a_decorator_of_another_kind_is_left_alone() {
    let source = "@decorator.service()\nexport class UserService {}";
    assert!(declared(source, &["middleware"]).is_empty());
}

#[test]
fn a_method_body_is_read_in_both_forms() {
    let classic = "public async handler(context) {\n  return context;\n}";
    let arrow = "public handler = async (context) => {\n  return context;\n};";
    assert_eq!(
        method_body(classic, "handler").map(str::trim),
        Some("return context;")
    );
    assert_eq!(
        method_body(arrow, "handler").map(str::trim),
        Some("return context;")
    );
}

#[test]
fn a_body_of_only_comments_is_empty() {
    assert!(is_empty_body("\n  // TODO: implement\n  /* later */\n"));
    assert!(!is_empty_body("\n  // TODO\n  return 1;\n"));
}

#[test]
fn a_returned_string_is_read_through_either_syntax() {
    let block = r#"public getChannel(): string {
      return "user.created";
    }"#;
    let arrow = r#"public getName = (): string => "order-fulfilment";"#;
    assert_eq!(
        returned_string(block, "getChannel").as_deref(),
        Some("user.created")
    );
    assert_eq!(
        returned_string(arrow, "getName").as_deref(),
        Some("order-fulfilment")
    );
}

#[test]
fn a_name_is_matched_as_a_whole_identifier() {
    assert!(contains_word("inject(UserQueue)", "UserQueue"));
    assert!(!contains_word("inject(UserQueueFactory)", "UserQueue"));
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

#[test]
fn a_bare_error_is_reported() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "throw new Error(\"nope\");",
        "modules/user/src/services/UserService.ts",
        &mut errors,
        &mut warnings,
    );
    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("carries no code"));
}

#[test]
fn a_framework_exception_is_not_reported() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "throw new NotFoundException(\"gone\", \"USER_NOT_FOUND\");",
        "a.ts",
        &mut errors,
        &mut warnings,
    );
    assert!(errors.is_empty());
}

#[test]
fn an_empty_catch_swallows_the_failure() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "try {\n  run();\n} catch (error) {\n  // ignore\n}",
        "a.ts",
        &mut errors,
        &mut warnings,
    );
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("empty"));
}

#[test]
fn thrown_literals_and_detached_exception_classes_are_reported() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "throw \"boom\";\nexport class BrokenException {}\n",
        "a.ts",
        &mut errors,
        &mut warnings,
    );

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("thrown literal"));
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("does not extend Exception"));
}

#[test]
fn a_non_empty_catch_is_left_alone() {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    exceptions::inspect(
        "try {\n  run();\n} catch (error) {\n  log(error);\n}\n",
        "a.ts",
        &mut errors,
        &mut warnings,
    );

    assert!(errors.is_empty());
    assert!(warnings.is_empty());
}

// ---------------------------------------------------------------------------
// Crons
// ---------------------------------------------------------------------------

#[test]
fn a_schedule_beyond_its_crontab_field_is_rejected() {
    assert!(crons::validate("every 90 minutes").is_err());
    assert!(crons::validate("every 30 minutes").is_ok());
}

#[test]
fn a_multi_year_interval_silently_runs_yearly() {
    assert_eq!(
        crons::validate("every 3 years").expect("valid"),
        Some("\"every 3 years\" runs once a year — the interval is ignored for years".to_string())
    );
}

#[test]
fn a_one_off_schedule_needs_no_crontab_field() {
    assert_eq!(crons::validate("in 90 minutes").expect("valid"), None);
}

#[test]
fn a_malformed_schedule_says_what_it_should_read() {
    assert!(crons::validate("hourly").is_err());
    assert!(crons::validate("every 5 fortnights").is_err());
    assert!(crons::validate("every 0 minutes").is_err());
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[test]
fn two_events_on_one_channel_both_fire() {
    let subscriptions = vec![
        events::Subscription {
            class: "OrderPlacedEvent".to_string(),
            channel: Some("order.placed".to_string()),
            handles: true,
            file: "a.ts".to_string(),
        },
        events::Subscription {
            class: "OrderAuditEvent".to_string(),
            channel: Some("order.placed".to_string()),
            handles: true,
            file: "b.ts".to_string(),
        },
    ];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    events::inspect(&subscriptions, &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("both handlers will fire"));
}

#[test]
fn an_event_with_an_empty_handler_is_reported() {
    let subscriptions = vec![events::Subscription {
        class: "OrderPlacedEvent".to_string(),
        channel: Some("order.placed".to_string()),
        handles: false,
        file: "a.ts".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    events::inspect(&subscriptions, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert_eq!(warnings.len(), 1);
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

#[test]
fn two_queues_sharing_a_name_split_the_stream() {
    let queues = vec![
        queues::QueueDefinition {
            class: "EmailQueue".to_string(),
            name: Some("email".to_string()),
            handles: true,
            reports_failures: true,
            file: "a.ts".to_string(),
        },
        queues::QueueDefinition {
            class: "DigestQueue".to_string(),
            name: Some("email".to_string()),
            handles: true,
            reports_failures: true,
            file: "b.ts".to_string(),
        },
    ];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queues::inspect(&queues, &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(warnings.is_empty());
}

#[test]
fn a_queue_without_a_failure_hook_is_reported() {
    let queues = vec![queues::QueueDefinition {
        class: "EmailQueue".to_string(),
        name: Some("email".to_string()),
        handles: true,
        reports_failures: false,
        file: "a.ts".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queues::inspect(&queues, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert!(warnings[0].contains("onFailed"));
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

#[test]
fn a_workflows_transitions_are_read_out_of_the_list() {
    let source = r#"
public getTransitions = (): WorkflowTransitionClassType[] => [
  ReserveStockTransition,
  ChargeCardTransition,
];
"#;
    assert_eq!(
        workflows::transitions_of(source),
        Some(vec![
            "ReserveStockTransition".to_string(),
            "ChargeCardTransition".to_string()
        ])
    );
}

#[test]
fn a_single_transition_list_is_balanced_to_its_closing_bracket() {
    assert_eq!(
        workflows::transitions_of("public getTransitions = () => [ShipOrderTransition];"),
        Some(vec!["ShipOrderTransition".to_string()])
    );
}

#[test]
fn transitions_can_be_read_from_a_block_body_return() {
    assert_eq!(
        workflows::transitions_of(
            "public getTransitions(): WorkflowTransitionClassType[] { return [ShipOrderTransition]; }",
        ),
        Some(vec!["ShipOrderTransition".to_string()])
    );
}

#[test]
fn a_workflow_listing_a_missing_transition_fails() {
    let workflows = vec![workflows::WorkflowDefinition {
        class: "CheckoutWorkflow".to_string(),
        name: Some("checkout".to_string()),
        transitions: vec!["ChargeCardTransition".to_string()],
        file: "a.ts".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    workflows::inspect(&workflows, &[], &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("no @decorator.transition()"));
}

#[test]
fn a_workflow_running_nothing_is_reported() {
    let workflows = vec![workflows::WorkflowDefinition {
        class: "CheckoutWorkflow".to_string(),
        name: Some("checkout".to_string()),
        transitions: Vec::new(),
        file: "a.ts".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    workflows::inspect(&workflows, &[], &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert!(warnings[0].contains("runs no transition"));
}

#[test]
fn workflow_helpers_read_names_and_transition_safety() {
    let workflow = cli::commands::project_check::artifacts::Artifact {
        kind: "workflow".to_string(),
        class: "CheckoutWorkflow".to_string(),
        file: "a.ts".to_string(),
        path: std::path::PathBuf::from("a.ts"),
        module: "shop".to_string(),
        label: "modules/shop".to_string(),
        content: "export class CheckoutWorkflow {\n  public getName = (): string => \"checkout\";\n  public getTransitions = (): WorkflowTransitionClassType[] => {\n    return [ReserveStockTransition, ChargeCardTransition<ResultType>];\n  };\n}\n".to_string(),
    };
    let parsed = workflows::parse(&workflow);
    assert_eq!(parsed.name.as_deref(), Some("checkout"));
    assert_eq!(
        parsed.transitions,
        vec![
            "ReserveStockTransition".to_string(),
            "ChargeCardTransition".to_string(),
            "ResultType".to_string(),
        ]
    );

    let placeholder = cli::commands::project_check::artifacts::Artifact {
        kind: "transition".to_string(),
        class: "ReserveStockTransition".to_string(),
        file: "reserve.ts".to_string(),
        path: std::path::PathBuf::from("reserve.ts"),
        module: "shop".to_string(),
        label: "modules/shop".to_string(),
        content: "export class ReserveStockTransition {\n  public handler = async (data) => {\n    return data;\n  };\n}\n".to_string(),
    };
    assert!(!workflows::does_work(&placeholder));
    assert!(!workflows::is_reversible(&placeholder));

    let real = cli::commands::project_check::artifacts::Artifact {
        kind: "transition".to_string(),
        class: "ChargeCardTransition".to_string(),
        file: "charge.ts".to_string(),
        path: std::path::PathBuf::from("charge.ts"),
        module: "shop".to_string(),
        label: "modules/shop".to_string(),
        content: "export class ChargeCardTransition {\n  public handler = async (data) => {\n    await gateway.charge(data);\n    return data;\n  };\n\n  public rollback = async () => {\n    await gateway.refund();\n  };\n}\n".to_string(),
    };
    assert!(workflows::does_work(&real));
    assert!(workflows::is_reversible(&real));
}

#[test]
fn duplicate_workflow_names_or_orphan_transitions_are_reported() {
    let workflows = vec![
        workflows::WorkflowDefinition {
            class: "CheckoutWorkflow".to_string(),
            name: Some("checkout".to_string()),
            transitions: vec!["ChargeCardTransition".to_string()],
            file: "a.ts".to_string(),
        },
        workflows::WorkflowDefinition {
            class: "RetryWorkflow".to_string(),
            name: Some("checkout".to_string()),
            transitions: vec!["ReserveStockTransition".to_string()],
            file: "b.ts".to_string(),
        },
    ];
    let transitions = vec![
        cli::commands::project_check::artifacts::Artifact {
            kind: "transition".to_string(),
            class: "ChargeCardTransition".to_string(),
            file: "charge.ts".to_string(),
            path: std::path::PathBuf::from("charge.ts"),
            module: "shop".to_string(),
            label: "modules/shop".to_string(),
            content: "export class ChargeCardTransition {\n  public handler = async () => {\n    await gateway.charge();\n  };\n}\n".to_string(),
        },
        cli::commands::project_check::artifacts::Artifact {
            kind: "transition".to_string(),
            class: "ReserveStockTransition".to_string(),
            file: "reserve.ts".to_string(),
            path: std::path::PathBuf::from("reserve.ts"),
            module: "shop".to_string(),
            label: "modules/shop".to_string(),
            content: "export class ReserveStockTransition {\n  public handler = async (data) => {\n    return data;\n  };\n}\n".to_string(),
        },
        cli::commands::project_check::artifacts::Artifact {
            kind: "transition".to_string(),
            class: "GhostTransition".to_string(),
            file: "ghost.ts".to_string(),
            path: std::path::PathBuf::from("ghost.ts"),
            module: "shop".to_string(),
            label: "modules/shop".to_string(),
            content: "export class GhostTransition {\n  public handler = async () => {\n    await doWork();\n  };\n  public rollback = async () => {\n    await undoWork();\n  };\n}\n".to_string(),
        },
    ];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    workflows::inspect(&workflows, &transitions, &mut errors, &mut warnings);

    assert!(errors.iter().any(|error| error.contains("already used by")));
    assert!(errors.iter().any(|error| error.contains("never runs")));
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("empty rollback"))
    );
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("returns its input untouched"))
    );
}

#[test]
fn a_workflow_without_a_literal_name_is_reported() {
    let workflows = vec![workflows::WorkflowDefinition {
        class: "CheckoutWorkflow".to_string(),
        name: None,
        transitions: vec!["ChargeCardTransition".to_string()],
        file: "a.ts".to_string(),
    }];
    let transitions = vec![cli::commands::project_check::artifacts::Artifact {
        kind: "transition".to_string(),
        class: "ChargeCardTransition".to_string(),
        file: "charge.ts".to_string(),
        path: std::path::PathBuf::from("charge.ts"),
        module: "shop".to_string(),
        label: "modules/shop".to_string(),
        content: "export class ChargeCardTransition {\n  public handler = async () => {\n    await gateway.charge();\n  };\n  public rollback = async () => {\n    await gateway.refund();\n  };\n}\n".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    workflows::inspect(&workflows, &transitions, &mut errors, &mut warnings);

    assert!(
        errors
            .iter()
            .any(|error| error.contains("returns no literal name"))
    );
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

#[test]
fn a_body_that_only_returns_a_constant_decides_nothing() {
    assert!(permissions::is_constant(
        "\n  // Example: check the ip\n  return true;\n",
        "true"
    ));
    assert!(!permissions::is_constant(
        "\n  if (!context.user) return false;\n  return true;\n",
        "true"
    ));
}

// ---------------------------------------------------------------------------
// Mailers
// ---------------------------------------------------------------------------

#[test]
fn a_mailers_template_is_derived_from_its_name() {
    assert_eq!(
        mailers::template_of("WelcomeMailer"),
        "WelcomeMailerTemplate"
    );
}

#[test]
fn a_template_no_mailer_renders_is_reported() {
    let templates: BTreeSet<(String, String)> = [(
        "WelcomeMailerTemplate".to_string(),
        "modules/user/src/mailers/WelcomeMailerTemplate.tsx".to_string(),
    )]
    .into_iter()
    .collect();

    let findings = mailers::orphan_templates(&templates, &[]);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("rendered by no mailer"));
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

#[test]
fn two_flags_claiming_one_key_fail() {
    let flags = vec![
        flags::Flag {
            class: "NewCheckoutFlag".to_string(),
            key: Some("new-checkout".to_string()),
            described: true,
            file: "a.ts".to_string(),
        },
        flags::Flag {
            class: "CheckoutV2Flag".to_string(),
            key: Some("new-checkout".to_string()),
            described: true,
            file: "b.ts".to_string(),
        },
    ];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    flags::inspect(&flags, &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("already claimed"));
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

#[test]
fn two_middlewares_sharing_a_name_have_no_defined_order() {
    let source = "@decorator.middleware()\nexport class AuthMiddleware {}";
    let artifacts: Vec<_> = ["a.ts", "b.ts"]
        .into_iter()
        .map(|file| cli::commands::project_check::artifacts::Artifact {
            kind: "middleware".to_string(),
            class: "AuthMiddleware".to_string(),
            file: file.to_string(),
            path: std::path::PathBuf::from(file),
            module: "user".to_string(),
            label: "modules/user".to_string(),
            content: source.to_string(),
        })
        .collect();

    let findings = middlewares::collisions(&artifacts);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("order they run in is undefined"));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

#[test]
fn a_route_id_is_derived_from_where_the_file_sits() {
    assert_eq!(router::route_id("index.tsx"), "/");
    assert_eq!(router::route_id("posts/index.tsx"), "/posts");
    assert_eq!(router::route_id("posts/$id.tsx"), "/posts/$id");
    assert_eq!(router::route_id("posts.$id.tsx"), "/posts/$id");
    assert_eq!(router::route_id("(app)/dashboard.tsx"), "/dashboard");
}

#[test]
fn a_route_declaring_another_path_fails() {
    let source = r#"export const Route = createFileRoute("/elsewhere")({ component: A });"#;
    let route = router::parse(source, "modules/spa/src/routes/posts.tsx", "posts.tsx");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    router::inspect(
        &[route],
        Some("posts"),
        "modules/spa",
        &mut errors,
        &mut warnings,
    );

    assert!(
        errors
            .iter()
            .any(|line| line.contains("its location means"))
    );
}

#[test]
fn a_route_file_the_generated_tree_never_saw_fails() {
    let source = r#"export const Route = createFileRoute("/posts")({
      component: Posts,
      errorComponent: E,
      pendingComponent: P,
      notFoundComponent: N,
    });"#;
    let route = router::parse(source, "modules/spa/src/routes/posts.tsx", "posts.tsx");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    router::inspect(
        &[route],
        Some("// only index"),
        "modules/spa",
        &mut errors,
        &mut warnings,
    );

    assert!(errors.iter().any(|line| line.contains("regenerate")));
    assert!(warnings.is_empty());
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

#[test]
fn an_inline_query_key_is_reported() {
    let source = r#"
export const useGetUser = (id: string) =>
  useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id),
  });
"#;
    let sites = queries::call_sites(source, "modules/spa/src/features/user/useGetUser.ts");
    assert_eq!(sites.len(), 1);
    assert_eq!(sites[0].literal_root.as_deref(), Some("user"));

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);
    assert!(warnings[0].contains("key factory"));
}

#[test]
fn a_key_read_from_a_factory_is_left_alone() {
    let source = r#"useQuery({ queryKey: userKeys.detail(id), queryFn: get });"#;
    let sites = queries::call_sites(source, "a.ts");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);

    assert!(errors.is_empty() && warnings.is_empty());
}

#[test]
fn a_query_without_a_key_is_reported_and_feature_paths_are_detected() {
    let source = r#"useSuspenseQuery({ queryFn: getUser });"#;
    let sites = queries::call_sites(source, "modules/spa/src/features/user/a.ts");

    assert_eq!(queries::feature_of(&sites[0].file), Some("user"));

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert!(warnings[0].contains("declares no queryKey"));
}

#[test]
fn a_mutation_that_never_invalidates_leaves_the_screen_stale() {
    let source = r#"useMutation({ mutationFn: updateUser });"#;
    let sites = queries::call_sites(source, "a.ts");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);

    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("never refreshes"));
}

#[test]
fn cache_writes_count_as_invalidations() {
    for marker in [
        "invalidateQueries",
        "setQueryData",
        "resetQueries",
        "removeQueries",
    ] {
        let source = format!(
            "useMutation({{ mutationFn: updateUser, onSuccess: () => queryClient.{marker}({{ queryKey: ['user'] }}) }});"
        );
        let sites = queries::call_sites(&source, "a.ts");

        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        queries::inspect(&sites, &mut errors, &mut warnings);

        assert!(errors.is_empty(), "{marker}");
        assert!(warnings.is_empty(), "{marker}");
    }
}

#[test]
fn shared_files_have_no_feature_scope() {
    assert_eq!(
        queries::feature_of("modules/spa/src/shared/hooks/useA.ts"),
        None
    );
}

#[test]
fn malformed_or_same_feature_query_keys_do_not_collide() {
    let malformed = queries::call_sites("useQuery({ queryKey: [\"broken\"]", "a.ts");
    assert!(malformed.is_empty());

    let sites = vec![
        queries::CallSite {
            hook: "useQuery".to_string(),
            file: "modules/spa/src/features/user/a.ts".to_string(),
            line: 1,
            literal_root: Some("profile".to_string()),
            from_factory: false,
            invalidates: false,
        },
        queries::CallSite {
            hook: "useQuery".to_string(),
            file: "modules/spa/src/features/user/b.ts".to_string(),
            line: 2,
            literal_root: Some("profile".to_string()),
            from_factory: false,
            invalidates: false,
        },
    ];
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);
    assert!(errors.is_empty());
    assert_eq!(warnings.len(), 2);
}

#[test]
fn one_key_root_across_two_features_is_a_collision() {
    let sites = vec![
        queries::CallSite {
            hook: "useQuery".to_string(),
            file: "modules/spa/src/features/user/a.ts".to_string(),
            line: 1,
            literal_root: Some("profile".to_string()),
            from_factory: false,
            invalidates: false,
        },
        queries::CallSite {
            hook: "useQuery".to_string(),
            file: "modules/spa/src/features/billing/b.ts".to_string(),
            line: 1,
            literal_root: Some("profile".to_string()),
            from_factory: false,
            invalidates: false,
        },
    ];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    queries::inspect(&sites, &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("another feature"));
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

#[test]
fn a_hand_written_colour_is_reported() {
    let found = tokens::inspect("const border = \"#1d4ed8\";", "a.tsx", false);
    assert_eq!(found.len(), 1);
    assert!(found[0].is_colour);
}

#[test]
fn a_fragment_identifier_is_not_a_colour() {
    assert!(tokens::inspect("<a href=\"#section\">x</a>", "a.tsx", false).is_empty());
}

#[test]
fn the_design_module_may_reach_below_the_scale() {
    let source = "<div className=\"ring-[3px]\" />";
    assert!(tokens::inspect(source, "a.tsx", true).is_empty());
    assert_eq!(tokens::inspect(source, "a.tsx", false).len(), 1);
}

#[test]
fn the_stylesheets_that_define_the_tokens_are_exempt() {
    assert!(!tokens::is_checked(
        "modules/design/src/styles/themes/light.css"
    ));
    assert!(tokens::is_checked(
        "modules/spa/src/features/user/UserLayout.tsx"
    ));
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

#[test]
fn an_image_without_an_intrinsic_size_is_reported() {
    let mut warnings = Vec::new();
    assets::unsized_images("<img src={logo} alt=\"logo\" />", "a.tsx", &mut warnings);
    assert_eq!(warnings.len(), 1);

    let mut sized = Vec::new();
    assets::unsized_images(
        "<img src={logo} alt=\"logo\" width={48} height={48} />",
        "a.tsx",
        &mut sized,
    );
    assert!(sized.is_empty());
}

#[test]
fn an_asset_the_platform_loads_by_name_is_not_orphaned() {
    assert!(assets::is_conventional("favicon"));
    assert!(assets::is_conventional("apple-touch-icon-180x180"));
    assert!(!assets::is_conventional("hero-banner"));
}

#[test]
fn the_inspirations_catalogue_is_not_a_shipped_asset() {
    let (guard, root) = folder_root();
    let module = write_module(&root, "design", "design");
    fs::create_dir_all(module.dir.join("src/inspirations/article")).expect("create inspirations");
    fs::create_dir_all(module.dir.join("src/components")).expect("create components");
    fs::write(
        module.dir.join("src/inspirations/article/three-pane.webp"),
        [0_u8; 4],
    )
    .expect("write inspiration");
    fs::write(module.dir.join("src/components/logo.svg"), "<svg/>").expect("write asset");

    let collected = assets::collect(&module);

    assert_eq!(collected.len(), 1);
    assert!(collected[0].ends_with("logo.svg"));
    drop(guard);
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

#[test]
fn the_entities_a_repository_is_built_on_are_read() {
    let source = "import { UserEntity } from \"../entities/UserEntity\";\nclass R { open() { return this.database.open(UserEntity); } }";
    let found = repositories::entities_of(source);
    assert!(found.contains("UserEntity"));
}

#[test]
fn a_service_opening_the_database_itself_is_reported() {
    let mut corpus = cli::commands::project_check::artifacts::Corpus::default();
    corpus.files.insert(
        "modules/user/src/services/UserService.ts".to_string(),
        "const repository = await this.database.open(UserEntity);".to_string(),
    );
    corpus.files.insert(
        "modules/user/src/repositories/UserRepository.ts".to_string(),
        "const repository = await this.database.open(UserEntity);".to_string(),
    );

    let findings = repositories::direct_access(&corpus);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].starts_with("modules/user/src/services/UserService.ts"));
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

#[test]
fn a_foreign_key_column_needs_an_index() {
    let entity = r#"
@ManyToOne(() => UserEntity)
@JoinColumn({ name: "user_id" })
public user!: UserEntity;
"#;
    let found = indexes::lookups(entity, "modules/order/src/entities/OrderEntity.ts");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].column, "user_id");

    let mut warnings = Vec::new();
    indexes::inspect(
        &found,
        "await queryRunner.query(`CREATE TABLE \"order\"`)",
        &mut warnings,
    );
    assert_eq!(warnings.len(), 1);
}

#[test]
fn an_indexed_column_is_not_reported() {
    let found = vec![indexes::Lookup {
        column: "user_id".to_string(),
        reason: "it is a foreign key every join filters on",
        unique: false,
        file: "a.ts".to_string(),
    }];

    let mut warnings = Vec::new();
    indexes::inspect(
        &found,
        "await queryRunner.query(`CREATE INDEX \"IDX_order_user\" ON \"order\" (\"user_id\")`)",
        &mut warnings,
    );
    assert!(warnings.is_empty());
}

#[test]
fn a_unique_column_needs_a_unique_constraint() {
    let entity = r#"@Column({ name: "email", type: "varchar", unique: true })"#;
    let found = indexes::lookups(entity, "a.ts");
    assert_eq!(found.len(), 1);
    assert!(found[0].unique);

    let mut satisfied = Vec::new();
    indexes::inspect(
        &found,
        "ALTER TABLE \"user\" ADD CONSTRAINT \"UQ_email\" UNIQUE (\"email\")",
        &mut satisfied,
    );
    assert!(satisfied.is_empty());
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

#[test]
fn a_method_writing_twice_is_reported() {
    let source = r#"
public async place(order: OrderEntity): Promise<void> {
  await this.orders.create(order);
  await this.stock.update({ id: order.stockId, count: 0 });
}
"#;
    let found = transactions::inspect(source, "modules/order/src/services/OrderService.ts");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].writes.len(), 2);
}

#[test]
fn a_method_inside_a_transaction_is_left_alone() {
    let source = r#"
public async place(order: OrderEntity): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.save(order);
    await manager.update(StockEntity, order.stockId, { count: 0 });
  });
}
"#;
    assert!(transactions::inspect(source, "a.ts").is_empty());
}

#[test]
fn a_method_with_only_one_write_is_not_reported() {
    let source = r#"
private static sync = async (): Promise<void> => {
  await this.repository.save({});
}
"#;

    assert!(transactions::inspect(source, "a.ts").is_empty());
}

#[test]
fn the_repository_layer_is_exempt() {
    assert!(!transactions::is_checked(
        "modules/user/src/repositories/UserRepository.ts"
    ));
    assert!(transactions::is_checked(
        "modules/user/src/services/UserService.ts"
    ));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[test]
fn validation_strips_line_and_block_comments() {
    let stripped = validation::strip_comments(
        "params: {\n  id: string, // gone\n  /* block */\n  slug?: string,\n}\n",
    );

    assert!(!stripped.contains("gone"));
    assert!(!stripped.contains("block"));
    assert!(stripped.contains("slug?: string"));
}

#[test]
fn validation_body_balances_nested_braces() {
    let source = "{ payload: { user: { id: string } }, queries: { page: number } }";
    let found = validation::body(source, 0).expect("balanced");

    assert!(found.contains("payload"));
    assert!(validation::body("{ payload: { id: string }", 0).is_none());
}

#[test]
fn validation_reports_missing_and_extra_fields() {
    let contract = validation::Contract {
        typed: vec![
            (
                "params".to_string(),
                ["id".to_string()].into_iter().collect(),
            ),
            (
                "queries".to_string(),
                ["page".to_string()].into_iter().collect(),
            ),
        ],
        asserted: vec![(
            "params".to_string(),
            ["id".to_string(), "slug".to_string()].into_iter().collect(),
        )],
    };

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    validation::inspect("controller.ts", &contract, &mut errors, &mut warnings);

    assert!(
        errors
            .iter()
            .any(|error| error.contains("`queries` is typed but the route asserts no schema"))
    );
    assert!(
        warnings
            .iter()
            .any(|warning| warning.contains("`params.slug` is validated but missing"))
    );
}

#[test]
fn tsconfig_inspect_module_accepts_the_root_extends_path() {
    let module = WorkspaceModule {
        name: "user".to_string(),
        group: "modules".to_string(),
        kind: Some("module".to_string()),
        dir: std::path::PathBuf::from("modules/user"),
    };
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    tsconfig::inspect_module(
        &module,
        &serde_json::json!({
            "extends": "../../tsconfig.json",
            "exclude": ["dist", "node_modules"]
        }),
        &["strict"],
        &mut errors,
        &mut warnings,
    );
    assert!(errors.is_empty());
    assert!(warnings.is_empty());
}

// ---------------------------------------------------------------------------
// SDK
// ---------------------------------------------------------------------------

#[test]
fn sdk_surface_reads_keys_endpoints_and_placeholders() {
    let (guard, root) = folder_root();
    let module = write_module(&root, "sdk", "sdk");
    fs::create_dir_all(module.dir.join("src")).expect("create src");
    fs::write(
        module.dir.join("src/index.ts"),
        "export const userRead = { key: \"user.read\", endpoint: \"/v2/users\", run: () => { throw new Error('Not implemented'); } };\nexport const orderList = { key: \"order.list\", endpoint: \"/v1/orders\" };\n",
    )
    .expect("write sdk source");

    let surface = sdk::surface(&module);
    assert_eq!(
        surface.keys,
        ["order.list".to_string(), "user.read".to_string()]
            .into_iter()
            .collect()
    );
    assert!(surface.endpoints.contains("/v2/users"));
    assert_eq!(surface.unimplemented, 1);
    drop(guard);
}

#[test]
fn sdk_inspect_reports_moved_endpoints_and_leaves_extra_methods_alone() {
    let surface = sdk::SdkSurface {
        keys: ["user.read".to_string(), "user.stale".to_string()]
            .into_iter()
            .collect(),
        endpoints: ["/v1/users".to_string()].into_iter().collect(),
        unimplemented: 1,
    };
    let routes = vec![Route {
        method: "get".to_string(),
        path: "/users/:id".to_string(),
        name: Some("user.read".to_string()),
        description: None,
        version: Some(2),
        version_raw: Some("2".to_string()),
        roles: vec!["ROLE_USER".to_string()],
        declares_roles: true,
        file: "controller.ts".to_string(),
    }];

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    sdk::inspect(
        "modules/sdk",
        "app",
        &surface,
        &routes,
        &mut errors,
        &mut warnings,
    );

    assert!(!errors.iter().any(|error| error.contains("user.stale")));
    assert!(
        errors
            .iter()
            .any(|error| error.contains("now answers on `/v2/users/:id`"))
    );
    assert!(warnings[0].contains("Not implemented"));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

#[test]
fn a_console_call_has_no_level_and_no_destination() {
    let findings = logging::consoles("console.log(\"hello\");", "a.ts");
    assert_eq!(findings.len(), 1);
}

#[test]
fn a_log_line_carrying_a_secret_fails() {
    let leaks = logging::leaks(
        "this.logger.info(\"login\", { email, password });",
        "modules/auth/src/services/LoginService.ts",
    );
    assert_eq!(leaks.len(), 1);
    assert_eq!(leaks[0].field, "password");
}

#[test]
fn a_log_line_spanning_several_lines_is_still_read_whole() {
    let source = "logger.error(\n  \"failed\",\n  { userId, accessToken },\n);";
    assert_eq!(logging::leaks(source, "a.ts").len(), 1);
}

#[test]
fn a_command_may_write_to_the_console() {
    assert!(!logging::is_checked(
        "modules/user/src/commands/SyncCommand.ts"
    ));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/// The findings a single route source produces.
fn route_findings(source: &str) -> (Vec<String>, Vec<String>) {
    let route = routes::parse(source, "modules/user/src/controllers/ReadUserController.ts")
        .expect("the route parses");
    let (mut errors, mut warnings) = (Vec::new(), Vec::new());
    routes::inspect(&route, &mut errors, &mut warnings);
    (errors, warnings)
}

#[test]
fn a_fully_declared_route_reads_clean() {
    let (errors, warnings) = route_findings(
        r#"
@Route.get("/users/:id", {
  name: "user.profile.read",
  description: "Read a user profile",
  version: 1,
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#,
    );
    assert!(errors.is_empty(), "{errors:?}");
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn a_route_name_outside_the_namespace_resource_action_format_is_rejected() {
    for name in [
        "read",
        "user.read",
        "user.profile.read.again",
        "user.profile.read-one",
    ] {
        let source = format!(
            r#"
@Route.get("/users/:id", {{
  name: "{name}",
  description: "Read a user profile",
  version: 1,
  roles: ["ROLE_USER"],
}})
export class ReadUserController {{}}
"#
        );
        let (errors, _) = route_findings(&source);
        assert!(
            errors
                .iter()
                .any(|finding| finding.contains("namespace.resource.action")),
            "{name} was accepted"
        );
    }
}

#[test]
fn two_controllers_may_not_claim_the_same_route_name() {
    let first = routes::parse(
        r#"@Route.get("/users", { name: "user.profile.read", description: "a", version: 1 })"#,
        "modules/user/src/controllers/ReadUserController.ts",
    )
    .expect("the route parses");
    let second = routes::parse(
        r#"@Route.get("/accounts", { name: "user.profile.read", description: "a", version: 1 })"#,
        "modules/user/src/controllers/ReadAccountController.ts",
    )
    .expect("the route parses");

    let findings = routes::collisions(&[first, second]);
    assert_eq!(findings.len(), 1);
    assert!(findings[0].contains("already used by"));
}

#[test]
fn a_route_without_a_description_is_rejected() {
    let (errors, _) = route_findings(
        r#"
@Route.get("/users/:id", {
  name: "user.profile.read",
  version: 1,
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#,
    );
    assert!(
        errors
            .iter()
            .any(|finding| finding.contains("no `description`"))
    );
}

#[test]
fn an_empty_description_counts_as_none() {
    let (errors, _) = route_findings(
        r#"
@Route.get("/users/:id", {
  name: "user.profile.read",
  description: "   ",
  version: 1,
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#,
    );
    assert!(
        errors
            .iter()
            .any(|finding| finding.contains("`description` is empty"))
    );
}

#[test]
fn a_version_that_is_not_a_number_is_rejected() {
    let (errors, warnings) = route_findings(
        r#"
@Route.get("/users/:id", {
  name: "user.profile.read",
  description: "Read a user profile",
  version: "1",
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#,
    );
    assert!(
        errors
            .iter()
            .any(|finding| finding.contains("is not a number"))
    );
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn a_missing_version_is_only_a_warning() {
    let (errors, warnings) = route_findings(
        r#"
@Route.get("/users/:id", {
  name: "user.profile.read",
  description: "Read a user profile",
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#,
    );
    assert!(errors.is_empty(), "{errors:?}");
    assert!(
        warnings
            .iter()
            .any(|finding| finding.contains("no `version`"))
    );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

#[test]
fn a_collection_route_without_page_or_limit_is_unbounded() {
    let source = r#"
@Route.get("/users", {
  name: "user.list",
  version: 1,
  queries: Assert({}),
  response: Assert("UserType[]"),
  roles: ["ROLE_ADMIN"],
})
export class ListUsersController {}
"#;
    let endpoint = pagination::parse(
        source,
        "modules/user/src/controllers/ListUsersController.ts",
    )
    .expect("the route parses");
    assert!(endpoint.returns_collection);

    let mut warnings = Vec::new();
    pagination::inspect(&[endpoint], &mut warnings);
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("unbounded"));
}

#[test]
fn a_paginated_collection_route_is_left_alone() {
    let source = r#"
@Route.get("/users", {
  name: "user.list",
  queries: Assert({ page: "number", limit: "number" }),
  response: Assert("UserType[]"),
  roles: ["ROLE_ADMIN"],
})
export class ListUsersController {}
"#;
    let endpoint = pagination::parse(source, "a.ts").expect("the route parses");

    let mut warnings = Vec::new();
    pagination::inspect(&[endpoint], &mut warnings);
    assert!(warnings.is_empty());
}

#[test]
fn a_single_resource_route_needs_no_pagination() {
    let source = r#"
@Route.get("/users/:id", {
  name: "user.read",
  queries: Assert({}),
  response: Assert({ id: "string" }),
  roles: ["ROLE_USER"],
})
export class ReadUserController {}
"#;
    let endpoint = pagination::parse(source, "a.ts").expect("the route parses");
    assert!(!endpoint.returns_collection);
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

#[test]
fn an_operation_is_spelled_the_same_on_both_sides() {
    assert_eq!(
        openapi::operation("get", "/v1/users/{id}"),
        "GET /users/{param}"
    );
    assert_eq!(
        openapi::operation("GET", "/users/:id"),
        "GET /users/{param}"
    );
}

#[test]
fn a_json_specification_is_read_by_its_paths() {
    let spec = r#"{"paths":{"/users":{"get":{},"post":{}},"/users/{id}":{"get":{}}}}"#;
    let operations = openapi::spec_operations(spec, true);
    assert_eq!(operations.len(), 3);
    assert!(operations.contains("POST /users"));
}

#[test]
fn a_yaml_specification_is_read_by_indentation() {
    let spec = "openapi: 3.1.0\npaths:\n  /users:\n    get:\n      summary: list\n    post:\n      summary: create\n";
    let operations = openapi::spec_operations(spec, false);
    assert_eq!(operations.len(), 2);
    assert!(operations.contains("GET /users"));
}

#[test]
fn a_published_operation_no_controller_serves_fails() {
    let published = openapi::spec_operations(r#"{"paths":{"/ghost":{"get":{}}}}"#, true);

    let mut errors = Vec::new();
    openapi::inspect(&published, &[], "openapi.json", &mut errors);
    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("no controller serves it"));
}

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

#[test]
fn a_marker_naming_an_issue_is_read_with_its_line() {
    let found = todos::markers("const a = 1;\n// TODO(OON-123456): extract this\n", "a.ts");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].issue, "OON-123456");
    assert_eq!(found[0].line, 2);
}

#[test]
fn a_bare_marker_belongs_to_the_hygiene_check() {
    assert!(todos::markers("// TODO: later\n", "a.ts").is_empty());
}

#[test]
fn a_marker_pointing_at_nothing_fails() {
    let markers = todos::markers("// FIXME(OON-999999)\n", "a.ts");

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    todos::inspect(&markers, &BTreeMap::new(), &mut errors, &mut warnings);

    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("does not hold"));
}

#[test]
fn a_marker_outliving_its_issue_is_reported() {
    let markers = todos::markers("// TODO(OON-123456)\n", "a.ts");
    let issues: BTreeMap<String, Option<String>> =
        [("OON-123456".to_string(), Some("Done".to_string()))]
            .into_iter()
            .collect();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    todos::inspect(&markers, &issues, &mut errors, &mut warnings);

    assert!(errors.is_empty());
    assert!(warnings[0].contains("the issue is Done"));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

fn member(fingerprint: &str, backend: bool, frontend: bool) -> cache::Member {
    cache::Member {
        fingerprint: fingerprint.to_string(),
        backend,
        frontend,
    }
}

fn workspace() -> cache::Fingerprints {
    cache::Fingerprints {
        root: "root-1".to_string(),
        modules: [
            ("modules/user".to_string(), member("user-1", true, false)),
            (
                "modules/design".to_string(),
                member("design-1", false, true),
            ),
        ]
        .into_iter()
        .collect(),
    }
}

fn entry(id: CheckId, fingerprints: &cache::Fingerprints) -> cache::Entry {
    cache::Entry {
        version: cache::VERSION,
        checker: cache::checker().to_string(),
        check: id.key().to_string(),
        options: String::new(),
        root: fingerprints.root.clone(),
        modules: fingerprints.scoped(id.reads()),
        status: "passed".to_string(),
        summary: "all good".to_string(),
        details: Vec::new(),
        hints: Vec::new(),
        duration_ms: 5,
    }
}

#[test]
fn a_check_only_records_the_members_it_reads() {
    let fingerprints = workspace();

    assert_eq!(
        fingerprints
            .scoped(CheckId::Indexes.reads())
            .into_keys()
            .collect::<Vec<_>>(),
        vec!["modules/user"]
    );
    assert_eq!(
        fingerprints
            .scoped(CheckId::Tokens.reads())
            .into_keys()
            .collect::<Vec<_>>(),
        vec!["modules/design"]
    );
    assert_eq!(fingerprints.scoped(CheckId::Tests.reads()).len(), 2);
}

#[test]
fn an_untouched_tree_is_served_from_the_entry() {
    let fingerprints = workspace();
    let stored = entry(CheckId::Indexes, &fingerprints);

    assert!(stored.matches("", CheckId::Indexes.reads(), &fingerprints));
    assert_eq!(
        stored
            .outcome(CheckId::Indexes)
            .map(|outcome| outcome.cached),
        Some(true)
    );
}

#[test]
fn a_change_outside_what_a_check_reads_keeps_it_cached() {
    let fingerprints = workspace();
    let stored = entry(CheckId::Indexes, &fingerprints);

    // The design system moved; a check that only reads backend modules did not.
    let mut moved = fingerprints.clone();
    moved.modules.insert(
        "modules/design".to_string(),
        member("design-2", false, true),
    );

    assert!(stored.matches("", CheckId::Indexes.reads(), &moved));
    assert!(!entry(CheckId::Tokens, &fingerprints).matches("", CheckId::Tokens.reads(), &moved));
}

#[test]
fn a_change_inside_what_a_check_reads_invalidates_it() {
    let fingerprints = workspace();
    let stored = entry(CheckId::Indexes, &fingerprints);

    let mut moved = fingerprints.clone();
    moved
        .modules
        .insert("modules/user".to_string(), member("user-2", true, false));

    assert!(!stored.matches("", CheckId::Indexes.reads(), &moved));
}

#[test]
fn a_module_appearing_or_leaving_invalidates_the_entry() {
    let fingerprints = workspace();
    let stored = entry(CheckId::Tests, &fingerprints);

    let mut added = fingerprints.clone();
    added.modules.insert(
        "modules/billing".to_string(),
        member("billing-1", true, false),
    );
    assert!(!stored.matches("", CheckId::Tests.reads(), &added));

    let mut removed = fingerprints.clone();
    removed.modules.remove("modules/user");
    assert!(!stored.matches("", CheckId::Tests.reads(), &removed));
}

#[test]
fn a_change_outside_every_module_invalidates_everything() {
    let fingerprints = workspace();
    let stored = entry(CheckId::Indexes, &fingerprints);

    let mut moved = fingerprints.clone();
    moved.root = "root-2".to_string();
    assert!(!stored.matches("", CheckId::Indexes.reads(), &moved));
}

#[test]
fn an_entry_from_another_build_is_never_served() {
    let fingerprints = workspace();
    let mut stored = entry(CheckId::Indexes, &fingerprints);
    assert!(stored.matches("", CheckId::Indexes.reads(), &fingerprints));

    // The tree has not moved, but the checker that wrote the entry has: its
    // rules may have changed, so its answer is not this build's answer.
    stored.checker = "0.0.1+0".to_string();
    assert!(!stored.matches("", CheckId::Indexes.reads(), &fingerprints));

    // An entry written before entries carried a build at all.
    stored.checker = String::new();
    assert!(!stored.matches("", CheckId::Indexes.reads(), &fingerprints));
}

#[test]
fn the_checks_that_are_not_a_function_of_the_tree_are_never_cached() {
    for id in [
        CheckId::Workspace,
        CheckId::E2e,
        CheckId::Security,
        CheckId::Outdated,
        CheckId::Git,
        CheckId::Commits,
        CheckId::Branches,
    ] {
        assert!(!id.cacheable(), "{}", id.key());
    }
    assert!(CheckId::Folders.cacheable());
}

#[test]
fn only_the_options_that_change_a_finding_key_the_cache() {
    let mut args = ProjectCheckArgs {
        modules: Some("user".to_string()),
        ..Default::default()
    };
    let scoped = cache::options_key(&args);

    // Reporting options move nothing.
    args.json = true;
    args.strict = true;
    args.logs = true;
    assert_eq!(cache::options_key(&args), scoped);

    // The scope does.
    args.modules = Some("billing".to_string());
    assert_ne!(cache::options_key(&args), scoped);
}

#[test]
fn only_the_workspace_gate_and_the_suites_run_alone() {
    let serial: Vec<&str> = CheckId::ALL
        .into_iter()
        .filter(|id| id.is_serial())
        .map(|id| id.key())
        .collect();
    assert_eq!(serial, vec!["workspace", "coverage", "e2e"]);
}
