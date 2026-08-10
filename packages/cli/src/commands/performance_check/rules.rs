//! The performance rules a symbol is scored against.
//!
//! Every rule here is something that costs more the more data it is given —
//! work that is linear per item inside a loop that is already linear, an
//! `await` that turns a batch into a queue of round trips, a render that
//! rebuilds a value it could have kept. None of it is a syntax error, none of
//! it fails a build, and all of it is invisible until the table it runs over
//! grows.
//!
//! Rules are matched against the masked lines [`super::symbols`] produced, so
//! a pattern is never found in a comment or inside a string literal. The
//! interesting context is whether the line is inside a loop, which is tracked
//! by brace depth as the body is walked: a `.find()` at the top of a method is
//! a lookup, and the same `.find()` one level into a `for` is a quadratic
//! scan.

use std::sync::OnceLock;

use console::style;
use regex::Regex;

use super::symbols::Symbol;

/// Lines a symbol may hold before its cost is hard to reason about.
const MAX_BODY_LINES: usize = 80;

/// How deeply a body may nest before its hot path is impossible to find.
const MAX_NESTING: usize = 5;

/// How far a `useEffect(` call is followed while looking for its dependency
/// array.
const MAX_CALL_LINES: usize = 120;

/// How much a finding costs, and how loudly it is reported.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Low,
    Moderate,
    High,
    Critical,
}

impl Severity {
    /// The points a symbol loses the first time a rule of this severity fires.
    pub fn weight(self) -> f64 {
        match self {
            Severity::Critical => 40.0,
            Severity::High => 22.0,
            Severity::Moderate => 10.0,
            Severity::Low => 4.0,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Severity::Critical => "critical",
            Severity::High => "high",
            Severity::Moderate => "moderate",
            Severity::Low => "low",
        }
    }

    /// The glyph a finding is drawn with, coloured by how much it costs.
    pub fn glyph(self) -> String {
        match self {
            Severity::Critical => style("✖").red().bold().to_string(),
            Severity::High => style("✖").red().to_string(),
            Severity::Moderate => style("⚠").yellow().to_string(),
            Severity::Low => style("·").dim().to_string(),
        }
    }

    pub fn styled(self, text: impl AsRef<str>) -> String {
        let text = text.as_ref();
        match self {
            Severity::Critical => style(text).red().bold().to_string(),
            Severity::High => style(text).red().to_string(),
            Severity::Moderate => style(text).yellow().to_string(),
            Severity::Low => style(text).dim().to_string(),
        }
    }

    /// The issue priority the finding maps to under `--issues`.
    pub fn priority(self) -> &'static str {
        match self {
            Severity::Critical => "Urgent",
            Severity::High => "High",
            Severity::Moderate | Severity::Low => "Medium",
        }
    }

    pub fn from_label(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "critical" => Some(Severity::Critical),
            "high" => Some(Severity::High),
            "moderate" | "medium" => Some(Severity::Moderate),
            "low" => Some(Severity::Low),
            _ => None,
        }
    }
}

/// One rule, and what it costs the symbol that trips it.
#[derive(Clone, Copy, Debug)]
pub struct Rule {
    /// `perf.await-in-loop` — how the finding is named in a report line.
    pub id: &'static str,
    pub severity: Severity,
    /// What it costs, in the present tense.
    pub cost: &'static str,
    /// What to do instead.
    pub hint: &'static str,
}

/// One rule tripped once, on one line.
#[derive(Clone, Debug)]
pub struct Finding {
    pub rule: Rule,
    /// 1-based line in the file the symbol was read from.
    pub line: usize,
}

/// Every rule the run applies, in the order they are declared here — which is
/// also the order they are reported in when two land on the same symbol.
pub const RULES: &[Rule] = &[
    Rule {
        id: "perf.query-in-loop",
        severity: Severity::Critical,
        cost: "database call inside a loop — one round trip per item",
        hint: "load the whole set in one query, or batch by id",
    },
    Rule {
        id: "perf.request-in-loop",
        severity: Severity::Critical,
        cost: "network call inside a loop — one request per item",
        hint: "ask for the collection once, or fan out with Promise.all",
    },
    Rule {
        id: "perf.await-in-loop",
        severity: Severity::High,
        cost: "await inside a loop — the round trips run one after another",
        hint: "collect the promises and await them together",
    },
    Rule {
        id: "perf.nested-loop",
        severity: Severity::High,
        cost: "loop nested in a loop — the work is quadratic in the input",
        hint: "index one side into a Map and look it up",
    },
    Rule {
        id: "perf.scan-in-loop",
        severity: Severity::High,
        cost: "linear scan inside a loop — every item walks the whole list",
        hint: "build a Map or Set before the loop and look up in it",
    },
    Rule {
        id: "perf.sort-in-loop",
        severity: Severity::High,
        cost: "sort inside a loop — the list is re-ordered every iteration",
        hint: "sort once, before the loop",
    },
    Rule {
        id: "perf.copy-in-loop",
        severity: Severity::High,
        cost: "the accumulator is rebuilt every iteration — quadratic copying",
        hint: "push into the accumulator instead of spreading it",
    },
    Rule {
        id: "perf.sync-io",
        severity: Severity::High,
        cost: "synchronous file or process call — it blocks the event loop",
        hint: "use the promise-based API and await it",
    },
    Rule {
        id: "perf.sync-crypto",
        severity: Severity::High,
        cost: "synchronous hashing — it blocks the event loop for milliseconds",
        hint: "use the async variant of the same call",
    },
    Rule {
        id: "perf.effect-without-deps",
        severity: Severity::High,
        cost: "effect with no dependency array — it runs after every render",
        hint: "pass the dependencies the effect actually reads",
    },
    Rule {
        id: "perf.regex-in-loop",
        severity: Severity::Moderate,
        cost: "regex compiled inside a loop",
        hint: "compile it once, outside the loop",
    },
    Rule {
        id: "perf.json-in-loop",
        severity: Severity::Moderate,
        cost: "JSON parsed or serialised inside a loop",
        hint: "move the conversion out, or work on the parsed value",
    },
    Rule {
        id: "perf.dom-query-in-loop",
        severity: Severity::Moderate,
        cost: "DOM query inside a loop",
        hint: "query once and reuse the node",
    },
    Rule {
        id: "perf.layout-thrash",
        severity: Severity::Moderate,
        cost: "layout read inside a loop — it forces a reflow per iteration",
        hint: "read every measurement first, then write",
    },
    Rule {
        id: "perf.list-index-key",
        severity: Severity::Moderate,
        cost: "list keyed by index — every insert re-renders the tail",
        hint: "key by a stable id from the item",
    },
    Rule {
        id: "perf.chained-iteration",
        severity: Severity::Low,
        cost: "three or more passes chained over the same list",
        hint: "do the work in one reduce, or filter before you map",
    },
    Rule {
        id: "perf.inline-jsx-prop",
        severity: Severity::Low,
        cost: "a fresh object or array is passed as a prop on every render",
        hint: "hoist it, or memoise it with useMemo",
    },
    Rule {
        id: "perf.deep-nesting",
        severity: Severity::Low,
        cost: "nested past the point where the hot path is readable",
        hint: "return early, or extract the inner block",
    },
    Rule {
        id: "perf.long-body",
        severity: Severity::Low,
        cost: "long enough that what it costs cannot be read off it",
        hint: "split it along what it actually does",
    },
    Rule {
        id: "perf.delete-operator",
        severity: Severity::Low,
        cost: "`delete` changes the object's shape and deoptimises access to it",
        hint: "set the property to undefined, or rebuild without it",
    },
];

pub fn rule(id: &str) -> Rule {
    *RULES
        .iter()
        .find(|rule| rule.id == id)
        .expect("every rule fired is declared in RULES")
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

fn pattern(source: &'static str) -> Regex {
    Regex::new(source).expect("the rule pattern is valid")
}

/// `for`, `for await`, `while` and `do` — the loops the body's own syntax
/// declares.
fn loop_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"(?:^|[^\w$.])(?:for\s*(?:await\s+)?\(|while\s*\(|do\s*\{)"))
}

/// `.map((item) => {` — a callback that opens a block is a loop body too, and
/// the same rules apply inside it.
fn callback_loop_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"\.(?:forEach|map|filter|flatMap|reduce|reduceRight|some|every|find|findIndex|sort)\s*\(\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*$",
        )
    })
}

fn for_await_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"(?:^|[^\w$.])for\s+await\s*\("))
}

fn query_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"(?:\.createQueryBuilder\s*\(|\.getRepository\s*\(|\bprisma\.[\w$]+\.[\w$]+\s*\(|[Rr]epository\s*\.\s*[\w$]+\s*\(|[Rr]epo\s*\.\s*[\w$]+\s*\(|\bmanager\s*\.\s*(?:find|save|insert|update|delete|remove|count|query)[\w$]*\s*\(|\.\s*query\s*\()",
        )
    })
}

fn request_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(r"(?:^|[^\w$.])fetch\s*\(|\baxios\s*(?:\.[\w$]+)?\s*\(|\.\s*request\s*\(")
    })
}

fn await_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"(?:^|[^\w$.])await\s"))
}

/// The awaits that are already parallel, and so cost nothing extra in a loop.
fn parallel_await_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"await\s+Promise\s*\.\s*(?:all|allSettled|any|race)\b"))
}

fn scan_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"\.(?:find|findIndex|findLast|filter|includes|indexOf|lastIndexOf|some|every)\s*\(",
        )
    })
}

fn sort_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\.(?:sort|toSorted|reverse)\s*\("))
}

/// The accumulator being rebuilt rather than added to.
///
/// `Object.assign(result, part)` and `result.push(item)` are the fix, not the
/// problem — only a fresh target is a copy, so the pattern insists on one.
fn copy_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"=\s*[\[\{]\s*\.\.\.|\.concat\s*\(|Object\.assign\s*\(\s*[\{\[]|\.unshift\s*\(|\.splice\s*\(",
        )
    })
}

fn sync_io_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"\b(?:readFileSync|writeFileSync|appendFileSync|readdirSync|statSync|lstatSync|existsSync|mkdirSync|rmSync|rmdirSync|unlinkSync|copyFileSync|execSync|execFileSync|spawnSync)\s*\(",
        )
    })
}

fn sync_crypto_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(r"\b(?:hashSync|compareSync|genSaltSync|pbkdf2Sync|scryptSync|randomFillSync)\s*\(")
    })
}

fn regex_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\bnew\s+RegExp\s*\("))
}

fn json_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\bJSON\s*\.\s*(?:parse|stringify)\s*\("))
}

fn dom_query_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(r"\bdocument\s*\.\s*(?:querySelectorAll|querySelector|getElementById|getElementsBy[\w$]+)\s*\(")
    })
}

fn layout_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(
            r"\.(?:getBoundingClientRect\s*\(|offsetWidth|offsetHeight|offsetTop|offsetLeft|clientWidth|clientHeight|scrollWidth|scrollHeight)\b",
        )
    })
}

fn iteration_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        pattern(r"\.(?:map|filter|reduce|flatMap|flat|forEach|sort|slice|concat|reverse)\s*\(")
    })
}

fn effect_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\b(?:useEffect|useLayoutEffect)\s*\("))
}

fn index_key_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\bkey\s*=\s*\{\s*(?:i|idx|index|position)\s*\}"))
}

/// A JSX attribute whose value is built fresh on every render.
fn inline_prop_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"\s([A-Za-z_][\w-]*)\s*=\s*\{\s*([\{\[])"))
}

fn delete_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| pattern(r"(?:^|[^\w$.])delete\s+[\w$]+\s*[.\[]"))
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/// How deep in loops and braces the walk currently is.
struct Nesting {
    depth: i64,
    /// The brace depth each open loop's body started at.
    loops: Vec<i64>,
    deepest: usize,
}

impl Nesting {
    fn new() -> Self {
        Self {
            depth: 0,
            loops: Vec::new(),
            deepest: 0,
        }
    }

    /// Advance past one line, opening a loop body when the line declared a
    /// loop and left a block open behind it.
    ///
    /// The body is whatever depth the line ends on, not the first brace it
    /// holds: `for (const { id } of rows) {` opens and closes a brace inside
    /// its own header, and a loop opened on that one would be closed again
    /// before its body ever started.
    fn advance(&mut self, line: &str, opens_loop: bool) {
        let start = self.depth;

        for character in line.chars() {
            match character {
                '{' => {
                    self.depth += 1;
                    self.deepest = self.deepest.max(self.depth as usize);
                }
                '}' => {
                    self.depth = (self.depth - 1).max(0);
                    while self.loops.last().is_some_and(|open| *open > self.depth) {
                        self.loops.pop();
                    }
                }
                _ => {}
            }
        }

        if opens_loop && self.depth > start {
            self.loops.push(self.depth);
        }
    }
}

/// Whether the `useEffect(` opening at `(offset, column)` is given a
/// dependency argument at all.
///
/// What is looked for is the argument, not an array literal: a hook that
/// closes on `}, deps)` has declared its dependencies just as much as one that
/// closes on `}, [id])`, and only a call that ends on `})` runs unguarded. So
/// the scan runs to the matching `)` and asks whether anything followed a
/// comma at the call's own argument level — a comma inside the effect body,
/// inside the array, or inside another call is somebody else's.
fn has_dependencies(body: &[(usize, String)], offset: usize, column: usize) -> bool {
    let mut paren = 0i64;
    let mut other = 0i64;
    let mut separated = false;

    for (index, (_, text)) in body.iter().enumerate().skip(offset).take(MAX_CALL_LINES) {
        let from = if index == offset { column } else { 0 };
        for (position, character) in text.char_indices() {
            if position < from {
                continue;
            }
            match character {
                '(' => paren += 1,
                ')' if paren == 1 && other == 0 => return separated,
                ')' => paren -= 1,
                '{' | '[' => other += 1,
                '}' | ']' => other -= 1,
                ',' if paren == 1 && other == 0 => separated = true,
                _ if separated && !character.is_whitespace() => return true,
                _ => {}
            }
        }
    }

    // An unbalanced call is not evidence of a missing argument.
    true
}

/// Whether a loop declared on a line also holds its body on it: written
/// without braces at all (`for (…) doThing();`), or with the block opened and
/// closed around the body (`for (…) { doThing(); }`).
///
/// The balance is read off the whole line rather than the text after the
/// header, so a destructured binding — `for (const { id } of rows) {` — is
/// never mistaken for a body that opened and closed.
fn inline_body(line: &str) -> bool {
    let delta = line.chars().fold(0i64, |depth, character| match character {
        '{' => depth + 1,
        '}' => depth - 1,
        _ => depth,
    });
    !line.contains('{') || delta <= 0
}

/// Every rule one symbol trips.
///
/// A class trips none of its own — it carries no lines, because its cost is
/// the cost of its methods and those are scored separately.
pub fn inspect(symbol: &Symbol, markup: bool) -> Vec<Finding> {
    let mut findings: Vec<Finding> = Vec::new();
    let mut nesting = Nesting::new();

    for (offset, (number, text)) in symbol.body.iter().enumerate() {
        let number = *number;
        let statements = loop_pattern().find_iter(text).count();
        let statement_loop = statements > 0;
        let callback_loop = callback_loop_pattern().is_match(text);
        let opens_loop = statement_loop || callback_loop;
        let inside = !nesting.loops.is_empty();
        // A loop written on one line carries its own body, so the rules read
        // that line as being inside it. Every other loop's body starts on the
        // lines below, where the walk will have opened it.
        let in_loop = inside || (statement_loop && inline_body(text));

        let mut hit = |id: &str| {
            findings.push(Finding {
                rule: rule(id),
                line: number,
            });
        };

        // Two loop headers on one line nest by construction — there is
        // nowhere else for the second one to be.
        if opens_loop && (inside || statements > 1) {
            hit("perf.nested-loop");
        }

        if in_loop {
            if query_pattern().is_match(text) {
                hit("perf.query-in-loop");
            }
            if request_pattern().is_match(text) {
                hit("perf.request-in-loop");
            }
            if await_pattern().is_match(text)
                && !parallel_await_pattern().is_match(text)
                && !for_await_pattern().is_match(text)
            {
                hit("perf.await-in-loop");
            }
            if scan_pattern().is_match(text) {
                hit("perf.scan-in-loop");
            }
            if sort_pattern().is_match(text) {
                hit("perf.sort-in-loop");
            }
            if copy_pattern().is_match(text) {
                hit("perf.copy-in-loop");
            }
            if regex_pattern().is_match(text) {
                hit("perf.regex-in-loop");
            }
            if json_pattern().is_match(text) {
                hit("perf.json-in-loop");
            }
            if dom_query_pattern().is_match(text) {
                hit("perf.dom-query-in-loop");
            }
            if layout_pattern().is_match(text) {
                hit("perf.layout-thrash");
            }
        }

        if sync_io_pattern().is_match(text) {
            hit("perf.sync-io");
        }
        if sync_crypto_pattern().is_match(text) {
            hit("perf.sync-crypto");
        }
        if delete_pattern().is_match(text) {
            hit("perf.delete-operator");
        }
        if iteration_pattern().find_iter(text).count() >= 3 {
            hit("perf.chained-iteration");
        }

        if let Some(found) = effect_pattern().find(text)
            && !has_dependencies(&symbol.body, offset, found.end() - 1)
        {
            hit("perf.effect-without-deps");
        }

        if markup {
            if index_key_pattern().is_match(text) {
                hit("perf.list-index-key");
            }
            if inline_prop_pattern()
                .captures_iter(text)
                .any(|captured| !is_handler(&captured[1]))
            {
                hit("perf.inline-jsx-prop");
            }
        }

        nesting.advance(text, opens_loop);
    }

    if !symbol.body.is_empty() {
        if nesting.deepest > MAX_NESTING {
            findings.push(Finding {
                rule: rule("perf.deep-nesting"),
                line: symbol.line,
            });
        }
        if symbol.span() > MAX_BODY_LINES {
            findings.push(Finding {
                rule: rule("perf.long-body"),
                line: symbol.line,
            });
        }
    }

    findings
}

/// `onClick`, `onSubmit` — an event handler is a fresh function every render
/// by construction, and saying so on every button in the workspace would bury
/// the props that can actually be hoisted.
fn is_handler(attribute: &str) -> bool {
    let mut characters = attribute.chars();
    characters.next() == Some('o')
        && characters.next() == Some('n')
        && characters.next().is_some_and(char::is_uppercase)
}

/// What a symbol scores out of 100, given everything it tripped.
///
/// A rule costs its weight the first time it fires and a quarter of it every
/// time after, capped at twice the weight: ten awaits in one loop is one
/// problem worth reporting once, not ten symbols' worth of penalty.
pub fn score(findings: &[Finding]) -> f64 {
    let mut penalty = 0.0;

    for rule in RULES {
        let count = findings
            .iter()
            .filter(|finding| finding.rule.id == rule.id)
            .count();
        if count == 0 {
            continue;
        }
        let repeats = (1.0 + 0.25 * (count - 1) as f64).min(2.0);
        penalty += rule.severity.weight() * repeats;
    }

    (100.0 - penalty).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::super::symbols::extract;
    use super::*;

    fn findings_for(source: &str, markup: bool) -> Vec<Finding> {
        extract(source)
            .iter()
            .filter(|symbol| symbol.is_leaf())
            .flat_map(|symbol| inspect(symbol, markup))
            .collect()
    }

    fn ids(source: &str, markup: bool) -> Vec<&'static str> {
        let mut ids: Vec<&'static str> = findings_for(source, markup)
            .iter()
            .map(|finding| finding.rule.id)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    }

    #[test]
    fn an_await_and_a_repository_call_in_a_loop_are_both_reported() {
        let ids = ids(
            "\
export const sync = async (ids: string[]) => {
  for (const id of ids) {
    await this.userRepository.findOne(id);
  }
};
",
            false,
        );

        assert!(ids.contains(&"perf.await-in-loop"));
        assert!(ids.contains(&"perf.query-in-loop"));
    }

    #[test]
    fn the_same_calls_outside_a_loop_are_left_alone() {
        let ids = ids(
            "\
export const sync = async (id: string) => {
  await this.userRepository.findOne(id);
  return id;
};
",
            false,
        );

        assert!(ids.is_empty());
    }

    #[test]
    fn a_parallel_await_in_a_loop_is_not_a_serial_round_trip() {
        let ids = ids(
            "\
export const sync = async (batches: string[][]) => {
  for (const batch of batches) {
    await Promise.all(batch.map((id) => load(id)));
  }
};
",
            false,
        );

        assert!(!ids.contains(&"perf.await-in-loop"));
    }

    #[test]
    fn a_loop_inside_a_loop_is_quadratic() {
        let ids = ids(
            "\
export const pair = (left: string[], right: string[]) => {
  for (const a of left) {
    for (const b of right) {
      report(a, b);
    }
  }
};
",
            false,
        );

        assert!(ids.contains(&"perf.nested-loop"));
    }

    #[test]
    fn a_lookup_inside_a_loop_walks_the_whole_list_every_time() {
        let ids = ids(
            "\
export const join = (users: User[], roles: Role[]) => {
  for (const user of users) {
    const role = roles.find((item) => item.id === user.roleId);
    report(role);
  }
};
",
            false,
        );

        assert!(ids.contains(&"perf.scan-in-loop"));
    }

    #[test]
    fn a_callback_body_counts_as_a_loop_but_a_one_line_chain_does_not() {
        let inside = ids(
            "\
export const run = (items: Item[]) => {
  items.forEach((item) => {
    JSON.parse(item.raw);
  });
};
",
            false,
        );
        assert!(inside.contains(&"perf.json-in-loop"));

        let chained = ids(
            "\
export const run = (items: Item[]) => {
  return items.map((item) => item.id);
};
",
            false,
        );
        assert!(!chained.contains(&"perf.json-in-loop"));
        assert!(!chained.contains(&"perf.scan-in-loop"));
    }

    #[test]
    fn a_loop_written_on_one_line_still_carries_its_body() {
        // Both forms hold the body on the header's own line: braced and
        // closed, and braceless.
        let braced = ids(
            "export const a = async (ids: string[]) => { for (const id of ids) { await fetch(id); } };\n",
            false,
        );
        assert!(braced.contains(&"perf.await-in-loop"));
        assert!(braced.contains(&"perf.request-in-loop"));

        let bare = ids(
            "export const b = (xs: string[], ys: string[]) => { for (const x of xs) ys.find((y) => y === x); };\n",
            false,
        );
        assert!(bare.contains(&"perf.scan-in-loop"));
    }

    #[test]
    fn two_loop_headers_on_one_line_nest_by_construction() {
        let ids = ids(
            "export const pair = (xs: string[], ys: string[]) => { for (const x of xs) { for (const y of ys) { report(x, y); } } };\n",
            false,
        );

        assert!(ids.contains(&"perf.nested-loop"));
    }

    #[test]
    fn a_destructured_binding_does_not_read_as_a_body_that_already_closed() {
        // `for (const { id } of rows) {` balances a brace inside its own
        // header — the body is still on the lines below, and the header line
        // itself is not in the loop.
        let symbols = extract(
            "\
export const load = async (rows: Row[]) => {
  const seen = rows.filter((row) => row.id);
  for (const { id } of rows) {
    await fetch(id);
  }
};
",
        );
        let findings = inspect(&symbols[0], false);
        let scans: Vec<usize> = findings
            .iter()
            .filter(|finding| finding.rule.id == "perf.scan-in-loop")
            .map(|finding| finding.line)
            .collect();

        // The `.filter()` on line 2 sits above the loop, so nothing flags it.
        assert!(scans.is_empty());
        assert!(
            findings
                .iter()
                .any(|finding| finding.rule.id == "perf.await-in-loop" && finding.line == 4)
        );
    }

    #[test]
    fn a_synchronous_file_read_blocks_wherever_it_is() {
        let ids = ids(
            "\
export const load = () => {
  return readFileSync('a.json', 'utf8');
};
",
            false,
        );

        assert!(ids.contains(&"perf.sync-io"));
    }

    #[test]
    fn an_effect_reports_only_when_it_declares_no_dependencies() {
        let missing = ids(
            "\
export const Panel = () => {
  useEffect(() => {
    load();
  });
  return null;
};
",
            true,
        );
        assert!(missing.contains(&"perf.effect-without-deps"));

        let declared = ids(
            "\
export const Panel = ({ id }: Props) => {
  useEffect(() => {
    load(id);
  }, [id]);
  return null;
};
",
            true,
        );
        assert!(!declared.contains(&"perf.effect-without-deps"));
    }

    #[test]
    fn a_dependency_argument_counts_even_when_it_is_not_an_array_literal() {
        // A hook whose dependencies are computed and passed by name is guarded
        // just as much as one that spells the array out at the call site.
        let ids = ids(
            "\
export const useAutoHeight = (deps: unknown[]) => {
  React.useLayoutEffect(() => {
    setHeight(measure());
    return () => {
      observer.disconnect();
    };
  }, deps);
  return height;
};
",
            true,
        );

        assert!(!ids.contains(&"perf.effect-without-deps"));
    }

    #[test]
    fn an_inline_object_prop_is_reported_but_an_event_handler_is_not() {
        let object = ids(
            "\
export const Row = () => {
  return <Cell config={{ dense: true }} />;
};
",
            true,
        );
        assert!(object.contains(&"perf.inline-jsx-prop"));

        let handler = ids(
            "\
export const Row = () => {
  return <Cell onClick={() => save()} />;
};
",
            true,
        );
        assert!(!handler.contains(&"perf.inline-jsx-prop"));
    }

    #[test]
    fn markup_rules_are_off_for_a_file_that_holds_none() {
        let ids = ids(
            "\
export const Row = () => {
  return build({ key: index });
};
",
            false,
        );

        assert!(!ids.contains(&"perf.list-index-key"));
    }

    #[test]
    fn a_long_deeply_nested_body_is_reported_on_its_declaration_line() {
        let mut source = String::from("export const wide = (items: Item[]) => {\n");
        for depth in 0..7 {
            source.push_str(&format!(
                "{}if (items[{depth}]) {{\n",
                "  ".repeat(depth + 1)
            ));
        }
        for depth in (0..7).rev() {
            source.push_str(&format!("{}}}\n", "  ".repeat(depth + 1)));
        }
        source.push_str("};\n");

        let findings = findings_for(&source, false);
        let deep = findings
            .iter()
            .find(|finding| finding.rule.id == "perf.deep-nesting")
            .expect("the nesting is reported");

        assert_eq!(deep.line, 1);
    }

    #[test]
    fn a_class_carries_no_findings_of_its_own() {
        let symbols = extract(
            "\
export class Service {
  public run(items: string[]): void {
    for (const item of items) {
      JSON.parse(item);
    }
  }
}
",
        );
        let class = &symbols[0];

        assert!(inspect(class, false).is_empty());
        assert!(!inspect(&symbols[1], false).is_empty());
    }

    #[test]
    fn score_falls_with_severity_and_flattens_as_a_rule_repeats() {
        let critical = rule("perf.query-in-loop");
        let one = score(&[Finding {
            rule: critical,
            line: 1,
        }]);
        let two = score(&[
            Finding {
                rule: critical,
                line: 1,
            },
            Finding {
                rule: critical,
                line: 2,
            },
        ]);

        assert_eq!(one, 60.0);
        assert_eq!(two, 50.0);
        assert_eq!(score(&[]), 100.0);
    }

    #[test]
    fn score_never_falls_below_zero() {
        let findings: Vec<Finding> = RULES
            .iter()
            .map(|rule| Finding {
                rule: *rule,
                line: 1,
            })
            .collect();

        assert_eq!(score(&findings), 0.0);
    }

    #[test]
    fn severity_parses_the_labels_the_flag_accepts() {
        assert_eq!(Severity::from_label("HIGH"), Some(Severity::High));
        assert_eq!(Severity::from_label("medium"), Some(Severity::Moderate));
        assert_eq!(Severity::from_label("nonsense"), None);
        assert!(Severity::Critical > Severity::Low);
    }
}
