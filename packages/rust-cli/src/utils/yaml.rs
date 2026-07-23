//! Minimal YAML serializer for string maps, mirroring the subset of
//! `packages/cli/src/utils.ts`'s `toYaml` used by `credentials.rs`
//! (`{ profiles: { default: { ...key: value } } }`).

/// Mirrors `needsQuoting` in `packages/cli/src/utils.ts`.
fn needs_quoting(value: &str) -> bool {
    let starts_with_special = value
        .chars()
        .next()
        .is_some_and(|c| " {[]&*!|>'\"%@`,?:-".contains(c));

    let lower = value.to_lowercase();
    let looks_like_scalar = matches!(
        lower.as_str(),
        "true" | "false" | "null" | "yes" | "no" | "on" | "off" | "~"
    ) || value.parse::<f64>().is_ok();

    starts_with_special
        || value.contains('\n')
        || value.contains('#')
        || value.contains(": ")
        || value.ends_with(':')
        || value != value.trim()
        || looks_like_scalar
}

/// Mirrors `toYaml` for a plain string, quoting with JSON-style escaping when needed.
fn scalar_to_yaml(value: &str) -> String {
    if value.is_empty() || needs_quoting(value) {
        format!("{value:?}")
    } else {
        value.to_string()
    }
}

/// Serializes a single-level string map as a YAML mapping, one `key: value` per line.
pub fn map_to_yaml(map: &[(String, String)], indent: usize) -> String {
    let pad = "  ".repeat(indent);
    map.iter()
        .map(|(key, value)| format!("{pad}{key}: {}", scalar_to_yaml(value)))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Serializes `{ profiles: { default: { ...profile } } }`, mirroring the shape
/// written by `saveCredentials` in `packages/cli/src/credentials.ts`.
pub fn credentials_to_yaml(profile: &[(String, String)]) -> String {
    let mut lines = vec!["profiles:".to_string(), "  default:".to_string()];
    lines.push(map_to_yaml(profile, 2));
    format!("{}\n", lines.join("\n"))
}

/// Parses the flat `key: value` (optionally quoted) lines written by
/// [`credentials_to_yaml`] back into a map. Only supports the subset of YAML
/// this module writes; not a general-purpose YAML parser.
pub fn parse_default_profile(content: &str) -> Vec<(String, String)> {
    let mut entries = Vec::new();
    let mut in_default = false;

    for line in content.lines() {
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();

        if trimmed == "profiles:" {
            continue;
        }
        if trimmed == "default:" {
            in_default = true;
            continue;
        }
        if !in_default || indent < 4 {
            continue;
        }

        if let Some((key, value)) = trimmed.split_once(':') {
            let value = value.trim();
            let unquoted = if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
                serde_json_like_unquote(value)
            } else {
                value.to_string()
            };
            entries.push((key.trim().to_string(), unquoted));
        }
    }

    entries
}

/// Unescapes a JSON-style quoted string without pulling in a JSON dependency.
fn serde_json_like_unquote(value: &str) -> String {
    let inner = &value[1..value.len() - 1];
    let mut result = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') => result.push('\n'),
                Some('t') => result.push('\t'),
                Some('"') => result.push('"'),
                Some('\\') => result.push('\\'),
                Some(other) => result.push(other),
                None => {}
            }
        } else {
            result.push(c);
        }
    }
    result
}
