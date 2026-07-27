//! Migrations check — the ordering guarantees a schema history depends on.
//!
//! Migrations run in timestamp order across every module, so two files sharing
//! a timestamp have an undefined order, and a migration without a `down` cannot
//! be rolled back.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use super::modules::{collect_files, discover_modules, filter_modules, relative, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The leading timestamp of a generated migration file name.
pub fn timestamp(stem: &str) -> Option<u64> {
    let digits: String = stem.chars().take_while(char::is_ascii_digit).collect();
    // Generated names lead with a millisecond epoch; a hand-written `YYYYMMDD`
    // prefix sorts just as well, so eight digits is the floor.
    if digits.len() < 8 {
        return None;
    }
    digits.parse().ok()
}

/// Whether a migration body declares both directions.
pub fn directions(content: &str) -> (bool, bool) {
    (
        content.contains("up(") || content.contains("up ("),
        content.contains("down(") || content.contains("down ("),
    )
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
        for path in collect_files(&module.dir.join("src").join("migrations"), &["ts"], 3) {
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            let label = relative(root, &path);
            counted += 1;

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
                    "{label} does not start with a timestamp — it will not sort with the others"
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

        for path in collect_files(&module.dir.join("src").join("seeds"), &["yml", "yaml"], 3) {
            seeds += 1;
            let label = relative(root, &path);
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            if let Err(error) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                errors.push(format!("{label} is not valid YAML: {error}"));
            }
        }
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
        "timestamps are unique and every migration is reversible",
        errors,
        warnings,
    )
    .with_hint("`talos migration:create --module <name>` stamps a fresh, ordered file")
}
