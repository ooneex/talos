use clap::Parser;
use cli::commands::design_create::{DesignCreateArgs, run};
use std::sync::Mutex;

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: DesignCreateArgs,
}

static ENV_GUARD: Mutex<()> = Mutex::new(());

#[test]
fn design_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--name",
        "MyDesign",
        "--cwd",
        "./here",
        "--silent",
        "--no-cache",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.name.as_deref(), Some("MyDesign"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
    assert!(cli.args.silent);
    assert!(cli.args.no_cache);
}

#[test]
fn design_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.name.is_none());
    assert!(cli.args.cwd.is_none());
    assert!(!cli.args.silent);
    assert!(!cli.args.no_cache);
}

#[test]
fn design_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

// ---------------------------------------------------------------------------
// file walking
// ---------------------------------------------------------------------------

mod support;

use cli::commands::design_create::visit_files_recursive;
use support::TempDir;

#[test]
fn visit_files_recursive_reaches_every_nested_file() {
    let dir = TempDir::new("design-visit");
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

#[test]
fn visit_files_recursive_ignores_an_unreadable_directory() {
    let dir = TempDir::new("design-visit-missing");

    let mut count = 0;
    visit_files_recursive(&dir.path().join("nope"), &mut |_| count += 1);

    assert_eq!(count, 0);
}

#[cfg(unix)]
fn write(path: &std::path::Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("parent");
    }
    std::fs::write(path, content).expect("file");
}

/// The `bun`/`git` stand-in is a shell script, so this one is unix-only.
#[cfg(unix)]
#[test]
fn design_create_scaffolds_a_module_and_updates_aliases() {
    use std::os::unix::fs::PermissionsExt;

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
        &home
            .path()
            .join(".talos/skeleton/modules/design/design.yml"),
        "type: \"design\"\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/design/package.json"),
        "{\n  \"name\": \"@module/design\",\n  \"dependencies\": {\"a\": \"1\"},\n  \"devDependencies\": {\"b\": \"1\"}\n}\n",
    );
    write(
        &home
            .path()
            .join(".talos/skeleton/modules/design/src/index.ts"),
        "export * from \"@module/design/components\";\n",
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

    run(&DesignCreateArgs {
        name: Some("Material".to_string()),
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

    let module_dir = cwd.path().join("modules/material");
    assert!(module_dir.join("material.yml").is_file());
    assert!(module_dir.join("src/index.ts").is_file());
    assert_eq!(
        std::fs::read_to_string(module_dir.join("src/index.ts")).expect("src"),
        "export * from \"@module/material/components\";\n"
    );
    let package = std::fs::read_to_string(module_dir.join("package.json")).expect("package");
    assert!(package.contains("\"@module/material\""), "{package}");
    let tsconfig = std::fs::read_to_string(cwd.path().join("tsconfig.json")).expect("tsconfig");
    assert!(tsconfig.contains("@module/material"), "{tsconfig}");
}
