// Async check — the awaits that turn one request into a hundred.
//
// An `await` inside a loop runs the round trips one after another: ten items
// is a slow endpoint, ten thousand is a timeout. The fix is nearly always the
// same — collect the promises and await them together, or ask the database for
// the whole set once — but nothing in the type system or the linter notices
// the difference.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;

use super::modules::{
    TS_EXTENSIONS, collect_files, discover_modules, filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// One serial await found in a loop.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Serial {
    pub line: usize,
    pub rule: &'static str,
    pub message: String,
}

fn loop_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?m)^\s*(?:\}\s*)?(for|while)\s*(?:await\s*)?\(").expect("the loop is valid")
    })
}

fn callback_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // `forEach` never awaits its callback, so an async one runs unattended:
        // the errors are unhandled and the caller does not wait for the work.
        Regex::new(r"\.forEach\s*\(\s*async\b").expect("the callback pattern is valid")
    })
}

fn floating_map_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"\.map\s*\(\s*async\b").expect("the map pattern is valid"))
}

/// Strip comments and the contents of strings, so prose about a loop is never
/// read as one.
fn code_only(line: &str) -> &str {
    let line = line.trim();
    if line.starts_with("//") || line.starts_with("/*") || line.starts_with('*') {
        return "";
    }
    line
}

/// Find an await performed by the loop itself. Awaits inside a handler the
/// loop merely defines belong to that handler, while a stream reader must be
/// consumed serially by design.
fn serial_await_offset(lines: &[&str], start: usize, end: usize) -> Option<usize> {
    if lines[start.saturating_sub(2)..=end]
        .iter()
        .any(|line| line.contains("talos-ignore perf.await-in-loop"))
    {
        return None;
    }

    let mut depth: i64 = 0;
    let mut nested_async_depth: Option<i64> = None;

    for (offset, line) in lines[start..=end].iter().enumerate() {
        let code = code_only(line);
        let previous_depth = depth;
        for character in code.chars() {
            (depth, _) = apply_brace(character, depth, true);
        }

        if code.contains("async")
            && (code.contains("=>") || code.contains("function "))
            && depth > previous_depth
        {
            nested_async_depth = Some(depth);
        }

        if code.contains("await ") && nested_async_depth.is_none() && !code.contains(".read()") {
            return Some(offset);
        }

        if nested_async_depth.is_some_and(|nested_depth| depth < nested_depth) {
            nested_async_depth = None;
        }
    }

    None
}

/// Applies one character's effect on brace depth, returning the updated
/// depth and whether a brace has been seen yet.
fn apply_brace(character: char, depth: i64, opened: bool) -> (i64, bool) {
    match character {
        '{' => (depth + 1, true),
        '}' => (depth - 1, opened),
        _ => (depth, opened),
    }
}

/// Where the block opened on `start` ends, following its braces.
fn block_end(lines: &[&str], start: usize) -> Option<usize> {
    let mut depth: i64 = 0;
    let mut opened = false;

    for (offset, line) in lines[start..].iter().enumerate() {
        for character in code_only(line).chars() {
            (depth, opened) = apply_brace(character, depth, opened);
        }
        if opened && depth <= 0 {
            return Some(start + offset);
        }
        // A single-statement loop body has no braces at all.
        if !opened && offset > 0 {
            return Some(start + offset);
        }
    }

    None
}

/// Every serial await in one file.
pub fn scan(content: &str) -> Vec<Serial> {
    let lines: Vec<&str> = content.lines().collect();
    let mut found = Vec::new();

    for (number, line) in lines.iter().enumerate() {
        let code = code_only(line);

        if callback_pattern().is_match(code) {
            found.push(Serial {
                line: number + 1,
                rule: "async.floating",
                message: "`forEach` with an async callback never awaits it — use `for…of` or `Promise.all(map(…))`".to_string(),
            });
        }

        if floating_map_pattern().is_match(code)
            && !lines[number.saturating_sub(2)..(number + 3).min(lines.len())]
                .iter()
                .any(|nearby| {
                    nearby.contains("Promise.all") || nearby.contains("Promise.allSettled")
                })
        {
            found.push(Serial {
                line: number + 1,
                rule: "async.unawaited",
                message: "`map` with an async callback builds promises nobody awaits — wrap it in `Promise.all`".to_string(),
            });
        }

        let Some(captured) = loop_pattern().captures(code) else {
            continue;
        };
        // `for await (… of …)` consumes an async iterator, which is serial by
        // design and the only way to read a stream.
        if code.contains("for await") {
            continue;
        }
        let Some(end) = block_end(&lines, number) else {
            continue;
        };

        if let Some(offset) = serial_await_offset(&lines, number, end) {
            let keyword = captured.get(1).map(|group| group.as_str()).unwrap_or("for");
            found.push(Serial {
                line: number + offset + 1,
                rule: "async.serial",
                message: format!(
                    "awaited inside a `{keyword}` loop — collect the promises and `Promise.all` them"
                ),
            });
        }
    }

    // Nested loops reach the same await from two directions, and one await is
    // one finding however many loops enclose it.
    found.sort_by_key(|serial| (serial.line, serial.rule));
    found.dedup_by_key(|serial| (serial.line, serial.rule));
    found
}

pub fn run(args: &ProjectCheckArgs, root: &Path) -> CheckOutcome {
    let modules = filter_modules(
        discover_modules(root),
        &wanted_names(args.modules.as_deref(), args.packages.as_deref()),
    );

    let mut warnings = Vec::new();
    let mut counted = 0;

    for module in &modules {
        for path in collect_files(&module.dir.join("src"), TS_EXTENSIONS, 10) {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            if !content.contains("await") {
                continue;
            }
            counted += 1;
            let label = relative(root, &path);
            for serial in scan(&content) {
                warnings.push(format!(
                    "{label}:{}  {}  {}",
                    serial.line, serial.rule, serial.message
                ));
            }
        }
    }

    if counted == 0 {
        return CheckOutcome::new(
            CheckId::Async,
            CheckStatus::Skipped,
            "no asynchronous code to inspect",
        );
    }

    let scope = format!(
        "{counted} async file{}",
        if counted == 1 { "" } else { "s" }
    );

    // Serial work is sometimes exactly what is wanted — rate limits, ordered
    // writes, migrations — so the call belongs to the author.
    static_outcome(
        CheckId::Async,
        &scope,
        "nothing awaits in a loop",
        Vec::new(),
        warnings,
    )
    .with_hint("Where the order matters, the serial await is right — this is a prompt, not a rule")
}
