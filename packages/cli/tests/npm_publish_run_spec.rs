//! `npm:publish` against stand-in `bun` and `npm` binaries.
//!
//! Packing and publishing both shell out, so scripts at the front of `PATH`
//! record the arguments and stand in for a real registry.

#![cfg(unix)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::Mutex;

use cli::commands::npm_publish::{NpmPublishArgs, publish_one, run};
use cli::utils::save_credentials;

static ENV_GUARD: Mutex<()> = Mutex::new(());

fn write_executable(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, content).expect("write script");
    let mut permissions = fs::metadata(path).expect("metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).expect("permissions");
}

fn with_env<T>(home: &Path, path: &Path, test: impl FnOnce() -> T) -> T {
    let _guard = ENV_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let previous_home = std::env::var_os("HOME");
    let previous_path = std::env::var_os("PATH");
    let merged_path = previous_path
        .as_ref()
        .map(|value| format!("{}:{}", path.display(), value.to_string_lossy()))
        .unwrap_or_else(|| path.display().to_string());
    unsafe {
        std::env::set_var("HOME", home);
        std::env::set_var("PATH", merged_path);
    }
    let outcome = test();
    unsafe {
        match previous_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match previous_path {
            Some(value) => std::env::set_var("PATH", value),
            None => std::env::remove_var("PATH"),
        }
    }
    outcome
}

fn seed_publish_scripts(bin: &Path, log: &Path) {
    write_executable(
        &bin.join("bun"),
        &format!(
            "#!/bin/sh\nif [ \"$1\" = \"pm\" ] && [ \"$2\" = \"pack\" ]; then\n  mkdir -p dist/package\n  printf '{{\"name\":\"pkg\"}}' > dist/package/package.json\n  tar -czf dist/pkg-1.0.0.tgz -C dist package\n  rm -rf dist/package\n  printf 'bun:%s\\n' \"$*\" >> \"{}\"\n  exit 0\nfi\nexit 1\n",
            log.display()
        ),
    );
    write_executable(
        &bin.join("npm"),
        &format!(
            "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo '10.0.0'; exit 0; fi\nprintf 'npm:%s\\n' \"$*\" >> \"{}\"\nexit 0\n",
            log.display()
        ),
    );
}

#[test]
fn publish_one_packs_extracts_and_publishes_the_package() {
    let root = tempfile::tempdir().expect("tempdir");
    let bin = root.path().join("bin");
    let target = root.path().join("packages/core");
    let log = root.path().join("publish.log");
    fs::create_dir_all(&target).expect("target dir");
    seed_publish_scripts(&bin, &log);

    let result = with_env(root.path(), &bin, || {
        publish_one(&target, "public", "token")
    });

    assert!(result.is_ok(), "{result:?}");
    let log_text = fs::read_to_string(log).expect("log");
    assert!(log_text.contains("bun:pm pack --destination ./dist"));
    assert!(log_text.contains("npm:publish --access public"));
    assert!(!target.join("dist/publish").exists());
}

#[test]
fn publish_one_reports_when_bun_pack_fails() {
    let root = tempfile::tempdir().expect("tempdir");
    let bin = root.path().join("bin");
    let target = root.path().join("packages/core");
    fs::create_dir_all(&target).expect("target dir");
    write_executable(
        &bin.join("bun"),
        "#!/bin/sh\necho 'pack failed' >&2\nexit 1\n",
    );
    write_executable(
        &bin.join("npm"),
        "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then exit 0; fi\nexit 0\n",
    );

    let result = with_env(root.path(), &bin, || {
        publish_one(&target, "public", "token")
    });

    assert!(result.unwrap_err().contains("bun pm pack failed"));
}

#[test]
fn run_publishes_selected_targets_when_versions_are_not_declared() {
    let root = tempfile::tempdir().expect("tempdir");
    let bin = root.path().join("bin");
    let log = root.path().join("publish.log");
    let package_dir = root.path().join("packages/core");
    fs::create_dir_all(&package_dir).expect("package dir");
    fs::write(
        package_dir.join("package.json"),
        "{ \"name\": \"@scope/core\" }\n",
    )
    .expect("package");
    seed_publish_scripts(&bin, &log);

    with_env(root.path(), &bin, || {
        save_credentials(
            "npm.yml",
            "npm",
            &[("token".to_string(), "secret".to_string())],
            true,
        )
        .expect("credentials");
        run(&NpmPublishArgs {
            packages: Some("core".to_string()),
            modules: None,
            access: "public".to_string(),
            silent: true,
            cwd: Some(root.path().display().to_string()),
        });
    });

    assert!(package_dir.join("dist/pkg-1.0.0.tgz").is_file());
}
