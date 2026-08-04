// Regex-based parsing of TypeScript import/export syntax, shared by the graph
// builder in the parent module.

use std::collections::BTreeSet;
use std::sync::OnceLock;

use regex::Regex;

use super::Import;

fn import_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // The clause before `from` is captured so the imported names can be
        // read out of it; a bare `import "./x"` has none.
        Regex::new(
            r#"(?m)^\s*import\s+(?:(type\s+)?([^"';]*?)\s+from\s+)?["']([^"'\n]+)["']|(?:\brequire\s*\(|\bimport\s*\()\s*["']([^"'\n]+)["']"#,
        )
        .expect("the import pattern is valid")
    })
}

fn reexport_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // `export * from "./x"` and `export { A } from "./x"` load `./x` just
        // as an import does — which is exactly how every barrel reaches the
        // files it publishes.
        Regex::new(r#"(?m)^\s*export\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"'\n]+)["']"#)
            .expect("the re-export pattern is valid")
    })
}

fn export_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?m)^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)",
        )
        .expect("the export pattern is valid")
    })
}

fn export_list_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*export\s+(?:type\s+)?\{([^}]*)\}").expect("the export list is valid")
    })
}

/// Every import of a file, with the names each one pulls in.
pub fn parse_imports(content: &str) -> Vec<Import> {
    let mut imports = Vec::new();

    for captured in import_pattern().captures_iter(content) {
        let specifier = captured
            .get(3)
            .or_else(|| captured.get(4))
            .map(|group| group.as_str().trim().to_string())
            .unwrap_or_default();
        if specifier.is_empty() {
            continue;
        }
        let names = captured
            .get(2)
            .map(|group| imported_names(group.as_str()))
            .unwrap_or_default();
        imports.push(Import {
            specifier,
            resolved: None,
            module: None,
            names,
            type_only: captured.get(1).is_some(),
        });
    }

    for captured in reexport_pattern().captures_iter(content) {
        let (Some(clause), Some(specifier)) = (captured.get(2), captured.get(3)) else {
            continue;
        };
        imports.push(Import {
            specifier: specifier.as_str().trim().to_string(),
            resolved: None,
            module: None,
            names: imported_names(clause.as_str()),
            type_only: captured.get(1).is_some(),
        });
    }

    imports
}

/// The bindings an import clause introduces: `A`, `{ b, c as d }` and
/// `* as ns` all name what the file actually consumes.
pub fn imported_names(clause: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();

    let (default_part, named_part) = match clause.find('{') {
        Some(open) => {
            let close = clause[open..].find('}').map(|end| open + end);
            (
                &clause[..open],
                close.map(|close| &clause[open + 1..close]).unwrap_or(""),
            )
        }
        None => (clause, ""),
    };

    for part in default_part.split(',') {
        let part = part.trim().trim_end_matches(',').trim();
        // `* as ns` consumes the whole module rather than a named export.
        if part.is_empty() || part.starts_with('*') || part == "type" {
            continue;
        }
        names.insert(part.to_string());
    }

    for entry in named_part.split(',') {
        // `a as b` imports `a`; the local alias is not the export's name.
        let name = entry
            .trim()
            .trim_start_matches("type ")
            .split(" as ")
            .next()
            .unwrap_or_default()
            .trim();
        if !name.is_empty() {
            names.insert(name.to_string());
        }
    }

    names
}

/// Every name a file exports.
pub fn exported_names(content: &str) -> BTreeSet<String> {
    let mut names: BTreeSet<String> = export_pattern()
        .captures_iter(content)
        .filter_map(|captured| captured.get(1))
        .map(|group| group.as_str().to_string())
        .collect();

    for captured in export_list_pattern().captures_iter(content) {
        let Some(list) = captured.get(1) else {
            continue;
        };
        for entry in list.as_str().split(',') {
            // `a as b` publishes `b`, which is the name importers write.
            let name = entry
                .trim()
                .trim_start_matches("type ")
                .rsplit(" as ")
                .next()
                .unwrap_or_default()
                .trim();
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }

    if content.contains("export default") {
        names.insert("default".to_string());
    }

    names
}
