// Migrations check — the ordering guarantees a schema history depends on.
//
// Migrations run in timestamp order across every module, so two files sharing
// a timestamp have an undefined order, and a migration without a `down` cannot
// be rolled back.
//
// A module lays them out the way `talos migration:create` writes them:
//
//   modules/<name>/src/migrations/Migration<version>.ts   the class, with the
//                                                         `up`/`down` SQL
//   modules/<name>/src/migrations/migrations.ts           the export index
//   modules/<name>/bin/migration/up.ts                    applies them
//   modules/<name>/bin/migration/down.ts                  rolls them back
//
// Only the first holds migration classes. The index re-exports them so they
// register, and the two `bin/migration` scripts are the module's entry points —
// they import the index and hand it to `up()`/`down()` from `@talosjs/migrations`.
// Each of the three is checked as what it is.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use super::modules::{collect_files, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// File stem of the export index that sits beside the migrations.
const INDEX_STEM: &str = "migrations";

/// The version a migration file name carries. The generator writes
/// `Migration<version>.ts` and older files are named `<version>-<slug>.ts`, so
/// the version is the first run of digits long enough to be one: a millisecond
/// epoch, or a hand-written `YYYYMMDD` that sorts just as well.
pub fn timestamp(stem: &str) -> Option<u64> {
    stem.split(|character: char| !character.is_ascii_digit())
        .find(|run| run.len() >= 8)
        .and_then(|run| run.parse().ok())
}

/// Whether a migration body declares both directions.
pub fn directions(content: &str) -> (bool, bool) {
    (
        content.contains("up(") || content.contains("up ("),
        content.contains("down(") || content.contains("down ("),
    )
}

/// The export index re-exports every migration beside it, which is what
/// registers them. One the index never names is never registered, so it never
/// runs. A module that imports its migrations by path ships no index at all —
/// a missing one is a layout choice, not a fault, so only an index that exists
/// is held to this.
fn check_index(root: &Path, migrations_dir: &Path, stems: &[String], errors: &mut Vec<String>) {
    let index = migrations_dir.join(format!("{INDEX_STEM}.ts"));
    let Ok(content) = fs::read_to_string(&index) else {
        return;
    };
    let label = relative(root, &index);

    for stem in stems.iter().filter(|stem| !content.contains(stem.as_str())) {
        errors.push(format!(
            "{label} does not export {stem} — the migration is never registered, so it never runs"
        ));
    }
}

/// The scripts that run a module's migrations. These, not the migration
/// classes, are where a module's `up` and `down` entry points live: each
/// imports the module's migrations and hands them to `up()` or `down()`.
fn check_runners(root: &Path, module_dir: &Path, warnings: &mut Vec<String>) {
    let bin = module_dir.join("bin").join("migration");

    for (direction, consequence) in [
        ("up", "its migrations cannot be applied"),
        ("down", "its migrations cannot be rolled back"),
    ] {
        let path = bin.join(format!("{direction}.ts"));
        let label = relative(root, &path);
        match fs::read_to_string(&path) {
            Ok(content) if content.contains(&format!("{direction}(")) => {}
            Ok(_) => warnings.push(format!(
                "{label} never calls `{direction}()` — {consequence}"
            )),
            Err(_) => warnings.push(format!("{label} is missing — {consequence}")),
        }
    }
}

/// Checks one module's migrations — timestamp collisions and missing
/// `up`/`down` methods — then the index that registers them and the scripts
/// that run them. Returns the number of migrations inspected, the index and
/// the runners excluded: neither is one.
fn check_module_migrations(
    root: &Path,
    module_dir: &Path,
    seen: &mut BTreeMap<u64, String>,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> usize {
    let migrations_dir = module_dir.join("src").join("migrations");
    let mut stems = Vec::new();

    for path in collect_files(&migrations_dir, &["ts"], 3) {
        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        // The index is a barrel of re-exports, checked as one further down.
        if stem == INDEX_STEM {
            continue;
        }
        let label = relative(root, &path);
        stems.push(stem.to_string());

        match timestamp(stem) {
            Some(value) => {
                if let Some(existing) = seen.get(&value) {
                    errors.push(format!(
                        "{label} shares its timestamp with {existing} — the run order is undefined"
                    ));
                } else {
                    seen.insert(value, label.clone());
                }
            }
            None => warnings.push(format!(
                "{label} carries no timestamp — it will not sort with the others"
            )),
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let (up, down) = directions(&content);
        if !up {
            errors.push(format!("{label} has no `up` method"));
        }
        if !down {
            warnings.push(format!(
                "{label} has no `down` method — it cannot be rolled back"
            ));
        }
    }

    if stems.is_empty() {
        return 0;
    }
    check_index(root, &migrations_dir, &stems, errors);
    check_runners(root, module_dir, warnings);
    stems.len()
}

/// Checks every seed file in one module is valid YAML; returns the count
/// inspected.
fn check_module_seeds(root: &Path, module_dir: &Path, errors: &mut Vec<String>) -> usize {
    let mut seeds = 0;
    for path in collect_files(&module_dir.join("src").join("seeds"), &["yml", "yaml"], 3) {
        seeds += 1;
        let label = relative(root, &path);
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if let Err(error) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
            errors.push(format!("{label} is not valid YAML: {error}"));
        }
    }
    seeds
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut seen: BTreeMap<u64, String> = BTreeMap::new();
    let mut counted = 0;
    let mut seeds = 0;

    for module in &modules {
        counted +=
            check_module_migrations(root, &module.dir, &mut seen, &mut errors, &mut warnings);
        seeds += check_module_seeds(root, &module.dir, &mut errors);
    }

    if counted == 0 && seeds == 0 {
        return CheckOutcome::new(
            CheckId::Migrations,
            CheckStatus::Skipped,
            "no migrations or seeds in the workspace",
        );
    }

    let scope = format!(
        "{counted} migration{}, {seeds} seed{}",
        if counted == 1 { "" } else { "s" },
        if seeds == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Migrations,
        &scope,
        "timestamps are unique, every migration is registered and reversible",
        errors,
        warnings,
    )
    .with_hint(
        "`talos migration:create --module <name>` stamps a fresh, ordered file, re-exports it from the index and writes the `bin/migration` scripts",
    )
}
