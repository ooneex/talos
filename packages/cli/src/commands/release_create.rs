use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::commands::build::{self, BuildArgs};
use crate::commands::check::{self, CheckArgs};
use crate::commands::install::{self, InstallArgs};
use crate::commands::npm_publish::{self, NpmPublishArgs};
use crate::utils::{Spinner, ask_confirm, run_spinner_step};

#[derive(Clone)]
struct TargetDir {
    base: String,
    kind: String,
}

fn base_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

#[derive(Clone, Debug)]
pub struct CommitInfo {
    pub hash: String,
    pub r#type: String,
    pub subject: String,
    pub author: String,
    pub breaking: bool,
}

#[derive(Clone)]
struct ReleasePlan {
    dir: TargetDir,
    full_dir: PathBuf,
    package_json_path: PathBuf,
    package_json: Value,
    cargo_toml_path: Option<PathBuf>,
    commits: Vec<CommitInfo>,
    bump_type: &'static str,
    new_version: String,
    tag: String,
}

#[derive(Args, Debug)]
pub struct ReleaseCreateArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    /// Force a patch bump. With no `--packages` or `--modules`, every
    /// package and module is bumped, including ones with no unreleased
    /// commits. A larger bump from those commits is not applied.
    #[arg(long, default_value_t = false)]
    pub bump: bool,

    #[arg(long, default_value_t = false)]
    pub publish: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn exec(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(args[0])
        .args(&args[1..])
        .current_dir(cwd)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_string())
}

fn has_pending_changes(cwd: &Path) -> bool {
    let Ok(repo) = git2::Repository::open(cwd) else {
        return false;
    };
    let mut options = git2::StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    repo.statuses(Some(&mut options))
        .map(|statuses| !statuses.is_empty())
        .unwrap_or(false)
}

fn get_last_tag(cwd: &Path, package_name: &str) -> Option<String> {
    exec(
        cwd,
        &[
            "git",
            "--no-pager",
            "tag",
            "--list",
            &format!("{package_name}@*"),
            "--sort=-v:refname",
        ],
    )?
    .lines()
    .next()
    .map(str::to_string)
}

/// The version carried by a `{package_name}@{version}` tag.
fn version_from_tag<'a>(tag: &'a str, package_name: &str) -> Option<&'a str> {
    tag.strip_prefix(package_name)
        .and_then(|rest| rest.strip_prefix('@'))
        .filter(|version| !version.is_empty())
}

fn get_commits_since_tag(cwd: &Path, tag: Option<&str>, dir_path: &str) -> Vec<CommitInfo> {
    let range = tag
        .map(|tag| format!("{tag}..HEAD"))
        .unwrap_or_else(|| "HEAD".to_string());
    let format_arg = "%H|%an|%s|%b%x1e";
    let Some(stdout) = exec(
        cwd,
        &[
            "git",
            "--no-pager",
            "log",
            &range,
            &format!("--format={format_arg}"),
            "--",
            dir_path,
        ],
    ) else {
        return Vec::new();
    };
    let re = regex::Regex::new(r"^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$").ok();
    let mut commits = Vec::new();
    for record in stdout.trim().split('\u{1e}') {
        let entry = record.trim();
        if entry.is_empty() {
            continue;
        }
        let mut parts = entry.split('|');
        let hash = parts.next().unwrap_or_default();
        let author = parts.next().unwrap_or_default();
        let rest = parts.collect::<Vec<_>>().join("|");
        let mut lines = rest.lines();
        let subject = lines.next().unwrap_or_default();
        let body = lines.collect::<Vec<_>>().join("\n");
        if let Some(re) = &re
            && let Some(caps) = re.captures(subject)
        {
            let ty = caps
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .to_string();
            let breaking = caps.get(3).is_some()
                || body.contains("BREAKING CHANGE:")
                || body.contains("BREAKING-CHANGE:");
            commits.push(CommitInfo {
                hash: hash.chars().take(8).collect(),
                r#type: ty,
                subject: caps
                    .get(4)
                    .map(|m| m.as_str())
                    .unwrap_or_default()
                    .to_string(),
                author: author.to_string(),
                breaking,
            });
        }
    }
    commits
}

pub fn determine_bump_type(commits: &[CommitInfo]) -> &'static str {
    let mut bump = "patch";
    for commit in commits {
        if commit.breaking {
            return "major";
        }
        if commit.r#type == "feat" {
            bump = "minor";
        }
    }
    bump
}

/// The version a release bumps from. npm's published version wins over the
/// manifest, so the next number sits directly after what the registry already
/// has. A package npm has never published keeps the version written in its
/// manifest. A git tag newer than both wins, so a version that was already
/// tagged is not tagged again.
pub fn release_base<'a>(
    local: &'a str,
    published: Option<&'a str>,
    tagged: Option<&'a str>,
) -> &'a str {
    let base = published.unwrap_or(local);
    match tagged {
        Some(tagged) if version_is_newer(tagged, base) => tagged,
        _ => base,
    }
}

fn version_parts(version: &str) -> [u64; 3] {
    let mut parts = version.split('.');
    let major = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    [major, minor, patch]
}

fn version_is_newer(left: &str, right: &str) -> bool {
    version_parts(left) > version_parts(right)
}

pub fn bump_version(version: &str, kind: &str) -> String {
    let parts: Vec<u64> = version
        .split('.')
        .filter_map(|p| p.parse::<u64>().ok())
        .collect();
    let major = *parts.first().unwrap_or(&0);
    let minor = *parts.get(1).unwrap_or(&0);
    let patch = *parts.get(2).unwrap_or(&0);
    match kind {
        "major" => format!("{}.0.0", major + 1),
        "minor" => format!("{major}.{}.0", minor + 1),
        _ => format!("{major}.{minor}.{}", patch + 1),
    }
}

pub fn normalize_repo_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches(".git");
    let Some(scp_url) = trimmed.strip_prefix("git@") else {
        return trimmed.to_string();
    };
    let Some((host, path)) = scp_url.split_once(':') else {
        return trimmed.to_string();
    };
    format!("https://{host}/{path}")
}

fn get_repo_url(cwd: &Path) -> Option<String> {
    crate::utils::git_origin_url(cwd).map(|url| normalize_repo_url(&url))
}

#[path = "release_create/changelog.rs"]
mod changelog;

pub use changelog::{update_cargo_version, update_changelog};
fn git(cwd: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Turns the released package/module base names into `NpmPublishArgs`
/// `packages`/`modules` filters, or `None` when neither list has anything
/// npm-publishable (e.g. a release that only touched Rust crates). Leaving
/// both filters unset would make `resolve_publish_targets` fall back to
/// discovering every package and module in the workspace, publishing things
/// this release never touched.
pub fn publish_args_for(
    released_packages: &[String],
    released_modules: &[String],
) -> Option<(Option<String>, Option<String>)> {
    if released_packages.is_empty() && released_modules.is_empty() {
        return None;
    }
    Some((
        (!released_packages.is_empty()).then(|| released_packages.join(",")),
        (!released_modules.is_empty()).then(|| released_modules.join(",")),
    ))
}

pub fn run(args: &ReleaseCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    if has_pending_changes(&cwd) {
        crate::utils::error(
            "Working tree has pending changes. Commit or stash them before releasing",
        );
        std::process::exit(1);
    }
    let target_dirs = discover_target_dirs(&cwd, args);
    remove_release_artifacts(&cwd, &target_dirs);
    let cwd_arg = Some(cwd.to_string_lossy().to_string());
    // `dist` and `node_modules` were just removed. Install once so the build
    // has dependencies, then lint and test through check with that install
    // already done. Every step bypasses its cache so a prior run cannot skip it.
    install::run(&InstallArgs {
        force: false,
        audit_level: None,
        skip_audit: false,
        no_cache: true,
        cwd: cwd_arg.clone(),
    });
    build::run(&BuildArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: false,
        no_cache: true,
        output: None,
        cwd: cwd_arg.clone(),
    });
    check::run(&CheckArgs {
        packages: args.packages.clone(),
        modules: args.modules.clone(),
        logs: false,
        no_cache: true,
        output: None,
        cwd: cwd_arg,
        skip_install: true,
    });

    let repo_url = get_repo_url(&cwd);
    let plans = build_release_plans(&cwd, &target_dirs, args.bump);
    if plans.is_empty() {
        println!(
            "{}",
            if args.bump {
                "No packages or modules to bump"
            } else {
                "No packages have unreleased commits"
            }
        );
        return;
    }

    let (released_packages, released_modules) =
        commit_and_tag_plans(&cwd, &plans, repo_url.as_deref());

    crate::utils::success(format!("{} package(s) released", plans.len()));
    if ask_confirm("Push commits and tags to remote?", true) {
        push_to_remote(&cwd);
    }
    if args.publish {
        // A Rust module has no npm package. Pushing its tag is what publishes
        // it: the GitHub release workflow builds the binaries from that tag.
        let rust_plans: Vec<_> = plans
            .iter()
            .filter(|plan| plan.cargo_toml_path.is_some())
            .collect();
        if !rust_plans.is_empty() {
            ensure_https_push_auth(&cwd);
            for plan in rust_plans {
                if git(
                    &cwd,
                    &["push", "origin", &format!("refs/tags/{}", plan.tag)],
                ) {
                    crate::utils::success(format!("Pushed {} to GitHub", plan.tag));
                } else {
                    crate::utils::error(format!("Failed to push {} to GitHub", plan.tag));
                }
            }
        }
        match publish_args_for(&released_packages, &released_modules) {
            Some((packages, modules)) => {
                npm_publish::run(&NpmPublishArgs {
                    packages,
                    modules,
                    access: "public".to_string(),
                    silent: false,
                    cwd: Some(cwd.to_string_lossy().to_string()),
                });
            }
            None => {
                println!("No npm-publishable packages or modules were released");
            }
        }
    }
}

/// Removes `dist` and `node_modules` from each selected package or module,
/// and `node_modules` from the project root, so the install that follows
/// reinstalls from the lockfile. Nested folders are left in place.
fn remove_release_artifacts(cwd: &Path, target_dirs: &[TargetDir]) {
    let spinner = Spinner::start("Removing dist and node_modules");
    let mut paths = vec![cwd.join("node_modules")];
    for dir in target_dirs {
        let full_dir = cwd.join(&dir.base);
        paths.push(full_dir.join("dist"));
        paths.push(full_dir.join("node_modules"));
    }
    for path in &paths {
        if let Err(message) = remove_dir(path) {
            drop(spinner);
            crate::utils::error(message);
            std::process::exit(1);
        }
    }
    drop(spinner);
}

/// Removes a directory when it exists. A missing path is already clean.
fn remove_dir(path: &Path) -> Result<(), String> {
    if !path.is_dir() {
        return Ok(());
    }
    fs::remove_dir_all(path)
        .map_err(|error| format!("Failed to remove {}: {error}", path.display()))
}

/// Discovers every `packages/*` and `modules/*` directory, then narrows the
/// list down to the ones the caller asked for. Neither `--packages` nor
/// `--modules` means all of them, so a bare `--bump` patches every package
/// and module. Exits the process when nothing is found, since there is
/// nothing left to release.
fn discover_target_dirs(cwd: &Path, args: &ReleaseCreateArgs) -> Vec<TargetDir> {
    let mut dirs = Vec::new();
    for (name, kind) in [("packages", "package"), ("modules", "module")] {
        if let Ok(entries) = fs::read_dir(cwd.join(name)) {
            dirs.extend(
                entries
                    .flatten()
                    .filter(|d| d.path().is_dir())
                    .map(|d| TargetDir {
                        base: format!("{name}/{}", d.file_name().to_string_lossy()),
                        kind: kind.to_string(),
                    }),
            );
        }
    }
    if dirs.is_empty() {
        crate::utils::error("No packages or modules found");
        std::process::exit(1);
    }

    let package_names = split_names(args.packages.as_deref());
    let module_names = split_names(args.modules.as_deref());
    let target_dirs: Vec<TargetDir> = if package_names.is_empty() && module_names.is_empty() {
        dirs
    } else {
        dirs.into_iter()
            .filter(|dir| {
                (dir.kind == "package" && package_names.contains(&base_name(&dir.base)))
                    || (dir.kind == "module" && module_names.contains(&base_name(&dir.base)))
            })
            .collect()
    };
    if target_dirs.is_empty() {
        let requested = package_names.iter().chain(module_names.iter()).cloned();
        crate::utils::error(format!(
            "No requested packages or modules found: {}",
            requested.collect::<Vec<_>>().join(", ")
        ));
        std::process::exit(1);
    }
    target_dirs
}

/// Splits a comma-separated `--packages`/`--modules` argument into trimmed,
/// non-empty names.
fn split_names(value: Option<&str>) -> Vec<String> {
    value
        .map(|v| {
            v.split(',')
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

/// Builds a release plan for every target directory that has unreleased
/// commits: reads its `package.json`, computes the semver bump from the
/// commits since its last tag, and stages the new version in memory. The
/// bump starts from the version npm has published, so the next number
/// follows it, unless a git tag is already newer — then it starts there, so
/// the release does not try to create that tag again. `force_patch` plans
/// every target as a patch bump, including ones with no unreleased commits.
fn build_release_plans(
    cwd: &Path,
    target_dirs: &[TargetDir],
    force_patch: bool,
) -> Vec<ReleasePlan> {
    let mut plans = Vec::new();
    for dir in target_dirs.iter().cloned() {
        let full_dir = cwd.join(&dir.base);
        let package_json_path = full_dir.join("package.json");
        let Ok(raw) = fs::read_to_string(&package_json_path) else {
            continue;
        };
        let Ok(mut package_json) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let Some(package_name) = package_json
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let Some(version) = package_json
            .get("version")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        let last_tag = get_last_tag(cwd, &package_name);
        let commits = get_commits_since_tag(cwd, last_tag.as_deref(), &dir.base);
        if commits.is_empty() && !force_patch {
            continue;
        }
        let bump_type = if force_patch {
            "patch"
        } else {
            determine_bump_type(&commits)
        };
        let cargo_toml_path = full_dir.join("Cargo.toml");
        let cargo_toml_path = cargo_toml_path.is_file().then_some(cargo_toml_path);
        // A Rust module is released from its own manifest. npm is not a
        // source of its version and it is not published there.
        let published = if cargo_toml_path.is_some() {
            None
        } else {
            match npm_publish::published_version(&package_name, None) {
                Ok(published) => published,
                Err(message) => {
                    crate::utils::error(message);
                    std::process::exit(1);
                }
            }
        };
        let tagged = last_tag
            .as_deref()
            .and_then(|tag| version_from_tag(tag, &package_name));
        let base = release_base(&version, published.as_deref(), tagged).to_string();
        if let Some(published) = published.as_deref()
            && published != version
        {
            println!("{package_name} is {published} on npm");
        }
        let new_version = bump_version(&base, bump_type);
        if let Some(root) = package_json.as_object_mut() {
            root.insert("version".to_string(), Value::String(new_version.clone()));
        }
        let tag = format!("{package_name}@{new_version}");
        plans.push(ReleasePlan {
            dir,
            full_dir,
            package_json_path,
            package_json,
            cargo_toml_path,
            commits,
            bump_type,
            new_version,
            tag,
        });
    }
    plans
}

/// Writes each plan's `package.json`/changelog/`Cargo.toml`, commits and tags
/// it, then returns the released package/module base names (Rust crates are
/// excluded since they are not published to npm). Exits the process if a
/// commit or tag fails, since a partial release must not continue silently.
fn commit_and_tag_plans(
    cwd: &Path,
    plans: &[ReleasePlan],
    repo_url: Option<&str>,
) -> (Vec<String>, Vec<String>) {
    let mut released_packages = Vec::new();
    let mut released_modules = Vec::new();
    for plan in plans {
        apply_release_plan(cwd, plan, repo_url);

        let base_name = base_name(&plan.dir.base);
        if plan.cargo_toml_path.is_some() {
            continue;
        }
        if plan.dir.kind == "package" {
            released_packages.push(base_name);
        } else {
            released_modules.push(base_name);
        }
    }
    (released_packages, released_modules)
}

/// Writes one plan's `package.json`/changelog/`Cargo.toml`, then commits and
/// tags it. Exits the process on failure.
fn apply_release_plan(cwd: &Path, plan: &ReleasePlan, repo_url: Option<&str>) {
    let _ = fs::write(
        &plan.package_json_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&plan.package_json).unwrap_or_default()
        ),
    );
    update_changelog(
        &plan.full_dir,
        &plan.new_version,
        &plan.tag,
        &plan.commits,
        repo_url,
    );
    let is_rust = plan.cargo_toml_path.is_some();
    if let Some(cargo_toml_path) = &plan.cargo_toml_path {
        update_cargo_version(cargo_toml_path, &plan.new_version);
        refresh_cargo_lock(&plan.full_dir);
    }

    let name = plan
        .package_json
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let message = format!("chore(release): {name}@{}", plan.new_version);
    let mut add_paths = vec![
        "add".to_string(),
        format!("{}/package.json", plan.dir.base),
        format!("{}/CHANGELOG.md", plan.dir.base),
    ];
    if is_rust {
        add_paths.push(format!("{}/Cargo.toml", plan.dir.base));
    }
    let add_refs: Vec<&str> = add_paths.iter().map(String::as_str).collect();
    if !git(cwd, &add_refs)
        || !git(cwd, &["commit", "--no-verify", "-m", &message])
        || !git(cwd, &["tag", "-a", &plan.tag, "-m", &message])
    {
        crate::utils::error(format!("Failed to release {name}"));
        std::process::exit(1);
    }
    crate::utils::success(format!(
        "{name} released ({} bump, {} commit(s))",
        plan.bump_type,
        plan.commits.len()
    ));
}

/// Rewrites the crate's `Cargo.lock` so its own version entry matches the
/// freshly bumped `Cargo.toml`. Runs offline first since only the workspace
/// member changed, and falls back to a networked update if the registry cache
/// is missing an entry.
fn refresh_cargo_lock(crate_dir: &Path) {
    if !crate_dir.join("Cargo.lock").is_file() {
        return;
    }
    let updated = Command::new("cargo")
        .args(["update", "--workspace", "--offline"])
        .current_dir(crate_dir)
        .output()
        .is_ok_and(|output| output.status.success());
    if !updated {
        let _ = Command::new("cargo")
            .args(["update", "--workspace"])
            .current_dir(crate_dir)
            .output();
    }
}

/// An `https://` origin needs a credential helper to push non-interactively.
/// `gh auth setup-git` wires git to the CLI's stored token for that. An
/// `ssh://` or `git@` origin already authenticates with the user's SSH key.
fn ensure_https_push_auth(cwd: &Path) {
    if crate::utils::git_origin_url(cwd).is_some_and(|url| url.starts_with("https://")) {
        let _ = Command::new("gh")
            .args(["auth", "setup-git"])
            .current_dir(cwd)
            .status();
    }
}

/// Refreshes `bun.lock`, commits it along with any refreshed `Cargo.lock`, and
/// pushes the release commits and tags to the remote.
fn push_to_remote(cwd: &Path) {
    let _ = run_spinner_step(
        false,
        "Refreshing bun.lock",
        Command::new("bun").arg("install").current_dir(cwd),
    );
    let _ = git(cwd, &["add", "bun.lock"]);
    let _ = git(cwd, &["commit", "-m", "chore(common): Update bun.lock"]);
    let _ = git(cwd, &["add", "--", "*Cargo.lock"]);
    let _ = git(cwd, &["commit", "-m", "chore(common): Update Cargo.lock"]);

    ensure_https_push_auth(cwd);

    let pushed = git(cwd, &["push"]) && git(cwd, &["push", "--tags"]);
    if !pushed {
        crate::utils::error("Failed to push to remote");
    }
}
