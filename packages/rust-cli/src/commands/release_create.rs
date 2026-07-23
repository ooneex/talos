use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use serde_json::Value;

use crate::commands::npm_publish::{self, NpmPublishArgs};
use crate::utils::ask_confirm;

#[derive(Clone)]
struct TargetDir {
    base: String,
    kind: String,
}

#[derive(Clone)]
struct CommitInfo {
    hash: String,
    r#type: String,
    subject: String,
    author: String,
    breaking: bool,
}

#[derive(Clone)]
struct ReleasePlan {
    dir: TargetDir,
    full_dir: PathBuf,
    package_json_path: PathBuf,
    package_json: Value,
    commits: Vec<CommitInfo>,
    bump_type: &'static str,
    new_version: String,
    tag: String,
}

/// Rust port of `packages/cli/src/commands/ReleaseCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct ReleaseCreateArgs {
    /// Comma-separated module names.
    #[arg(long)]
    pub modules: Option<String>,

    /// Comma-separated package names.
    #[arg(long)]
    pub packages: Option<String>,

    /// Publish released packages to npm after tagging.
    #[arg(long, default_value_t = false)]
    pub publish: bool,

    /// Working directory (defaults to the current directory).
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
    // Mirrors `git --no-pager status --porcelain`: any tracked or untracked
    // (non-ignored) change makes the working tree dirty.
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

fn determine_bump_type(commits: &[CommitInfo]) -> &'static str {
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

fn bump_version(version: &str, kind: &str) -> String {
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

fn get_repo_url(cwd: &Path) -> Option<String> {
    // Mirrors `git remote get-url origin`, then reshapes it into an HTTPS
    // browse URL the same way the original TypeScript/git CLI version did.
    crate::utils::git_origin_url(cwd).map(|url| {
        url.trim()
            .trim_end_matches(".git")
            .replace("git@", "https://")
            .replace(':', "/")
    })
}

fn update_changelog(
    dir: &Path,
    version: &str,
    tag: &str,
    commits: &[CommitInfo],
    repo_url: Option<&str>,
) {
    let changelog_path = dir.join("CHANGELOG.md");
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let mut groups: std::collections::BTreeMap<&str, Vec<&CommitInfo>> =
        std::collections::BTreeMap::new();
    let category = |ty: &str| match ty {
        "feat" => "Added",
        "fix" => "Fixed",
        "revert" => "Removed",
        _ => "Changed",
    };
    for commit in commits {
        groups
            .entry(category(&commit.r#type))
            .or_default()
            .push(commit);
    }
    let version_link = repo_url
        .map(|repo| format!("[{version}]({repo}/releases/tag/{tag})"))
        .unwrap_or_else(|| format!("[{version}]"));
    let mut section = format!("## {version_link} - {today}\n");
    for cat in [
        "Added",
        "Changed",
        "Deprecated",
        "Removed",
        "Fixed",
        "Security",
    ] {
        if let Some(list) = groups.get(cat) {
            if list.is_empty() {
                continue;
            }
            section.push_str(&format!("\n### {cat}\n\n"));
            for commit in list {
                let link = repo_url
                    .map(|repo| format!(" ([{}]({repo}/commit/{}))", commit.hash, commit.hash))
                    .unwrap_or_default();
                section.push_str(&format!(
                    "- {} — {}{}\n",
                    commit.subject, commit.author, link
                ));
            }
        }
    }
    let existing = fs::read_to_string(&changelog_path).unwrap_or_default();
    let new_content = if existing.is_empty() {
        format!("# Changelog\n\n{section}\n")
    } else if let Some(index) = existing.find("## [Unreleased]") {
        let end = existing[index..]
            .find('\n')
            .map(|n| index + n + 1)
            .unwrap_or(existing.len());
        format!("{}\n{}\n{}", &existing[..end], section, &existing[end..])
    } else {
        format!("{}\n\n{}\n", existing.trim_end(), section)
    };
    let _ = fs::write(changelog_path, new_content);
}

fn git(cwd: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn run(args: &ReleaseCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    if has_pending_changes(&cwd) {
        eprintln!("✖ Working tree has pending changes. Commit or stash them before releasing");
        std::process::exit(1);
    }
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
        eprintln!("✖ No packages or modules found");
        std::process::exit(1);
    }
    let package_names = args
        .packages
        .as_deref()
        .map(|v| {
            v.split(',')
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let module_names = args
        .modules
        .as_deref()
        .map(|v| {
            v.split(',')
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let target_dirs: Vec<TargetDir> = if package_names.is_empty() && module_names.is_empty() {
        dirs.clone()
    } else {
        dirs.into_iter()
            .filter(|dir| {
                (dir.kind == "package"
                    && package_names.contains(
                        &Path::new(&dir.base)
                            .file_name()
                            .unwrap()
                            .to_string_lossy()
                            .to_string(),
                    ))
                    || (dir.kind == "module"
                        && module_names.contains(
                            &Path::new(&dir.base)
                                .file_name()
                                .unwrap()
                                .to_string_lossy()
                                .to_string(),
                        ))
            })
            .collect()
    };
    if target_dirs.is_empty() {
        eprintln!("✖ No requested packages or modules found");
        std::process::exit(1);
    }
    let repo_url = get_repo_url(&cwd);
    let mut plans = Vec::new();
    for dir in target_dirs {
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
        let last_tag = get_last_tag(&cwd, &package_name);
        let commits = get_commits_since_tag(&cwd, last_tag.as_deref(), &dir.base);
        if commits.is_empty() {
            continue;
        }
        let bump_type = determine_bump_type(&commits);
        let new_version = bump_version(&version, bump_type);
        if let Some(root) = package_json.as_object_mut() {
            root.insert("version".to_string(), Value::String(new_version.clone()));
        }
        let tag = format!("{package_name}@{new_version}");
        plans.push(ReleasePlan {
            dir,
            full_dir,
            package_json_path,
            package_json,
            commits,
            bump_type,
            new_version,
            tag,
        });
    }
    if plans.is_empty() {
        println!("No packages have unreleased commits");
        return;
    }
    let mut released_packages = Vec::new();
    let mut released_modules = Vec::new();
    for plan in &plans {
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
            repo_url.as_deref(),
        );
        if !git(
            &cwd,
            &[
                "add",
                &format!("{}/package.json", plan.dir.base),
                &format!("{}/CHANGELOG.md", plan.dir.base),
            ],
        ) || !git(
            &cwd,
            &[
                "commit",
                "--no-verify",
                "-m",
                &format!(
                    "chore(release): {}@{}",
                    plan.package_json
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                    plan.new_version
                ),
            ],
        ) || !git(
            &cwd,
            &[
                "tag",
                "-a",
                &plan.tag,
                "-m",
                &format!(
                    "chore(release): {}@{}",
                    plan.package_json
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default(),
                    plan.new_version
                ),
            ],
        ) {
            eprintln!(
                "✖ Failed to release {}",
                plan.package_json
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
            );
            std::process::exit(1);
        }
        println!(
            "✔ {} released ({} bump, {} commit(s))",
            plan.package_json
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            plan.bump_type,
            plan.commits.len()
        );
        let base_name = Path::new(&plan.dir.base)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        if plan.dir.kind == "package" {
            released_packages.push(base_name);
        } else {
            released_modules.push(base_name);
        }
    }
    println!("✔ {} package(s) released", plans.len());
    if ask_confirm("Push commits and tags to remote?", true) {
        let _ = Command::new("bun")
            .arg("install")
            .current_dir(&cwd)
            .status();
        let _ = git(&cwd, &["add", "bun.lock"]);
        let _ = git(&cwd, &["commit", "-m", "chore(common): Update bun.lock"]);
        let pushed = git(&cwd, &["push"]) && git(&cwd, &["push", "--tags"]);
        if !pushed {
            eprintln!("✖ Failed to push to remote");
        }
    }
    if args.publish {
        npm_publish::run(&NpmPublishArgs {
            packages: (!released_packages.is_empty()).then(|| released_packages.join(",")),
            modules: (!released_modules.is_empty()).then(|| released_modules.join(",")),
            access: "public".to_string(),
            silent: false,
            cwd: Some(cwd.to_string_lossy().to_string()),
        });
    }
}
