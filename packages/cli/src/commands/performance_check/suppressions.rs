//! Inline suppressions — `// talos-ignore perf.await-in-loop: reason`.
//!
//! Every rule in [`super::rules`] is a line-level pattern, and a pattern
//! cannot tell a round trip that could have been batched from one that had to
//! wait: a saga runs its steps in order because each one depends on the last,
//! and `Promise.all` over them would not be faster, it would be wrong. So the
//! rules stay blunt and the exception is written down next to the code, the
//! same way `biome-ignore` is.
//!
//! A directive silences one named rule, needs a reason, and covers the
//! statement it sits above — the whole block, when that statement opens one.
//! Nothing here silences a rule file-wide: a suppression that outlives the
//! line it was written for is how a real finding goes unread.

use std::sync::OnceLock;

use regex::Regex;

use super::rules::{Finding, RULES};

/// One directive: the rule it silences, and the lines it covers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Suppression {
    /// The rule id, as declared in [`RULES`].
    pub rule: String,
    /// Why the exception is justified — required, and kept for the report.
    pub reason: String,
    /// 1-based inclusive line range the directive covers.
    pub from: usize,
    pub to: usize,
}

impl Suppression {
    fn covers(&self, finding: &Finding) -> bool {
        self.rule == finding.rule.id && finding.line >= self.from && finding.line <= self.to
    }
}

/// `// talos-ignore perf.await-in-loop: transitions run in order`, in a line
/// comment or a one-line block comment.
///
/// The reason is part of the pattern rather than checked afterwards, so a
/// directive written without one silences nothing and the finding stays in
/// the report — a suppression whose justification nobody had to type is the
/// one nobody reads.
fn directive_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?://|/\*)\s*talos-ignore\s+([A-Za-z0-9_.-]+)\s*:\s*(\S[^*]*?)\s*(?:\*/)?\s*$")
            .expect("the directive pattern is valid")
    })
}

/// Every directive in a file, read off the raw source.
///
/// The source is read unmasked — [`super::symbols::mask`] blanks comments to
/// spaces, so by the time the rules see a line the directive is gone — and
/// the extents are measured on the masked copy, where a brace inside a string
/// can no longer close a block that never opened.
pub fn collect(content: &str, code: &[String]) -> Vec<Suppression> {
    content
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let captured = directive_pattern().captures(line)?;
            let rule = captured.get(1)?.as_str();
            // An id no rule declares is a typo. It matches no finding either
            // way, and resolving it here keeps the miss out of the report.
            if !RULES.iter().any(|declared| declared.id == rule) {
                return None;
            }
            let anchor = anchor(code, index + 1)?;
            Some(Suppression {
                rule: rule.to_string(),
                reason: captured.get(2)?.as_str().to_string(),
                from: anchor + 1,
                to: block_end(code, anchor) + 1,
            })
        })
        .collect()
}

/// Drop the findings a directive covers, and say how many went.
///
/// The count is what keeps this honest: a suppressed finding stops costing
/// the symbol its score, but the run still reports that the exception was
/// taken rather than letting it disappear.
pub fn apply(findings: Vec<Finding>, suppressions: &[Suppression]) -> (Vec<Finding>, usize) {
    let before = findings.len();
    let kept: Vec<Finding> = findings
        .into_iter()
        .filter(|finding| {
            !suppressions
                .iter()
                .any(|suppression| suppression.covers(finding))
        })
        .collect();
    let suppressed = before - kept.len();

    (kept, suppressed)
}

/// The first line at or after `from` that holds code — the statement the
/// directive was written above. Blank lines and further comments are walked
/// over, so a directive can sit above a doc comment, or under another one.
fn anchor(code: &[String], from: usize) -> Option<usize> {
    code.iter()
        .enumerate()
        .skip(from)
        .find(|(_, line)| !line.trim().is_empty())
        .map(|(index, _)| index)
}

/// The last line the anchored statement covers.
///
/// A statement that opens a block answers for the whole block: the directive
/// above a `for` header is about what runs inside it, not about the header.
/// One that opens nothing covers its own line and no more.
fn block_end(code: &[String], anchor: usize) -> usize {
    let mut depth = 0i64;

    for (index, line) in code.iter().enumerate().skip(anchor) {
        for character in line.chars() {
            match character {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
        }
        // Read at the end of the line, not at the brace: a header like
        // `for (const { id } of rows) {` opens and closes a brace of its own
        // before the body's ever starts.
        if depth <= 0 {
            return index;
        }
    }

    // A block left open by the end of the file is a syntax error somewhere
    // else. Covering the rest of the file on the strength of it would silence
    // far more than was asked for, so the directive keeps its own line.
    anchor
}

#[cfg(test)]
mod tests {
    use super::super::rules::rule;
    use super::super::symbols::mask;
    use super::*;

    fn collected(source: &str) -> Vec<Suppression> {
        collect(source, &mask(source))
    }

    fn finding(id: &str, line: usize) -> Finding {
        Finding {
            rule: rule(id),
            line,
        }
    }

    const SAGA: &str = "\
export const run = async (steps: Step[]): Promise<void> => {
  // talos-ignore perf.await-in-loop: each step depends on the last
  for (const step of steps) {
    await step.start();
    await step.handle();
  }

  for (const step of steps) {
    await step.finish();
  }
};
";

    #[test]
    fn a_directive_covers_the_block_the_statement_below_it_opens() {
        let suppressions = collected(SAGA);

        assert_eq!(suppressions.len(), 1);
        assert_eq!(suppressions[0].rule, "perf.await-in-loop");
        assert_eq!(suppressions[0].reason, "each step depends on the last");
        // The `for` header through its closing brace — lines 3 to 6.
        assert_eq!((suppressions[0].from, suppressions[0].to), (3, 6));
    }

    #[test]
    fn the_findings_inside_the_block_go_and_the_ones_after_it_stay() {
        let suppressions = collected(SAGA);
        let findings = vec![
            finding("perf.await-in-loop", 4),
            finding("perf.await-in-loop", 5),
            finding("perf.await-in-loop", 9),
        ];

        let (kept, suppressed) = apply(findings, &suppressions);

        assert_eq!(suppressed, 2);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].line, 9);
    }

    #[test]
    fn a_directive_silences_only_the_rule_it_names() {
        let suppressions = collected(SAGA);
        let findings = vec![
            finding("perf.await-in-loop", 4),
            finding("perf.query-in-loop", 4),
        ];

        let (kept, suppressed) = apply(findings, &suppressions);

        assert_eq!(suppressed, 1);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].rule.id, "perf.query-in-loop");
    }

    #[test]
    fn a_directive_without_a_reason_silences_nothing() {
        assert!(
            collected(
                "\
// talos-ignore perf.await-in-loop
for (const id of ids) {
  await load(id);
}
"
            )
            .is_empty()
        );

        assert!(
            collected(
                "\
// talos-ignore perf.await-in-loop:
for (const id of ids) {
  await load(id);
}
"
            )
            .is_empty()
        );
    }

    #[test]
    fn a_rule_id_no_rule_declares_silences_nothing() {
        assert!(
            collected(
                "\
// talos-ignore perf.await-in-lop: typo
for (const id of ids) {
  await load(id);
}
"
            )
            .is_empty()
        );
    }

    #[test]
    fn a_statement_that_opens_no_block_is_covered_on_its_own_line() {
        let suppressions = collected(
            "\
const hash = () => {
  // talos-ignore perf.sync-crypto: the digest is 8 bytes of build metadata
  const digest = createHash(\"sha1\").update(source).digest(\"hex\");
  return createHash(\"sha1\").update(digest).digest(\"hex\");
};
",
        );

        assert_eq!((suppressions[0].from, suppressions[0].to), (3, 3));

        let (kept, suppressed) = apply(
            vec![
                finding("perf.sync-crypto", 3),
                finding("perf.sync-crypto", 4),
            ],
            &suppressions,
        );
        assert_eq!(suppressed, 1);
        assert_eq!(kept[0].line, 4);
    }

    #[test]
    fn a_destructured_loop_header_does_not_close_its_own_block() {
        let suppressions = collected(
            "\
// talos-ignore perf.await-in-loop: ordered by construction
for (const { id } of rows) {
  await load(id);
}
",
        );

        assert_eq!((suppressions[0].from, suppressions[0].to), (2, 4));
    }

    #[test]
    fn a_block_comment_directive_reads_the_same_as_a_line_comment() {
        let suppressions = collected(
            "\
/* talos-ignore perf.await-in-loop: ordered by construction */
for (const id of ids) {
  await load(id);
}
",
        );

        assert_eq!(suppressions.len(), 1);
        assert_eq!(suppressions[0].reason, "ordered by construction");
        assert_eq!((suppressions[0].from, suppressions[0].to), (2, 4));
    }

    #[test]
    fn blank_lines_and_comments_between_the_directive_and_the_statement_are_walked_over() {
        let suppressions = collected(
            "\
// talos-ignore perf.await-in-loop: ordered by construction

// Every step hands its output to the next one.
for (const id of ids) {
  await load(id);
}
",
        );

        assert_eq!((suppressions[0].from, suppressions[0].to), (4, 6));
    }

    #[test]
    fn a_brace_inside_a_string_never_closes_the_block_early() {
        let suppressions = collected(
            "\
// talos-ignore perf.await-in-loop: ordered by construction
for (const id of ids) {
  await log(\"}\");
  await load(id);
}
",
        );

        assert_eq!((suppressions[0].from, suppressions[0].to), (2, 5));
    }

    #[test]
    fn a_directive_with_nothing_below_it_covers_nothing() {
        assert!(collected("// talos-ignore perf.await-in-loop: nothing follows\n").is_empty());
    }

    #[test]
    fn an_unclosed_block_keeps_the_directive_to_its_own_line() {
        let suppressions = collected(
            "\
// talos-ignore perf.await-in-loop: ordered by construction
for (const id of ids) {
  await load(id);
",
        );

        assert_eq!((suppressions[0].from, suppressions[0].to), (2, 2));
    }
}
