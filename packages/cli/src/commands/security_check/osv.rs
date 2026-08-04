// The OSV.dev online client — batched vulnerability queries, per-id
// record fetches, and CVSS-to-severity scoring. Split out of the parent
// module to keep it under the file-size budget.

use std::collections::{BTreeSet, HashMap};

use serde_json::{Value, json};

use super::{OSV_BATCH_SIZE, OSV_QUERY_BATCH_URL, OSV_VULN_URL, PackageKey, Severity};
use crate::commands::security_check::{Finding, ModuleReport, Origin};

// ---------------------------------------------------------------------------
// OSV.dev online client
// ---------------------------------------------------------------------------

fn osv_agent() -> ureq::Agent {
    // Trust the operating-system certificate store (macOS keychain, Windows
    // cert store, Linux CA bundle) rather than ureq's bundled Mozilla roots, so
    // the client works behind corporate TLS-inspecting proxies too.
    let config = ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build();
    config.into()
}

pub(super) fn osv_query_batch(
    packages: &[PackageKey],
    base: Option<&str>,
) -> Option<Vec<Vec<String>>> {
    let agent = osv_agent();
    let query_url = match base {
        Some(base) => format!("{}/v1/querybatch", base.trim_end_matches('/')),
        None => OSV_QUERY_BATCH_URL.to_string(),
    };
    let mut results: Vec<Vec<String>> = Vec::with_capacity(packages.len());
    for chunk in packages.chunks(OSV_BATCH_SIZE) {
        let queries: Vec<Value> = chunk
            .iter()
            .map(|package| {
                json!({
                    "package": { "name": package.name, "ecosystem": package.ecosystem.osv() },
                    "version": package.version,
                })
            })
            .collect();
        let response: Value = agent
            .post(&query_url)
            .header("Content-Type", "application/json")
            .send_json(json!({ "queries": queries }))
            .ok()?
            .into_body()
            .read_json()
            .ok()?;
        let entries = response.get("results").and_then(Value::as_array)?;
        for entry in entries {
            let ids = entry
                .get("vulns")
                .and_then(Value::as_array)
                .map(|vulns| {
                    vulns
                        .iter()
                        .filter_map(|vuln| vuln.get("id").and_then(Value::as_str))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            results.push(ids);
        }
    }
    // Guard against a short/misaligned response.
    while results.len() < packages.len() {
        results.push(Vec::new());
    }
    Some(results)
}

pub(super) fn fetch_records(ids: &BTreeSet<String>, base: Option<&str>) -> HashMap<String, Value> {
    let agent = osv_agent();
    let mut records = HashMap::new();
    for id in ids {
        if let Some(record) = fetch_record(&agent, id, base) {
            records.insert(id.clone(), record);
        }
    }
    records
}

fn fetch_record(agent: &ureq::Agent, id: &str, base: Option<&str>) -> Option<Value> {
    let url = match base {
        Some(base) => format!("{}/v1/vulns/{id}", base.trim_end_matches('/')),
        None => format!("{OSV_VULN_URL}/{id}"),
    };
    agent.get(url).call().ok()?.into_body().read_json().ok()
}

pub fn build_finding(
    module: &ModuleReport,
    package: &PackageKey,
    id: &str,
    record: Option<&Value>,
) -> Finding {
    let severity = record
        .map(severity_from_record)
        .unwrap_or(Severity::Unknown);
    let title = record
        .and_then(|r| {
            r.get("summary")
                .and_then(Value::as_str)
                .or_else(|| r.get("details").and_then(Value::as_str))
        })
        .map(str::to_string)
        .unwrap_or_else(|| format!("Known vulnerability in {}", package.name));
    let aliases = record
        .and_then(|r| r.get("aliases").and_then(Value::as_array))
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .filter(|alias| alias.starts_with("CVE"))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let patched = record
        .map(|r| fixed_versions(r, package))
        .unwrap_or_default();

    Finding {
        module: module.name.clone(),
        module_dir: module.dir.clone(),
        origin: Origin::Dependency(package.ecosystem),
        subject: package.name.clone(),
        version: package.version.clone(),
        severity,
        id: id.to_string(),
        title,
        url: format!("https://osv.dev/vulnerability/{id}"),
        aliases,
        remediation: patched,
        evidence: String::new(),
    }
}

pub fn severity_from_record(record: &Value) -> Severity {
    if let Some(label) = record
        .get("database_specific")
        .and_then(|d| d.get("severity"))
        .and_then(Value::as_str)
    {
        let severity = Severity::from_label(label);
        if severity != Severity::Unknown {
            return severity;
        }
    }

    let mut best = Severity::Unknown;
    if let Some(entries) = record.get("severity").and_then(Value::as_array) {
        for entry in entries {
            let Some(score) = entry.get("score").and_then(Value::as_str) else {
                continue;
            };
            let severity = if let Ok(numeric) = score.parse::<f64>() {
                Severity::from_cvss(numeric)
            } else if let Some(numeric) = cvss3_base_score(score) {
                Severity::from_cvss(numeric)
            } else {
                Severity::Unknown
            };
            if severity > best {
                best = severity;
            }
        }
    }
    best
}

/// The `fixed` versions one `affected` entry's ranges declare.
fn entry_fixed_versions(entry: &Value) -> Vec<String> {
    let Some(ranges) = entry.get("ranges").and_then(Value::as_array) else {
        return Vec::new();
    };
    ranges
        .iter()
        .filter_map(|range| range.get("events").and_then(Value::as_array))
        .flatten()
        .filter_map(|event| event.get("fixed").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

pub fn fixed_versions(record: &Value, package: &PackageKey) -> String {
    let mut fixed: Vec<String> = Vec::new();
    let Some(affected) = record.get("affected").and_then(Value::as_array) else {
        return String::new();
    };
    for entry in affected {
        let name = entry
            .get("package")
            .and_then(|p| p.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let ecosystem = entry
            .get("package")
            .and_then(|p| p.get("ecosystem"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if name != package.name || !ecosystem.starts_with(package.ecosystem.osv()) {
            continue;
        }
        fixed.extend(entry_fixed_versions(entry));
    }
    fixed.sort();
    fixed.dedup();
    fixed.join(", ")
}

/// Compute a CVSS v3.x base score from its vector string. Returns `None` for a
/// malformed vector or a non-v3 (e.g. CVSS v2/v4) string.
pub fn cvss3_base_score(vector: &str) -> Option<f64> {
    if !vector.starts_with("CVSS:3") {
        return None;
    }
    let mut metrics: HashMap<&str, &str> = HashMap::new();
    for part in vector.split('/') {
        if let Some((key, value)) = part.split_once(':') {
            metrics.insert(key, value);
        }
    }
    let scope_changed = metrics.get("S") == Some(&"C");

    let av = match *metrics.get("AV")? {
        "N" => 0.85,
        "A" => 0.62,
        "L" => 0.55,
        "P" => 0.2,
        _ => return None,
    };
    let ac = match *metrics.get("AC")? {
        "L" => 0.77,
        "H" => 0.44,
        _ => return None,
    };
    let ui = match *metrics.get("UI")? {
        "N" => 0.85,
        "R" => 0.62,
        _ => return None,
    };
    let pr = match *metrics.get("PR")? {
        "N" => 0.85,
        "L" if scope_changed => 0.68,
        "L" => 0.62,
        "H" if scope_changed => 0.5,
        "H" => 0.27,
        _ => return None,
    };
    let impact_of = |value: &str| -> f64 {
        match value {
            "N" => 0.0,
            "L" => 0.22,
            "H" => 0.56,
            _ => 0.0,
        }
    };
    let confidentiality = impact_of(metrics.get("C")?);
    let integrity = impact_of(metrics.get("I")?);
    let availability = impact_of(metrics.get("A")?);

    let iss = 1.0 - ((1.0 - confidentiality) * (1.0 - integrity) * (1.0 - availability));
    let impact = if scope_changed {
        7.52 * (iss - 0.029) - 3.25 * (iss - 0.02).powf(15.0)
    } else {
        6.42 * iss
    };
    if impact <= 0.0 {
        return Some(0.0);
    }
    let exploitability = 8.22 * av * ac * pr * ui;
    let raw = if scope_changed {
        (1.08 * (impact + exploitability)).min(10.0)
    } else {
        (impact + exploitability).min(10.0)
    };
    Some((raw * 10.0).ceil() / 10.0)
}
