//! Top-level orchestration: dispatching one check, the progress display
//! shown while checks run concurrently, the fingerprint cache that lets an
//! untouched tree skip a check entirely, and the `execute`/`run` entry
//! points that tie the whole command together.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use console::style;
use rayon::prelude::*;

use crate::utils::{Loader, LoaderGroup, Spinner, current_dir, error};

use super::CheckOutcome;
use super::modules;
use super::types::{Category, CheckId};
use super::{
    ProjectCheckArgs, ProjectReport,
    accessibility::check_accessibility,
    assets, asynchrony, boundaries, branches, bundle, cache,
    commits::check_commits,
    complexity, container, contrast, conventions, crons, dependencies, docker, docs, duplication,
    e2e_coverage, entities, env, events, exceptions, flags, folders, git, harden, health,
    hygiene::check_hygiene,
    imports, indexes, lockfile, logging, mailers, middlewares, migrations, openapi, orphans,
    outdated, pagination, permissions, queries, queues, registration,
    render::{render_json, render_report},
    repositories, restricted, roles, router, routes, sdk, secrets,
    security_issues::{check_issues, check_security},
    select_checks, sql, stories, structure, tests, todos, tokens, transactions, translations,
    tsconfig, validation, workflows,
    workspace::{check_coverage, check_e2e, check_workspace},
};

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/// How far along the run is, one row per category.
///
/// With the checks running at once there is no longer a place to print a header
/// before each and a verdict after it — they would interleave into noise. The
/// shared [`Loader`] draws the categories the report is grouped under, in the
/// same order, so the wait is read the same way the result will be.
struct Progress {
    loader: Loader,
    /// Where each category sits in the loader — only the categories the run
    /// actually selected get a row.
    rows: BTreeMap<Category, usize>,
    /// Whether stdout is being held for a report, and so carries nothing else.
    quiet: bool,
}

impl Progress {
    fn start(checks: &[CheckId], quiet: bool) -> Self {
        let mut rows = BTreeMap::new();
        let mut groups = Vec::new();
        for category in Category::ALL {
            let total = checks.iter().filter(|id| id.category() == category).count();
            if total == 0 {
                continue;
            }
            rows.insert(category, groups.len());
            groups.push(LoaderGroup::new(category.title(), total));
        }

        Self {
            // In `--json` mode stdout holds the report and nothing may be
            // written beside it.
            loader: if quiet {
                Loader::hidden()
            } else {
                Loader::start(groups)
            },
            rows,
            quiet,
        }
    }

    /// The row a check reports into.
    fn row(&self, id: CheckId) -> usize {
        self.rows.get(&id.category()).copied().unwrap_or_default()
    }

    /// A check that owns the terminal announces itself the old way.
    ///
    /// It keeps the terminal until [`released`](Self::released): the workspace
    /// and end-to-end checks hand off to `monorepo:run`, which draws a live
    /// display of its own that the loader would otherwise overwrite.
    fn announce(&self, id: CheckId) {
        self.loader.pause();
        if self.quiet {
            return;
        }
        println!(
            "{}{}",
            style(format!("▸ {}", id.title())).cyan().bold(),
            style(format!("  {}", id.description())).dim()
        );
    }

    /// The announced check is done — take the line back.
    fn released(&self) {
        self.loader.resume();
    }

    fn entered(&self, id: CheckId) {
        self.loader.entered(self.row(id), id.key());
    }

    fn left(&self, id: CheckId) {
        self.loader.left(self.row(id), id.key());
    }

    /// A check that ran with the terminal to itself, so it was never drawn as
    /// running — only counted.
    fn completed(&self, id: CheckId) {
        self.loader.advance(self.row(id));
    }

    /// Consume the progress rows. The loader's `Drop` is what actually tears
    /// them down, so a panic mid-run still restores the cursor.
    fn stop(self) {}
}

/// Run one check, whatever it takes to run it.
fn dispatch(args: &ProjectCheckArgs, root: &Path, id: CheckId) -> CheckOutcome {
    match id {
        CheckId::Workspace => check_workspace(args, root),
        CheckId::Structure => structure::run(args, root),
        CheckId::Folders => folders::run(args, root),
        CheckId::Tsconfig => tsconfig::run(args, root),
        CheckId::Lockfile => lockfile::run(args, root),
        CheckId::Conventions => conventions::run(args, root),
        CheckId::Imports => imports::run(args, root),
        CheckId::Boundaries => boundaries::run(args, root),
        CheckId::Restricted => restricted::run(args, root),
        CheckId::Container => container::run(args, root),
        CheckId::Registration => registration::run(args, root),
        CheckId::Middlewares => middlewares::run(args, root),
        CheckId::Routes => routes::run(args, root),
        CheckId::Openapi => openapi::run(args, root),
        CheckId::Health => health::run(args, root),
        CheckId::Pagination => pagination::run(args, root),
        CheckId::Validation => validation::run(args, root),
        CheckId::Roles => roles::run(args, root),
        CheckId::Permissions => permissions::run(args, root),
        CheckId::Entities => entities::run(args, root),
        CheckId::Indexes => indexes::run(args, root),
        CheckId::Repositories => repositories::run(args, root),
        CheckId::Transactions => transactions::run(args, root),
        CheckId::Sql => sql::run(args, root),
        CheckId::Async => asynchrony::run(args, root),
        CheckId::Exceptions => exceptions::run(args, root),
        CheckId::Logging => logging::run(args, root),
        CheckId::Complexity => complexity::run(args, root),
        CheckId::Duplication => duplication::run(args, root),
        CheckId::Orphans => orphans::run(args, root),
        CheckId::Events => events::run(args, root),
        CheckId::Queues => queues::run(args, root),
        CheckId::Crons => crons::run(args, root),
        CheckId::Workflows => workflows::run(args, root),
        CheckId::Mailers => mailers::run(args, root),
        CheckId::Flags => flags::run(args, root),
        CheckId::Env => env::run(args, root),
        CheckId::Dependencies => dependencies::run(args, root),
        CheckId::Outdated => outdated::run(args, root),
        CheckId::Docker => docker::run(args, root),
        CheckId::Migrations => migrations::run(args, root),
        CheckId::Accessibility => check_accessibility(args, root),
        CheckId::Contrast => contrast::run(args, root),
        CheckId::Tokens => tokens::run(args, root),
        CheckId::Assets => assets::run(args, root),
        CheckId::Translations => translations::run(args, root),
        CheckId::Stories => stories::run(args, root),
        CheckId::Router => router::run(args, root),
        CheckId::Queries => queries::run(args, root),
        CheckId::Sdk => sdk::run(args, root),
        CheckId::Tests => tests::run(args, root),
        CheckId::Coverage => check_coverage(args, root),
        CheckId::E2eCoverage => e2e_coverage::run(args, root),
        CheckId::Docs => docs::run(args, root),
        CheckId::Bundle => bundle::run(args, root),
        CheckId::Security => check_security(args, root),
        CheckId::Secrets => secrets::run(args, root),
        CheckId::Git => git::run(args, root),
        CheckId::Issues => check_issues(args, root),
        CheckId::Todos => todos::run(args, root),
        CheckId::Branches => branches::run(args, root),
        CheckId::Commits => check_commits(root),
        CheckId::Hygiene => check_hygiene(root),
        CheckId::E2e => check_e2e(args, root),
    }
}

/// Run a check, timing it, and reuse the cached outcome when the tree it was
/// produced from has not moved.
fn run_check(
    args: &ProjectCheckArgs,
    root: &Path,
    id: CheckId,
    cache: Option<&(String, cache::Fingerprints)>,
) -> CheckOutcome {
    let cache = cache.filter(|_| id.cacheable());

    if let Some((options, fingerprints)) = cache
        && let Some(entry) = cache::read(root, id)
        && entry.matches(options, id.reads(), fingerprints)
        && let Some(outcome) = entry.outcome(id)
    {
        return outcome;
    }

    let started_at = Instant::now();
    let mut outcome = dispatch(args, root, id);
    outcome.duration_ms = started_at.elapsed().as_millis() as u64;

    if let Some((options, fingerprints)) = cache {
        cache::write(root, id, options, fingerprints, &outcome);
    }
    outcome
}

/// Run every selected check and collect the report. Never exits the process.
///
/// The reads all happen at once: every check but the workspace gate and the
/// end-to-end suite only looks at files, so there is nothing to serialise them
/// for. Those two do run alone — the first because its install is what puts the
/// tools the others shell out to on disk, the last because it boots the
/// application — which is also the order they were already in.
pub fn execute(args: &ProjectCheckArgs, checks: &[CheckId]) -> ProjectReport {
    let root = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let started_at = Instant::now();

    let hashes = load_file_hashes(args, checks, &root);
    let cache = build_fingerprint_cache(args, &root, hashes.as_ref());

    let mut outcomes: Vec<Option<CheckOutcome>> = vec![None; checks.len()];
    let progress = Progress::start(checks, args.json);

    // The workspace gate first, on its own and with the terminal to itself,
    // then the suites it built — `monorepo:check`, in the order it runs.
    run_serial_group(
        args,
        &root,
        checks,
        &progress,
        cache.as_ref(),
        &mut outcomes,
        &[CheckId::Workspace, CheckId::Coverage],
    );

    run_concurrent_checks(
        args,
        &root,
        checks,
        &progress,
        cache.as_ref(),
        &mut outcomes,
    );

    // The end-to-end suite last: it needs the build the workspace produced.
    run_serial_group(
        args,
        &root,
        checks,
        &progress,
        cache.as_ref(),
        &mut outcomes,
        &[CheckId::E2e],
    );

    progress.stop();
    if let Some(hashes) = hashes.as_ref() {
        hashes.save();
    }

    // After the cache write, never before: an entry records what a check found,
    // and `--strict` only decides how loudly this run reports it.
    let outcomes = outcomes.into_iter().flatten();

    ProjectReport {
        root: root.to_string_lossy().to_string(),
        outcomes: if args.strict {
            outcomes.map(harden).collect()
        } else {
            outcomes.collect()
        },
        duration_ms: started_at.elapsed().as_millis() as u64,
    }
}

/// Loads the workspace file hashes used for fingerprinting, but only when
/// something in the run can actually be served from a cache entry — the
/// walk is not worth its own cost otherwise.
fn load_file_hashes(
    args: &ProjectCheckArgs,
    checks: &[CheckId],
    root: &Path,
) -> Option<cache::FileHashes> {
    (!args.no_cache && checks.iter().any(|id| id.cacheable()))
        .then(|| cache::FileHashes::load(root))
}

/// Builds the per-module fingerprint cache from the loaded file hashes, if
/// any. The walk is the one stretch before the loader where nothing is
/// printed, so it gets a spinner of its own.
fn build_fingerprint_cache(
    args: &ProjectCheckArgs,
    root: &Path,
    hashes: Option<&cache::FileHashes>,
) -> Option<(String, cache::Fingerprints)> {
    let spinner =
        (hashes.is_some() && !args.json).then(|| Spinner::start("Fingerprinting the workspace..."));
    let cache = hashes.map(|hashes| {
        let modules = modules::filter_modules(
            modules::discover_modules(root),
            &modules::wanted_names(args.modules.as_deref(), args.packages.as_deref()),
        );
        (
            cache::options_key(args),
            cache::Fingerprints::build(root, &modules, hashes),
        )
    });
    drop(spinner);
    cache
}

/// Runs the checks matching `ids`, in order, one at a time, announcing and
/// releasing progress around each — used for the checks that must run alone
/// (the workspace gate first, the end-to-end suite last).
#[allow(clippy::too_many_arguments)]
fn run_serial_group(
    args: &ProjectCheckArgs,
    root: &Path,
    checks: &[CheckId],
    progress: &Progress,
    cache: Option<&(String, cache::Fingerprints)>,
    outcomes: &mut [Option<CheckOutcome>],
    ids: &[CheckId],
) {
    for id in ids {
        for (index, each) in checks.iter().enumerate().filter(|(_, each)| *each == id) {
            progress.announce(*each);
            outcomes[index] = Some(run_check(args, root, *each, cache));
            progress.completed(*each);
            progress.released();
        }
    }
}

/// Runs every check that is not marked `is_serial()` in parallel, writing
/// each result back into its original index in `outcomes`.
fn run_concurrent_checks(
    args: &ProjectCheckArgs,
    root: &Path,
    checks: &[CheckId],
    progress: &Progress,
    cache: Option<&(String, cache::Fingerprints)>,
    outcomes: &mut [Option<CheckOutcome>],
) {
    let concurrent: Vec<(usize, CheckId)> = checks
        .iter()
        .enumerate()
        .filter(|(_, id)| !id.is_serial())
        .map(|(index, id)| (index, *id))
        .collect();

    let done: Vec<(usize, CheckOutcome)> = concurrent
        .par_iter()
        .map(|(index, id)| {
            progress.entered(*id);
            let outcome = run_check(args, root, *id, cache);
            progress.left(*id);
            (*index, outcome)
        })
        .collect();
    for (index, outcome) in done {
        outcomes[index] = Some(outcome);
    }
}

pub fn run(args: &ProjectCheckArgs) {
    let extra: Vec<CheckId> = args
        .e2e
        .then_some(CheckId::E2e)
        .into_iter()
        .chain(args.outdated.then_some(CheckId::Outdated))
        .collect();
    let checks = match select_checks(args.only.as_deref(), args.skip.as_deref(), &extra) {
        Ok(checks) => checks,
        Err(message) => {
            error(message);
            std::process::exit(1);
        }
    };

    let report = execute(args, &checks);

    if args.json {
        println!("{}", render_json(&report));
    } else {
        print!("{}", render_report(&report));
    }

    if report.is_failure(args.strict) {
        std::process::exit(1);
    }
}
