use clap::Parser;
use cli::commands::admin_create::{AdminCreateArgs, run};
use std::os::unix::fs::PermissionsExt;
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: AdminCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn admin_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyAdmin",
        "--design",
        "material",
        "--target",
        "api",
        "--cwd",
        "./here",
        "--silent",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyAdmin"));
    assert_eq!(cli.args.design.as_deref(), Some("material"));
    assert_eq!(cli.args.target.as_deref(), Some("api"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
    assert!(cli.args.no_cache);
}

#[test]
fn admin_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.design.is_none());
    assert!(cli.args.target.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
    assert!(!cli.args.no_cache);
}

#[test]
fn admin_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// yml fields, module discovery and port allocation
// ---------------------------------------------------------------------------

mod support;

use cli::commands::admin_create::{
    DEFAULT_PORT, collect_design_modules, collect_target_modules, collect_used_ports,
    find_free_port, visit_files_recursive, with_design_field, with_target_field,
};
use support::TempDir;

#[test]
fn with_target_field_replaces_an_existing_target() {
    let yml = "name: \"admin\"\ntarget: \"old\"\ntype: \"admin\"\n";

    assert_eq!(
        with_target_field(yml, Some("api")),
        "name: \"admin\"\ntarget: \"api\"\ntype: \"admin\"\n"
    );
}

#[test]
fn with_target_field_appends_when_there_is_none() {
    let out = with_target_field("name: \"admin\"\n", Some("api"));

    assert_eq!(out, "name: \"admin\"\ntarget: \"api\"\n");
}

#[test]
fn with_target_field_removes_the_field_when_no_target_is_chosen() {
    let out = with_target_field("name: \"admin\"\ntarget: \"old\"\ntype: \"admin\"\n", None);

    assert!(!out.contains("target:"));
    assert!(out.contains("name: \"admin\""));
}

#[test]
fn with_target_field_leaves_content_alone_when_there_is_nothing_to_do() {
    let yml = "name: \"admin\"\n";

    assert_eq!(with_target_field(yml, None), yml);
}

#[test]
fn with_design_field_replaces_appends_and_removes() {
    assert_eq!(
        with_design_field("design: \"old\"\n", Some("material")),
        "design: \"material\"\n"
    );
    assert_eq!(
        with_design_field("name: \"admin\"\n", Some("material")),
        "name: \"admin\"\ndesign: \"material\"\n"
    );
    assert!(!with_design_field("design: \"old\"\n", None).contains("design:"));
    assert_eq!(
        with_design_field("name: \"admin\"\n", None),
        "name: \"admin\"\n"
    );
}

#[test]
fn collect_target_modules_finds_api_and_microservice_modules() {
    let dir = TempDir::new("admin-targets");
    dir.module("api", "api");
    dir.module("gateway", "microservice");
    dir.module("design", "design");
    dir.module("user", "module");

    let mut found = collect_target_modules(dir.path());
    found.sort();

    assert_eq!(found, ["api", "gateway"]);
}

#[test]
fn collect_target_modules_is_empty_for_an_unreadable_directory() {
    let dir = TempDir::new("admin-targets-missing");

    assert!(collect_target_modules(&dir.path().join("nope")).is_empty());
}

#[test]
fn collect_design_modules_finds_only_design_modules() {
    let dir = TempDir::new("admin-designs");
    dir.module("material", "design");
    dir.module("api", "api");

    assert_eq!(collect_design_modules(dir.path()), ["material"]);
    assert!(collect_design_modules(&dir.path().join("nope")).is_empty());
}

#[test]
fn collect_used_ports_reads_every_port_flag_in_package_scripts() {
    let dir = TempDir::new("admin-ports");
    dir.write(
        "one/package.json",
        r#"{"scripts": {"dev": "vite --port 3030", "preview": "vite preview --port 3031"}}"#,
    );
    dir.write(
        "two/package.json",
        r#"{"scripts": {"dev": "vite --port 3040"}}"#,
    );
    dir.write("three/package.json", "not json");
    dir.write("four/package.json", r#"{"name": "no-scripts"}"#);

    let used = collect_used_ports(dir.path(), "admin");

    assert_eq!(used.into_iter().collect::<Vec<_>>(), [3030, 3031, 3040]);
}

#[test]
fn find_free_port_returns_the_first_gap_above_the_default() {
    let mut used = std::collections::BTreeSet::new();

    assert_eq!(find_free_port(&used), DEFAULT_PORT);

    used.insert(DEFAULT_PORT);
    used.insert(DEFAULT_PORT + 1);
    assert_eq!(find_free_port(&used), DEFAULT_PORT + 2);
}

#[test]
fn visit_files_recursive_reaches_every_file_but_no_directory() {
    let dir = TempDir::new("admin-visit");
    dir.write("a.txt", "");
    dir.write("nested/b.txt", "");
    dir.write("nested/deeper/c.txt", "");

    let mut seen = Vec::new();
    visit_files_recursive(dir.path(), &mut |path| {
        seen.push(
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string(),
        );
    });
    seen.sort();

    assert_eq!(seen, ["a.txt", "b.txt", "c.txt"]);
}

fn write(path: &std::path::Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("parent");
    }
    std::fs::write(path, content).expect("file");
}

#[test]
fn admin_create_scaffolds_the_admin_and_missing_design_modules() {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let home = tempfile::tempdir().expect("home");
    let cwd = tempfile::tempdir().expect("cwd");
    let bin = cwd.path().join("bin");
    std::fs::create_dir_all(&bin).expect("bin");
    let bun = bin.join("bun");
    std::fs::write(
        &bun,
        "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
    )
    .expect("bun");
    let mut permissions = std::fs::metadata(&bun).expect("metadata").permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(&bun, permissions).expect("permissions");

    write(
        &home.path().join(".talos/skeleton/modules/admin/admin.yml"),
        "type: \"admin\"\ndesign: \"design\"\ntarget: \"app\"\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/admin/package.json"),
        "{\n  \"name\": \"@module/admin\",\n  \"dependencies\": {\"a\": \"1\"},\n  \"devDependencies\": {\"b\": \"1\"},\n  \"scripts\": {}\n}\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/admin/src/index.ts"),
        "export * from \"@module/admin/ui\";\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/admin/vite.config.ts"),
        "const alias = {\n      \\\"@\\\": fileURLToPath(new URL(\\\"./src\\\", import.meta.url)),\n      \\\"@module/admin\\\": fileURLToPath(\n        new URL(\\\"../admin/src\\\", import.meta.url),\n      ),\n    };\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/design/design.yml"),
        "type: \"design\"\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/design/package.json"),
        "{ \"name\": \"@module/design\" }\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/design/src/index.ts"),
        "export * from \"@module/design/components\";\n",
    );

    write(&cwd.path().join("modules/api/api.yml"), "type: \"api\"\n");
    write(
        &cwd.path().join("modules/api/package.json"),
        "{\n  \"scripts\": { \"dev\": \"vite --port 3030\" }\n}\n",
    );
    write(
        &cwd.path().join("tsconfig.json"),
        "{\n  \"compilerOptions\": { \"paths\": {} }\n}\n",
    );

    let previous_home = std::env::var_os("HOME");
    let previous_path = std::env::var_os("PATH");
    unsafe {
        std::env::set_var("HOME", home.path());
        std::env::set_var("PATH", &bin);
    }

    run(&AdminCreateArgs {
        name: Some("Backoffice".to_string()),
        design: Some("Material".to_string()),
        target: Some("api".to_string()),
        cwd: Some(cwd.path().display().to_string()),
        silent: true,
        no_cache: false,
    });

    match previous_home {
        Some(value) => unsafe { std::env::set_var("HOME", value) },
        None => unsafe { std::env::remove_var("HOME") },
    }
    match previous_path {
        Some(value) => unsafe { std::env::set_var("PATH", value) },
        None => unsafe { std::env::remove_var("PATH") },
    }

    let admin_dir = cwd.path().join("modules/backoffice");
    assert!(admin_dir.join("backoffice.yml").is_file());
    let yml = std::fs::read_to_string(admin_dir.join("backoffice.yml")).expect("yml");
    assert!(yml.contains("design: \"material\""), "{yml}");
    assert!(yml.contains("target: \"api\""), "{yml}");
    let package = std::fs::read_to_string(admin_dir.join("package.json")).expect("package");
    assert!(package.contains("\"@module/backoffice\""), "{package}");
    assert!(package.contains("--port 3031"), "{package}");
    let source = std::fs::read_to_string(admin_dir.join("src/index.ts")).expect("source");
    assert!(source.contains("@module/backoffice"), "{source}");
    let vite = std::fs::read_to_string(admin_dir.join("vite.config.ts")).expect("vite");
    assert!(vite.contains("@module/material"), "{vite}");
    assert!(cwd.path().join("modules/material/material.yml").is_file());
}
