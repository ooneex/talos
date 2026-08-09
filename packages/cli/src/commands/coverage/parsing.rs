//! Parsing coverage reports out of bun's console table and `lcov.info` files,
//! plus the small numeric helpers (`percent`, `mean`, `collapse_ranges`) both
//! the runner and the top-level audit share.

use std::collections::BTreeMap;

use super::FileCoverage;

// ---------------------------------------------------------------------------
// Report parsing
// ---------------------------------------------------------------------------

/// What one suite covers, whichever reporter it was read from.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CoverageReport {
    pub lines: f64,
    pub functions: f64,
    pub files: Vec<FileCoverage>,
}

impl PartialEq for FileCoverage {
    fn eq(&self, other: &Self) -> bool {
        self.path == other.path
            && self.lines == other.lines
            && self.functions == other.functions
            && self.uncovered == other.uncovered
    }
}

/// How many tests passed and failed, read from bun's `12 pass` / `1 fail` tally.
pub fn parse_counts(text: &str) -> (usize, usize) {
    let (mut passed, mut failed) = (0usize, 0usize);
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(count), Some(word)) = (parts.next(), parts.next()) else {
            continue;
        };
        // `93 expect() calls` counts assertions, not tests.
        if parts.next().is_some() {
            continue;
        }
        let Ok(count) = count.parse::<usize>() else {
            continue;
        };
        match word {
            "pass" => passed += count,
            "fail" => failed += count,
            _ => {}
        }
    }
    (passed, failed)
}

/// The table `bun test --coverage` prints:
///
/// ```text
/// File              | % Funcs | % Lines | Uncovered Line #s
/// All files         |   83.33 |   99.61 |
///  src/decompose.ts |  100.00 |   97.64 | 152-154
/// ```
pub fn parse_table(text: &str) -> Option<CoverageReport> {
    let mut total: Option<(f64, f64)> = None;
    let mut files: Vec<FileCoverage> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if !trimmed.contains('|') || trimmed.starts_with('-') {
            continue;
        }
        let cells: Vec<&str> = trimmed.split('|').map(str::trim).collect();
        if cells.len() < 3 {
            continue;
        }
        let (Ok(functions), Ok(lines)) = (cells[1].parse::<f64>(), cells[2].parse::<f64>()) else {
            continue;
        };
        if cells[0] == "All files" {
            total = Some((lines, functions));
            continue;
        }
        files.push(FileCoverage {
            path: cells[0].to_string(),
            lines,
            functions,
            uncovered: parse_uncovered(cells.get(3).copied().unwrap_or_default()),
        });
    }

    total.map(|(lines, functions)| CoverageReport {
        lines,
        functions,
        files,
    })
}

/// `152-154, 160` — bun's own ranges, kept as it wrote them.
pub fn parse_uncovered(cell: &str) -> Vec<String> {
    cell.split(',')
        .map(str::trim)
        .filter(|range| !range.is_empty())
        .map(str::to_string)
        .collect()
}

/// An `lcov.info`, for a module whose reporter writes nothing to the terminal.
pub fn parse_lcov(content: &str) -> Option<CoverageReport> {
    let mut files: Vec<FileCoverage> = Vec::new();
    let mut path = String::new();
    let mut hits: BTreeMap<usize, usize> = BTreeMap::new();
    let (mut functions_total, mut functions_hit) = (0usize, 0usize);
    let (mut total_lines, mut covered_lines) = (0usize, 0usize);
    let (mut total_functions, mut covered_functions) = (0usize, 0usize);

    for line in content.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("SF:") {
            path = value.to_string();
        } else if let Some(value) = line.strip_prefix("DA:") {
            let mut parts = value.split(',');
            let (Some(number), Some(count)) = (parts.next(), parts.next()) else {
                continue;
            };
            if let (Ok(number), Ok(count)) = (number.parse::<usize>(), count.parse::<usize>()) {
                hits.insert(number, count);
            }
        } else if let Some(value) = line.strip_prefix("FNF:") {
            functions_total = value.parse().unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("FNH:") {
            functions_hit = value.parse().unwrap_or(0);
        } else if line == "end_of_record" {
            if path.is_empty() {
                continue;
            }
            let covered = hits.values().filter(|count| **count > 0).count();
            let uncovered: Vec<usize> = hits
                .iter()
                .filter(|(_, count)| **count == 0)
                .map(|(number, _)| *number)
                .collect();

            total_lines += hits.len();
            covered_lines += covered;
            total_functions += functions_total;
            covered_functions += functions_hit;

            files.push(FileCoverage {
                path: std::mem::take(&mut path),
                lines: percent(covered, hits.len()),
                functions: percent(functions_hit, functions_total),
                uncovered: collapse_ranges(&uncovered),
            });
            hits.clear();
            functions_total = 0;
            functions_hit = 0;
        }
    }

    if files.is_empty() {
        return None;
    }
    Some(CoverageReport {
        lines: percent(covered_lines, total_lines),
        functions: percent(covered_functions, total_functions),
        files,
    })
}

/// `41 42 43 66` → `41-43`, `66`.
pub fn collapse_ranges(numbers: &[usize]) -> Vec<String> {
    let mut ranges: Vec<String> = Vec::new();
    let mut index = 0usize;
    while index < numbers.len() {
        let start = numbers[index];
        let mut end = start;
        while index + 1 < numbers.len() && numbers[index + 1] == end + 1 {
            index += 1;
            end = numbers[index];
        }
        ranges.push(if start == end {
            start.to_string()
        } else {
            format!("{start}-{end}")
        });
        index += 1;
    }
    ranges
}

/// A ratio in percent. Nothing to cover is fully covered.
pub fn percent(covered: usize, total: usize) -> f64 {
    if total == 0 {
        return 100.0;
    }
    covered as f64 * 100.0 / total as f64
}

pub fn mean(values: impl Iterator<Item = f64>) -> f64 {
    let values: Vec<f64> = values.collect();
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}
