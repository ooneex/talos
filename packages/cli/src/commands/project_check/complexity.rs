// Complexity check — the budgets that keep a file readable.
//
// None of this breaks a build, which is exactly why it accumulates: a function
// grows by four lines at a time and nothing ever says stop. The budgets below
// are the point where a reviewer stops holding the whole thing in their head,
// so everything here warns rather than fails.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    PYTHON_EXTENSIONS, RUST_EXTENSIONS, TS_EXTENSIONS, collect_files, discover_modules,
    filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Lines a source file may hold before it is doing more than one job.
const MAX_FILE_LINES: usize = 500;

/// Lines a single function may hold.
const MAX_FUNCTION_LINES: usize = 80;

/// Parameters a function may take before an options object is clearer.
const MAX_PARAMETERS: usize = 5;

/// How deeply a body may nest before the happy path is impossible to find.
const MAX_DEPTH: usize = 5;

/// Words that decorate a declaration rather than name it.
const DECLARATION_KEYWORDS: [&str; 11] = [
    "export", "default", "const", "let", "var", "async", "function", "fn", "def", "pub", "public",
];

/// One budget a file went over.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Overrun {
    pub line: usize,
    pub rule: &'static str,
    pub message: String,
}

/// Strip what would otherwise be counted as code: comments, and the contents of
/// string literals. Only the shape of the file matters here.
fn code_only(line: &str) -> &str {
    let line = line.trim();
    if line.starts_with("//") || line.starts_with('#') || line.starts_with('*') {
        return "";
    }
    line
}

fn string_literal_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r#""(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'"#)
            .expect("the string literal pattern is valid")
    })
}

/// Whether `line[i..]` opens a raw string, returning the number of `#`
/// delimiters and the index its content starts at.
fn raw_string_open(chars: &[char], i: usize) -> Option<(usize, usize)> {
    if chars[i] != 'r' {
        return None;
    }
    let mut hashes = 0;
    let mut cursor = i + 1;
    while chars.get(cursor) == Some(&'#') {
        hashes += 1;
        cursor += 1;
    }
    (chars.get(cursor) == Some(&'"')).then_some((hashes, cursor + 1))
}

/// The index of the `"` that closes a raw string opened with `hashes` `#`
/// delimiters, searching from its content start.
fn raw_string_close(chars: &[char], content_start: usize, hashes: usize) -> Option<usize> {
    (content_start..chars.len()).find(|&candidate| {
        chars[candidate] == '"'
            && (0..hashes).all(|offset| chars.get(candidate + 1 + offset) == Some(&'#'))
    })
}

/// Masks a Rust raw string literal (`r"…"`, `r#"…"#`, `r##"…"##`, …), whose
/// content is exempt from backslash escaping and so may hold an unescaped
/// quote that would otherwise desynchronize the plain quote-pair matcher
/// below — a regex character class like `r#"[^"]*"#` is exactly this shape.
fn mask_raw_strings(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        let opened = raw_string_open(&chars, i).and_then(|(hashes, content_start)| {
            raw_string_close(&chars, content_start, hashes)
                .map(|close| (hashes, content_start, close))
        });
        let Some((hashes, content_start, close)) = opened else {
            out.push(chars[i]);
            i += 1;
            continue;
        };
        out.push('r');
        for _ in 0..hashes {
            out.push('#');
        }
        out.push('"');
        for _ in content_start..close {
            out.push(' ');
        }
        out.push('"');
        for _ in 0..hashes {
            out.push('#');
        }
        i = close + hashes + 1;
    }
    out
}

/// Masks the contents of quoted literals so a stray `{` or `}` inside a
/// regex pattern, a format string, or a character class is never mistaken
/// for a block boundary. A lone lifetime apostrophe (`&'a str`) has no
/// partner quote on the line, so the pattern never matches it and the
/// brace it precedes is still counted.
pub(super) fn without_string_contents(line: &str) -> String {
    let raw_masked = mask_raw_strings(line);
    string_literal_pattern()
        .replace_all(&raw_masked, |captured: &regex::Captures| {
            " ".repeat(captured[0].chars().count())
        })
        .into_owned()
}

/// The deepest block nesting a file reaches, and the line it happens on.
///
/// Only braces count. A chained call or a long argument list is wide, not
/// deep, and counting its brackets would flag every builder in the codebase.
pub fn deepest_nesting(content: &str) -> (usize, usize) {
    let mut depth: i64 = 0;
    let mut deepest = 0;
    let mut deepest_line = 0;

    for (number, line) in content.lines().enumerate() {
        for character in without_string_contents(code_only(line)).chars() {
            match character {
                '{' => depth += 1,
                '}' => depth = (depth - 1).max(0),
                _ => {}
            }
        }
        // Measured at the end of the line so a one-line closure that opens and
        // closes does not count as a level of its own.
        if depth as usize > deepest {
            deepest = depth as usize;
            deepest_line = number + 1;
        }
    }

    (deepest, deepest_line)
}

/// Whether a line opens a function, and the parameter list it declares.
pub fn function_signature(line: &str) -> Option<(String, String)> {
    let trimmed = code_only(line);
    let keyword = [
        "function ",
        "def ",
        "fn ",
        "async fn ",
        "public async ",
        "public ",
    ]
    .iter()
    .any(|keyword| trimmed.starts_with(keyword) || trimmed.contains(&format!(" {keyword}")));
    // An arrow function is declared as a const, which is the shape the project
    // conventions ask for everywhere but class methods.
    let arrow = trimmed.contains("=> {") && (trimmed.contains("const ") || trimmed.contains('('));

    if !keyword && !arrow {
        return None;
    }

    let open = trimmed.find('(')?;
    let close = trimmed[open..].rfind(')').map(|end| open + end)?;
    // The name is the last token that is not part of the declaration itself:
    // `export const load = async (` is called `load`, not `async`.
    let name = trimmed[..open]
        .split(|character: char| character.is_whitespace() || character == '=')
        .map(str::trim)
        .rfind(|token| !token.is_empty() && !DECLARATION_KEYWORDS.contains(token))
        .unwrap_or_default()
        .to_string();
    // A callback passed inline has no name of its own to report.
    let name = if name.is_empty() {
        "<anonymous>".to_string()
    } else {
        name
    };

    Some((name, trimmed[open + 1..close].to_string()))
}

/// The parameters a signature declares. Nested generics and default values make
/// a plain `split(',')` wrong, so the depth is tracked while splitting.
pub fn parameter_count(parameters: &str) -> usize {
    if parameters.trim().is_empty() {
        return 0;
    }

    let mut depth = 0;
    let mut count = 1;
    for character in parameters.chars() {
        match character {
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            ',' if depth == 0 => count += 1,
            _ => {}
        }
    }
    count
}

/// Every budget one file goes over.
///
/// `markup` marks a file that holds JSX. Nesting and body length measure how
/// hard the control flow is to follow, and a component tree is not control flow
/// — it is the shape of the page, and an icon is one long `path` — so those two
/// budgets are left off there. File length and parameter count still apply:
/// they say the same thing about a component as about anything else.
pub fn inspect(content: &str, markup: bool) -> Vec<Overrun> {
    let mut overruns = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    if lines.len() > MAX_FILE_LINES {
        overruns.push(Overrun {
            line: lines.len(),
            rule: "complexity.file",
            message: format!(
                "{} lines, over the {MAX_FILE_LINES}-line budget",
                lines.len()
            ),
        });
    }

    let (depth, depth_line) = deepest_nesting(content);
    if depth > MAX_DEPTH && !markup {
        overruns.push(Overrun {
            line: depth_line,
            rule: "complexity.nesting",
            message: format!("nested {depth} levels deep, over the budget of {MAX_DEPTH}"),
        });
    }

    for (number, line) in lines.iter().enumerate() {
        let Some((name, parameters)) = function_signature(line) else {
            continue;
        };

        let count = parameter_count(&parameters);
        if count > MAX_PARAMETERS {
            overruns.push(Overrun {
                line: number + 1,
                rule: "complexity.parameters",
                message: format!("`{name}` takes {count} parameters — pass an object instead"),
            });
        }

        if !markup
            && let Some(length) = function_length(&lines, number)
            && length > MAX_FUNCTION_LINES
        {
            overruns.push(Overrun {
                line: number + 1,
                rule: "complexity.function",
                message: format!(
                    "`{name}` is {length} lines, over the {MAX_FUNCTION_LINES}-line budget"
                ),
            });
        }
    }

    overruns
}

/// How many lines a function body spans, by following its braces back to zero.
/// A body that never closes — a signature split over several lines — is left
/// alone rather than guessed at.
fn function_length(lines: &[&str], start: usize) -> Option<usize> {
    let mut depth: i64 = 0;
    let mut opened = false;

    for (offset, line) in lines[start..].iter().enumerate() {
        for character in without_string_contents(code_only(line)).chars() {
            match character {
                '{' => {
                    depth += 1;
                    opened = true;
                }
                '}' => depth -= 1,
                _ => {}
            }
        }
        if opened && depth <= 0 {
            return Some(offset + 1);
        }
    }

    None
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let extensions: Vec<&str> = TS_EXTENSIONS
        .iter()
        .chain(RUST_EXTENSIONS)
        .chain(PYTHON_EXTENSIONS)
        .copied()
        .collect();

    let mut warnings = Vec::new();
    let mut counted = 0;

    for module in &modules {
        for path in collect_files(&module.dir.join("src"), &extensions, 10) {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            counted += 1;
            let label = relative(root, &path);
            let markup = path.extension().and_then(|extension| extension.to_str()) == Some("tsx");
            for overrun in inspect(&content, markup) {
                warnings.push(format!(
                    "{label}:{}  {}  {}",
                    overrun.line, overrun.rule, overrun.message
                ));
            }
        }
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Complexity,
            CheckStatus::Skipped,
            "no source file to measure",
        );
    }

    let scope = format!("{counted} file{}", if counted == 1 { "" } else { "s" });

    static_outcome(
        CheckId::Complexity,
        &scope,
        "every file is within budget",
        Vec::new(),
        warnings,
    )
    .with_hint("Split the file, extract the branch, or take an options object")
}
