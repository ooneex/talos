//! Crons check — the schedule a job claims against the one it will get.
//!
//! `getTime()` returns a sentence — `"every 5 minutes"` — that the framework
//! converts into a crontab expression at boot. The type says
//! `` `${prefix} ${number} ${suffix}` ``, which a template literal type is happy to
//! satisfy with `"every 90 minutes"`; the conversion then emits `*/90 * * * *`,
//! a field that no crontab parser accepts. The failure is at startup, in a
//! string nobody reads.

use std::collections::BTreeMap;
use std::path::Path;

use super::artifacts::{self, Artifact, is_backend};
use super::modules::{discover_modules, filter_modules, wanted_names};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// The units a schedule can be expressed in, with the largest value the crontab
/// field they map onto can hold.
const UNITS: [(&str, u64); 6] = [
    ("seconds", 59),
    ("minutes", 59),
    ("hours", 23),
    ("days", 31),
    ("months", 12),
    ("years", 1),
];

/// One cron job, reduced to the schedule it claims.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Schedule {
    pub class: String,
    /// The sentence `getTime()` returns, when it returns a literal one.
    pub time: Option<String>,
    pub handles: bool,
    pub file: String,
}

/// Read a cron class.
pub fn parse(cron: &Artifact) -> Schedule {
    Schedule {
        class: cron.class.clone(),
        time: artifacts::returned_string(&cron.content, "getTime"),
        handles: artifacts::method_body(&cron.content, "handler")
            .map(|body| !artifacts::is_empty_body(body))
            .unwrap_or(false),
        file: cron.file.clone(),
    }
}

/// Why a schedule will not convert, or what it will silently become.
///
/// Returns `Err` for a sentence the conversion rejects outright and `Ok(Some)`
/// for one it accepts and then does something other than what it says.
pub fn validate(time: &str) -> Result<Option<String>, String> {
    let parts: Vec<&str> = time.split_whitespace().collect();
    let [prefix, value, unit] = parts.as_slice() else {
        return Err(format!("\"{time}\" is not `<in|every> <number> <unit>`"));
    };

    if !matches!(*prefix, "in" | "every") {
        return Err(format!(
            "\"{time}\" starts with \"{prefix}\" rather than `in` or `every`"
        ));
    }

    let Ok(amount) = value.parse::<u64>() else {
        return Err(format!("\"{time}\" does not carry a number"));
    };
    if amount == 0 {
        return Err(format!("\"{time}\" repeats zero times"));
    }

    let Some((_, ceiling)) = UNITS.iter().find(|(name, _)| name == unit) else {
        return Err(format!(
            "\"{time}\" uses the unit \"{unit}\", which is not one of {}",
            UNITS
                .iter()
                .map(|(name, _)| *name)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    };

    // A one-off `in …` is turned into a single future date rather than a step,
    // so no crontab field has to hold the value.
    if *prefix == "in" {
        return Ok(None);
    }

    if *unit == "years" && amount > 1 {
        return Ok(Some(format!(
            "\"{time}\" runs once a year — the interval is ignored for years"
        )));
    }
    if amount > *ceiling {
        return Err(format!(
            "\"{time}\" becomes `*/{amount}` in a field that only holds {ceiling}"
        ));
    }

    Ok(None)
}

/// Everything about a set of cron jobs that will not do what it says.
pub fn inspect(schedules: &[Schedule], errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    let mut times: BTreeMap<&str, &str> = BTreeMap::new();

    for schedule in schedules {
        let file = &schedule.file;

        let Some(time) = schedule.time.as_deref() else {
            errors.push(format!(
                "{file}: `{}` returns no literal schedule from getTime()",
                schedule.class
            ));
            continue;
        };

        match validate(time) {
            Err(message) => errors.push(format!("{file}: {message}")),
            Ok(Some(message)) => warnings.push(format!("{file}: {message}")),
            Ok(None) => {}
        }

        if !schedule.handles {
            warnings.push(format!(
                "{file}: `{}` is scheduled \"{time}\" and its handler does nothing",
                schedule.class
            ));
        }

        // Jobs firing on the same tick contend for the same connections and the
        // same database. Staggering them is a one-word change.
        if let Some(owner) = times.get(time) {
            warnings.push(format!(
                "{file}: `{}` runs \"{time}\", the same tick as {owner}",
                schedule.class
            ));
        } else {
            times.insert(time, file);
        }
    }
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules: Vec<_> = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    )
    .into_iter()
    .filter(is_backend)
    .collect();

    let crons = artifacts::collect(root, &modules, &["cron"]);
    if crons.is_empty() {
        return CheckOutcome::new(CheckId::Crons, CheckStatus::Skipped, "no cron job found");
    }

    let schedules: Vec<Schedule> = crons.iter().map(parse).collect();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    inspect(&schedules, &mut errors, &mut warnings);

    let scope = format!(
        "{} cron job{}",
        crons.len(),
        if crons.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Crons,
        &scope,
        "every schedule converts to a crontab expression",
        errors,
        warnings,
    )
    .with_hint("A schedule reads `<in|every> <number> <seconds|minutes|hours|days|months|years>`")
}
