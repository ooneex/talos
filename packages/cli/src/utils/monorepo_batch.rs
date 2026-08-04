use std::collections::HashMap;

use regex::Regex;

/// Parses a `package.json` script into the biome argument vector (subcommand +
/// flags) when the script is a *single, pure* biome invocation such as
/// `bunx biome check --write` or `biome lint`.
///
/// Returns `None` for compound scripts (`tsc --noEmit && bunx biome lint`),
/// shell redirections, or anything that is not a lone biome command — those
/// cannot be safely collapsed into one process.
pub(crate) fn parse_biome_script(script: &str) -> Option<Vec<String>> {
    let script = script.trim();
    if script.is_empty() {
        return None;
    }

    // Reject any shell composition / substitution — batching only applies to a
    // single standalone command.
    const REJECT: &[&str] = &["&&", "||", ";", "|", ">", "<", "$", "`", "\n"];
    if REJECT.iter().any(|token| script.contains(token)) {
        return None;
    }

    let tokens: Vec<&str> = script.split_whitespace().collect();
    let is_biome = |token: &str| {
        token == "biome" || token.ends_with("/biome") || token.ends_with("/biome.exe")
    };

    let position = tokens.iter().position(|token| is_biome(token))?;

    // Only a known launcher may precede the biome binary (e.g. `bunx biome …`).
    if position > 0 {
        const LAUNCHERS: &[&str] = &["bunx", "npx"];
        if position != 1 || !LAUNCHERS.contains(&tokens[0]) {
            return None;
        }
    }

    let args: Vec<String> = tokens[position + 1..]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let subcommand = args.first()?.as_str();
    if !matches!(subcommand, "check" | "lint" | "format" | "ci") {
        return None;
    }

    Some(args)
}

fn match_key<'a>(keys: &'a [String], file: &str) -> Option<&'a String> {
    keys.iter()
        .filter(|key| file == key.as_str() || file.starts_with(&format!("{key}/")))
        // Prefer the most specific (longest) key so `packages/app` never steals a
        // diagnostic that belongs to `packages/app-env`.
        .max_by_key(|key| key.len())
}

/// Splits biome's human-readable diagnostic output into per-target sections,
/// keyed by the target key (relative directory, e.g. `packages/ai`). A target
/// only appears in the map when at least one diagnostic block references a file
/// beneath it, which is how a batched run attributes failures back to the
/// individual target that owns them.
pub(crate) fn split_biome_output_by_target(
    output: &str,
    keys: &[String],
) -> HashMap<String, String> {
    let header = Regex::new(r"^(\S+):(\d+):(\d+)").expect("the biome header pattern is valid");
    let mut sections: HashMap<String, Vec<String>> = HashMap::new();
    let mut current: Option<String> = None;

    for line in output.lines() {
        if let Some(captures) = header.captures(line) {
            let file = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
            current = match_key(keys, file).cloned();
        } else if !line.is_empty() && !line.starts_with(|c: char| c.is_whitespace()) {
            // A non-indented, non-header line is biome's global output (summaries,
            // configuration errors); it belongs to no single target.
            current = None;
            continue;
        }
        if let Some(key) = &current {
            sections
                .entry(key.clone())
                .or_default()
                .push(line.to_string());
        }
    }

    sections
        .into_iter()
        .map(|(key, lines)| (key, lines.join("\n")))
        .collect()
}

/// Returns `true` when a target's diagnostic section contains at least one
/// error-severity diagnostic. Biome renders error messages with a leading `×`
/// glyph, while warnings/notes use `⚠`/`!`; only errors make a run fail, so
/// fixable warnings (e.g. an unapplied unsafe fix) must not be mistaken for a
/// failure when a *different* target broke the batch.
pub(crate) fn section_has_error(section: &str) -> bool {
    section
        .lines()
        .any(|line| line.trim_start().starts_with('\u{00d7}'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pure_biome_fmt_script() {
        assert_eq!(
            parse_biome_script("bunx biome check --write"),
            Some(vec!["check".to_string(), "--write".to_string()])
        );
    }

    #[test]
    fn parses_bare_and_local_bin_biome() {
        assert_eq!(
            parse_biome_script("biome lint"),
            Some(vec!["lint".to_string()])
        );
        assert_eq!(
            parse_biome_script("node_modules/.bin/biome format --write"),
            Some(vec!["format".to_string(), "--write".to_string()])
        );
    }

    #[test]
    fn rejects_compound_and_non_biome_scripts() {
        assert_eq!(parse_biome_script("tsc --noEmit && bunx biome lint"), None);
        assert_eq!(parse_biome_script("bun test tests"), None);
        assert_eq!(
            parse_biome_script("bunx biome check --write > out.log"),
            None
        );
        assert_eq!(parse_biome_script("biome unknown"), None);
        assert_eq!(parse_biome_script("bunx biome"), None);
        assert_eq!(parse_biome_script(""), None);
    }

    #[test]
    fn attributes_diagnostics_to_the_owning_target() {
        let keys = vec!["packages/ai".to_string(), "packages/app".to_string()];
        let output = "\
packages/ai/src/types.ts:181:62 lint/suspicious/noConfusingVoidType  FIXABLE
  ! void is confusing inside a union type.
packages/app/src/index.ts:3:1 lint/style/useConst
  ! prefer const.
Checked 46 files.";

        let sections = split_biome_output_by_target(output, &keys);

        assert!(
            sections
                .get("packages/ai")
                .unwrap()
                .contains("noConfusingVoidType")
        );
        assert!(sections.get("packages/app").unwrap().contains("useConst"));
        // The trailing global summary belongs to no single target.
        assert!(
            !sections
                .get("packages/app")
                .unwrap()
                .contains("Checked 46 files")
        );
    }

    #[test]
    fn does_not_confuse_prefix_named_targets() {
        let keys = vec!["packages/app".to_string(), "packages/app-env".to_string()];
        let output = "packages/app-env/src/env.ts:1:1 lint/style/useConst\n  ! prefer const.";

        let sections = split_biome_output_by_target(output, &keys);

        assert!(sections.contains_key("packages/app-env"));
        assert!(!sections.contains_key("packages/app"));
    }

    #[test]
    fn distinguishes_error_sections_from_warning_only_sections() {
        let error_section = "\
packages/analytics/src/probe.ts:3:1 lint/suspicious/noDebugger
  × This is an unexpected use of the debugger statement.";
        let warning_section = "\
packages/ai/src/types.ts:181:62 lint/suspicious/noConfusingVoidType  FIXABLE
  ! void is confusing inside a union type.";

        assert!(section_has_error(error_section));
        assert!(!section_has_error(warning_section));
    }
}
