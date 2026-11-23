// Resolving every vulnerability in the workspace: dependency findings via
// the OSV.dev client, assistant-configuration findings via the LLM audit,
// and the module/package name filter shared by both. Split out of the
// parent module to keep it under the file-size budget.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use crate::utils::Spinner;

use super::discovery::{collect_modules, target_name};
use super::osv::{build_finding, fetch_records, osv_query_batch};
use super::{Finding, Origin, PackageKey, SOURCE, Severity, llm};

/// Audit every coding assistant's agent, skill, rule and MCP files. Returns the
/// findings plus the number of scanned files.
pub(super) fn collect_llm_findings(
    root: &Path,
    filter: Option<&BTreeSet<String>>,
    min_severity: Severity,
) -> (Vec<Finding>, usize) {
    let (hits, scanned) = llm::collect(root);
    let mut findings: Vec<Finding> = hits
        .into_iter()
        .map(|hit| build_llm_finding(root, hit))
        .collect();

    if let Some(filter) = filter {
        findings.retain(|finding| filter.contains(finding.module.as_str()));
    }
    findings.retain(|finding| finding.severity >= min_severity);
    (findings, scanned)
}

fn build_llm_finding(root: &Path, finding: llm::LlmFinding) -> Finding {
    let hit = finding.hit;
    let aliases = if hit.occurrences > 1 {
        format!("{} matches", hit.occurrences)
    } else {
        String::new()
    };

    Finding {
        module: target_name(root, &finding.dir),
        module_dir: finding.dir,
        origin: Origin::Assistant(finding.assistant),
        subject: format!("{}:{}", finding.file, hit.line),
        version: String::new(),
        severity: Severity::from_label(hit.severity),
        id: hit.id.to_string(),
        title: hit.title.to_string(),
        url: hit.reference.to_string(),
        aliases,
        remediation: hit.remediation,
        evidence: hit.excerpt,
    }
}

pub fn sort_findings(findings: &mut [Finding]) {
    findings.sort_by(|a, b| {
        a.module
            .cmp(&b.module)
            .then_with(|| b.severity.cmp(&a.severity))
            .then_with(|| a.subject.cmp(&b.subject))
            .then_with(|| a.id.cmp(&b.id))
    });
}

/// Resolve every vulnerability in the workspace. Returns the findings plus the
/// number of audited modules and dependencies. An empty error message means
/// "nothing to audit".
pub(super) fn collect_findings(
    root: &Path,
    filter: Option<&BTreeSet<String>>,
    min_severity: Severity,
    base: Option<&str>,
) -> Result<(Vec<Finding>, usize, usize), String> {
    let spinner = Spinner::start("Collecting dependencies");
    let mut modules = collect_modules(root);
    spinner.stop();

    if let Some(filter) = filter {
        modules.retain(|m| filter.contains(m.name.as_str()));
    }

    if modules.is_empty() {
        return Err(String::new());
    }

    let total_deps: usize = modules.iter().map(|m| m.packages.len()).sum();
    let (index, vuln_ids, records) = query_vulnerabilities(&modules, base)?;

    let mut findings = build_module_findings(&modules, &index, &vuln_ids, &records);
    findings.retain(|f| f.severity >= min_severity);
    sort_findings(&mut findings);

    Ok((findings, modules.len(), total_deps))
}

/// De-duplicate every (ecosystem, name, version) tuple across all modules so a
/// package shared by several modules is queried online only once, then
/// resolve the advisory ids and their records.
#[allow(
    clippy::type_complexity,
    reason = "the three query results are only ever used together"
)]
fn query_vulnerabilities(
    modules: &[super::ModuleReport],
    base: Option<&str>,
) -> Result<
    (
        HashMap<PackageKey, usize>,
        Vec<Vec<String>>,
        HashMap<String, serde_json::Value>,
    ),
    String,
> {
    let mut unique: Vec<PackageKey> = Vec::new();
    let mut index: HashMap<PackageKey, usize> = HashMap::new();
    for module in modules {
        for package in &module.packages {
            index.entry(package.clone()).or_insert_with(|| {
                unique.push(package.clone());
                unique.len() - 1
            });
        }
    }

    let spinner = Spinner::start(format!(
        "Querying {SOURCE} for {} package{}",
        unique.len(),
        if unique.len() == 1 { "" } else { "s" }
    ));
    let vuln_ids = match osv_query_batch(&unique, base) {
        Some(ids) => ids,
        None => {
            spinner.stop();
            return Err(format!(
                "Could not reach {SOURCE} — check your network connection and try again"
            ));
        }
    };
    spinner.stop();

    // Resolve advisory details once per unique id.
    let mut all_ids: BTreeSet<String> = BTreeSet::new();
    for ids in &vuln_ids {
        for id in ids {
            all_ids.insert(id.clone());
        }
    }

    let records = if all_ids.is_empty() {
        HashMap::new()
    } else {
        let spinner = Spinner::start(format!(
            "Fetching {} advisor{} from {SOURCE}",
            all_ids.len(),
            if all_ids.len() == 1 { "y" } else { "ies" }
        ));
        let records = fetch_records(&all_ids, base);
        spinner.stop();
        records
    };

    Ok((index, vuln_ids, records))
}

/// Match every module's packages back to the advisory ids the batched query
/// resolved for them, building one finding per unique (package, id) pair.
fn build_module_findings(
    modules: &[super::ModuleReport],
    index: &HashMap<PackageKey, usize>,
    vuln_ids: &[Vec<String>],
    records: &HashMap<String, serde_json::Value>,
) -> Vec<Finding> {
    let mut findings: Vec<Finding> = Vec::new();
    for module in modules {
        let mut seen: HashSet<(String, String)> = HashSet::new();
        for package in &module.packages {
            let Some(&query_index) = index.get(package) else {
                continue;
            };
            for id in &vuln_ids[query_index] {
                if !seen.insert((package.name.clone(), id.clone())) {
                    continue;
                }
                let record = records.get(id);
                findings.push(build_finding(module, package, id, record));
            }
        }
    }
    findings
}

pub fn build_filter(modules: Option<&str>, packages: Option<&str>) -> Option<BTreeSet<String>> {
    let mut set = BTreeSet::new();
    for value in [modules, packages].into_iter().flatten() {
        for name in value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            set.insert(name.to_string());
        }
    }
    if set.is_empty() { None } else { Some(set) }
}
