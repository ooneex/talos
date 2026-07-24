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

fn scalar_to_yaml(value: &str) -> String {
    if value.is_empty() || needs_quoting(value) {
        format!("{value:?}")
    } else {
        value.to_string()
    }
}

pub fn map_to_yaml(map: &[(String, String)], indent: usize) -> String {
    let pad = "  ".repeat(indent);
    map.iter()
        .map(|(key, value)| format!("{pad}{key}: {}", scalar_to_yaml(value)))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn credentials_to_yaml(profile: &[(String, String)]) -> String {
    let mut lines = vec!["profiles:".to_string(), "  default:".to_string()];
    lines.push(map_to_yaml(profile, 2));
    format!("{}\n", lines.join("\n"))
}

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
