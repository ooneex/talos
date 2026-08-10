//! Workspace discovery and scoring — reading a module's `src/`, splitting
//! every file into symbols, and turning what each of them trips into a
//! [`super::ModulePerformance`].

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use rayon::prelude::*;

use crate::commands::project_check::modules::{
    TS_EXTENSIONS, WorkspaceModule, collect_files, discover_modules, filter_modules, relative,
    wanted_names,
};
use crate::utils::{Loader, is_rust_module};

use super::rules::{Severity, inspect, score};
use super::suppressions::{Suppression, apply, collect};
use super::symbols::{Symbol, SymbolKind, extract, mask};
use super::{ModulePerformance, ScanStatus, SymbolPerformance};

/// How deep a module's `src/` is walked.
const MAX_DEPTH: usize = 10;

/// A workspace member the run knows how to read, plus why it is being left
/// alone when it is not.
pub(super) struct Target {
    name: String,
    label: String,
    dir: PathBuf,
    /// Present when the module holds nothing this command can score.
    pub(super) skip: Option<String>,
}

/// The workspace members `--modules` / `--packages` selected.
pub(super) fn workspace(
    root: &Path,
    modules: Option<&str>,
    packages: Option<&str>,
) -> Vec<WorkspaceModule> {
    filter_modules(discover_modules(root), &wanted_names(modules, packages))
}

pub(super) fn collect_targets(modules: &[WorkspaceModule]) -> Vec<Target> {
    modules
        .iter()
        .map(|module| Target {
            name: module.name.clone(),
            label: module.label(),
            dir: module.dir.clone(),
            skip: skip_reason(module),
        })
        .collect()
}

/// Why a module holds nothing to score. The rules read TypeScript, so a Rust
/// crate is left to its own tooling, and a module with no `src/` has no
/// source at all.
pub fn skip_reason(module: &WorkspaceModule) -> Option<String> {
    if is_rust_module(&module.dir) {
        return Some("rust module — the rules read TypeScript".to_string());
    }
    if !module.dir.join("src").is_dir() {
        return Some("no src/ directory".to_string());
    }
    None
}

/// Score every readable module. Reading is IO-bound and the rules are pure,
/// so the modules are scored in parallel and ranked worst first afterwards.
pub(super) fn scan_modules(
    root: &Path,
    targets: Vec<Target>,
    floor: Option<Severity>,
    loader: &Loader,
) -> Vec<ModulePerformance> {
    let mut scored: Vec<ModulePerformance> = targets
        .into_par_iter()
        .map(|target| scan_module(root, &target, floor, loader))
        .collect();

    sort_modules(&mut scored);
    scored
}

fn scan_module(
    root: &Path,
    target: &Target,
    floor: Option<Severity>,
    loader: &Loader,
) -> ModulePerformance {
    if let Some(reason) = &target.skip {
        return ModulePerformance {
            name: target.name.clone(),
            label: target.label.clone(),
            dir: target.dir.clone(),
            status: ScanStatus::Skipped(reason.clone()),
            symbols: Vec::new(),
            files: 0,
            duration_ms: 0,
        };
    }

    loader.entered(0, target.label.clone());
    let started = Instant::now();

    let paths = collect_files(&target.dir.join("src"), TS_EXTENSIONS, MAX_DEPTH);
    let mut symbols = Vec::new();
    let mut files = 0usize;

    for path in &paths {
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        files += 1;
        let markup = path.extension().and_then(|extension| extension.to_str()) == Some("tsx");
        symbols.extend(score_file(&relative(root, path), &content, markup, floor));
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    loader.left(0, &target.label);

    ModulePerformance {
        name: target.name.clone(),
        label: target.label.clone(),
        dir: target.dir.clone(),
        status: ScanStatus::Scored,
        symbols,
        files,
        duration_ms,
    }
}

/// Every symbol one file declares, scored.
///
/// Leaves are scored on what they trip; a class is scored afterwards, as the
/// mean of the methods declared in it — which is why the classes are filled
/// in on a second pass rather than as they are met.
pub fn score_file(
    file: &str,
    content: &str,
    markup: bool,
    floor: Option<Severity>,
) -> Vec<SymbolPerformance> {
    let declared = extract(content);
    let suppressions = collect(content, &mask(content));
    let mut scored: Vec<SymbolPerformance> = declared
        .iter()
        .map(|symbol| leaf(file, symbol, markup, floor, &suppressions))
        .collect();

    for (index, symbol) in declared.iter().enumerate() {
        if symbol.kind != SymbolKind::Class {
            continue;
        }
        let members: Vec<f64> = declared
            .iter()
            .zip(scored.iter())
            .filter(|(member, _)| member.owner.as_deref() == Some(symbol.name.as_str()))
            .map(|(_, member)| member.score)
            .collect();
        if members.is_empty() {
            continue;
        }
        scored[index].score = members.iter().sum::<f64>() / members.len() as f64;
    }

    scored
}

fn leaf(
    file: &str,
    symbol: &Symbol,
    markup: bool,
    floor: Option<Severity>,
    suppressions: &[Suppression],
) -> SymbolPerformance {
    let found: Vec<_> = inspect(symbol, markup)
        .into_iter()
        .filter(|finding| floor.is_none_or(|floor| finding.rule.severity >= floor))
        .collect();
    // Suppressing after the floor so the count reports what the run would
    // otherwise have shown, not what a `--min-severity` had already dropped.
    let (findings, suppressed) = apply(found, suppressions);

    SymbolPerformance {
        kind: symbol.kind,
        name: symbol.qualified(),
        file: file.to_string(),
        line: symbol.line,
        span: symbol.span(),
        score: score(&findings),
        findings,
        suppressed,
    }
}

/// Worst first — the report is read from the top, so what needs work is what
/// is read first. Skipped modules sink to the bottom whatever they "score".
pub fn sort_modules(modules: &mut [ModulePerformance]) {
    modules.sort_by(|a, b| {
        rank(&a.status)
            .cmp(&rank(&b.status))
            .then_with(|| a.score().total_cmp(&b.score()))
            .then_with(|| b.findings().cmp(&a.findings()))
            .then_with(|| a.label.cmp(&b.label))
    });
}

pub fn rank(status: &ScanStatus) -> u8 {
    match status {
        ScanStatus::Scored => 0,
        ScanStatus::Skipped(_) => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = "\
export class UserService {
  public async syncAll(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.userRepository.findOne(id);
    }
  }

  public toDto(user: User): UserDto {
    return { id: user.id };
  }
}
";

    #[test]
    fn score_file_scores_the_leaves_and_rolls_the_class_up_from_them() {
        let scored = score_file("modules/user/src/user.service.ts", SOURCE, false, None);
        let by_name = |name: &str| {
            scored
                .iter()
                .find(|symbol| symbol.name == name)
                .expect("the symbol is scored")
        };

        let sync = by_name("UserService.syncAll");
        let dto = by_name("UserService.toDto");
        let class = by_name("UserService");

        assert!(sync.score < 90.0);
        assert_eq!(dto.score, 100.0);
        assert_eq!(class.score, (sync.score + dto.score) / 2.0);
        // A class trips nothing of its own — the cost sits on its methods.
        assert!(class.findings.is_empty());
        assert_eq!(sync.file, "modules/user/src/user.service.ts");
    }

    #[test]
    fn a_severity_floor_drops_the_findings_under_it_and_the_score_recovers() {
        let all = score_file("a.ts", SOURCE, false, None);
        let critical = score_file("a.ts", SOURCE, false, Some(Severity::Critical));

        let scored = |symbols: &[SymbolPerformance]| {
            symbols
                .iter()
                .find(|symbol| symbol.name == "UserService.syncAll")
                .expect("the symbol is scored")
                .clone()
        };

        assert!(scored(&critical).findings.len() < scored(&all).findings.len());
        assert!(scored(&critical).score > scored(&all).score);
        assert!(
            scored(&critical)
                .findings
                .iter()
                .all(|finding| finding.rule.severity == Severity::Critical)
        );
    }

    #[test]
    fn a_class_with_no_methods_keeps_the_full_marks_it_started_with() {
        let scored = score_file("a.ts", "export class Empty {}\n", false, None);

        assert_eq!(scored.len(), 1);
        assert_eq!(scored[0].score, 100.0);
    }

    #[test]
    fn sort_modules_puts_the_worst_first_and_the_skipped_last() {
        let build = |name: &str, status: ScanStatus, score: f64| ModulePerformance {
            name: name.to_string(),
            label: format!("modules/{name}"),
            dir: PathBuf::from(name),
            status,
            symbols: vec![SymbolPerformance {
                kind: SymbolKind::Function,
                name: "run".to_string(),
                file: "a.ts".to_string(),
                line: 1,
                span: 1,
                findings: Vec::new(),
                suppressed: 0,
                score,
            }],
            files: 1,
            duration_ms: 0,
        };

        let mut modules = vec![
            build("clean", ScanStatus::Scored, 100.0),
            build("gone", ScanStatus::Skipped("no src/".to_string()), 0.0),
            build("slow", ScanStatus::Scored, 40.0),
        ];
        sort_modules(&mut modules);

        let names: Vec<&str> = modules.iter().map(|module| module.name.as_str()).collect();
        assert_eq!(names, vec!["slow", "clean", "gone"]);
    }

    #[test]
    fn skip_reason_names_why_a_module_is_left_alone() {
        let dir = tempfile::tempdir().expect("tempdir");
        let module = WorkspaceModule {
            name: "ghost".to_string(),
            group: "modules".to_string(),
            dir: dir.path().to_path_buf(),
            kind: None,
        };

        assert_eq!(skip_reason(&module).as_deref(), Some("no src/ directory"));

        fs::create_dir_all(dir.path().join("src")).expect("src");
        assert_eq!(skip_reason(&module), None);
    }
}
