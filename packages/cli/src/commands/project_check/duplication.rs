// Duplication check — the same block of code, written more than once.
//
// Copy-paste is invisible to every other check here: both copies are short
// enough, both are within budget, both compile. It only shows up later, when a
// fix lands in one of them and not the other. This walks the sources looking
// for runs of identical significant lines that appear in more than one place,
// and warns rather than fails — merging two blocks is a judgement call, and
// the answer is sometimes to leave them apart.

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;

use super::modules::{
    PYTHON_EXTENSIONS, RUST_EXTENSIONS, TS_EXTENSIONS, collect_files, discover_modules,
    filter_modules, relative, wanted_names,
};
use crate::commands::project_check::{
    CheckId, CheckOutcome, CheckStatus, ProjectCheckArgs, static_outcome,
};

/// Significant lines a run has to span before it is worth extracting.
///
/// Below this every codebase reports its own idioms back at it: a constructor
/// taking the same three injections, a switch arm doing the obvious thing.
const MIN_BLOCK_LINES: usize = 12;

/// Characters those lines have to carry between them, so a run of short lines
/// — a long object literal, a list of re-exports — is not read as a clone.
const MIN_BLOCK_CHARS: usize = 240;

/// Directories whose contents are written by a generator or by hand from a
/// fixed template, where two files looking alike is the point rather than a
/// finding. An icon set is the extreme case: thousands of files that are the
/// same wrapper around a different path.
const GENERATED_DIRS: [&str; 4] = ["/migrations/", "/seeds/", "/__generated__/", "/icons/"];

/// File endings carrying generated output — a route tree, an emitted client, a
/// declaration file.
const GENERATED_SUFFIXES: [&str; 3] = [".gen.ts", ".gen.tsx", ".d.ts"];

/// One place a duplicated block was found.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Occurrence {
    pub file: String,
    /// Line the block starts on in the original file.
    pub line: usize,
}

/// A block of code that appears in more than one place.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Duplicate {
    /// Significant lines the block spans.
    pub lines: usize,
    /// Where it was found, first occurrence first.
    pub occurrences: Vec<Occurrence>,
}

/// A line worth comparing: its number in the original file, and the text with
/// its formatting flattened away.
type Unit = (usize, String);

/// The line without the comment trailing it.
///
/// Quotes are tracked while scanning so the `//` in a URL stays where it is,
/// and a comment a copy picked up along the way does not stop it matching the
/// code it was copied from.
fn code_only(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut quote: Option<u8> = None;
    let mut escaped = false;

    for offset in 0..bytes.len() {
        let character = bytes[offset];
        match quote {
            Some(open) => {
                if escaped {
                    escaped = false;
                } else if character == b'\\' {
                    escaped = true;
                } else if character == open {
                    quote = None;
                }
            }
            None => {
                if matches!(character, b'"' | b'\'' | b'`') {
                    quote = Some(character);
                } else if character == b'/' && bytes.get(offset + 1) == Some(&b'/') {
                    return &line[..offset];
                }
            }
        }
    }

    line
}

/// Whether a line carries logic, or is only there to hold the file together.
///
/// Comments, imports and lines made of nothing but punctuation are dropped:
/// they match everywhere, and matching on them would make every closing brace
/// part of a clone.
fn significant_line(line: &str) -> Option<String> {
    let trimmed = code_only(line).trim();

    if trimmed.is_empty()
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.starts_with('#')
        || trimmed.starts_with("import ")
        || trimmed.starts_with("use ")
        || trimmed.starts_with("export {")
        || trimmed.starts_with("export * from")
        || trimmed.contains("} from ")
    {
        return None;
    }

    if trimmed
        .chars()
        .all(|character| "{}()[];,<>".contains(character))
    {
        return None;
    }

    // Formatting is not the thing being compared, so two blocks that differ
    // only in how they wrapped still count as the same block.
    Some(trimmed.split_whitespace().collect::<Vec<_>>().join(" "))
}

/// Every line of a file worth comparing, in order.
pub fn significant(content: &str) -> Vec<Unit> {
    content
        .lines()
        .enumerate()
        .filter_map(|(number, line)| significant_line(line).map(|text| (number + 1, text)))
        .collect()
}

fn fingerprint(units: &[Unit], start: usize, length: usize) -> u64 {
    let mut hasher = DefaultHasher::new();
    for (_, text) in &units[start..start + length] {
        text.hash(&mut hasher);
    }
    hasher.finish()
}

/// Whether two runs hold the same text, which is what makes a hash match real.
fn identical(left: &[Unit], left_start: usize, right: &[Unit], right_start: usize) -> bool {
    (0..MIN_BLOCK_LINES).all(|offset| left[left_start + offset].1 == right[right_start + offset].1)
}

fn weight(units: &[Unit], start: usize, length: usize) -> usize {
    units[start..start + length]
        .iter()
        .map(|(_, text)| text.len())
        .sum()
}

fn overlaps(claimed: &[(usize, usize)], start: usize, end: usize) -> bool {
    claimed.iter().any(|&(from, to)| start < to && from < end)
}

/// Shrinks a run's length so that two occurrences of the same repeated block
/// back to back are never merged into one over-long match — the run stops at
/// the gap between them, never below the window they were matched on.
fn clamp_to_nearest_repeat(spots: &[(usize, usize)], length: usize) -> usize {
    let mut length = length;
    for (index, &(spot, spot_start)) in spots.iter().enumerate() {
        for &(other, other_start) in &spots[index + 1..] {
            if spot == other {
                length = length.min(other_start.abs_diff(spot_start));
            }
        }
    }
    length
}

/// Every occurrence matching the block starting at `(file, start)`, skipping
/// ones already claimed by an earlier finding or one that overlaps a spot
/// already collected.
fn matching_spots(
    units: &[Vec<Unit>],
    claimed: &[Vec<(usize, usize)>],
    candidates: &[(usize, usize)],
    file: usize,
    start: usize,
) -> Vec<(usize, usize)> {
    let mut spots = vec![(file, start)];
    for &(other, other_start) in candidates {
        if (other, other_start) == (file, start)
            || !identical(&units[file], start, &units[other], other_start)
            || overlaps(&claimed[other], other_start, other_start + MIN_BLOCK_LINES)
            // Two windows of the same repeated block are one copy, not
            // two, so an occurrence overlapping one already taken is
            // left out.
            || spots.iter().any(|&(taken, taken_start)| {
                taken == other
                    && other_start < taken_start + MIN_BLOCK_LINES
                    && taken_start < other_start + MIN_BLOCK_LINES
            })
        {
            continue;
        }
        spots.push((other, other_start));
    }
    spots
}

/// How far a matched block can grow while every occurrence keeps agreeing,
/// staying clear of lines a previous finding already claimed.
fn grow_run(
    units: &[Vec<Unit>],
    claimed: &[Vec<(usize, usize)>],
    spots: &[(usize, usize)],
    file: usize,
    start: usize,
) -> usize {
    let mut length = MIN_BLOCK_LINES;
    while spots
        .iter()
        .all(|&(spot, spot_start)| spot_start + length < units[spot].len())
    {
        let next = &units[file][start + length].1;
        if !spots
            .iter()
            .all(|&(spot, spot_start)| &units[spot][spot_start + length].1 == next)
        {
            break;
        }
        if spots.iter().any(|&(spot, spot_start)| {
            overlaps(&claimed[spot], spot_start, spot_start + length + 1)
        }) {
            break;
        }
        length += 1;
    }
    clamp_to_nearest_repeat(spots, length)
}

/// The duplicate found at `(file, start)`, when its matching occurrences
/// form a block long and heavy enough to report — claiming the lines it
/// covers in every occurrence along the way.
fn duplicate_at(
    units: &[Vec<Unit>],
    claimed: &mut [Vec<(usize, usize)>],
    index: &HashMap<u64, Vec<(usize, usize)>>,
    files: &[(String, String)],
    file: usize,
    start: usize,
) -> Option<Duplicate> {
    if overlaps(&claimed[file], start, start + MIN_BLOCK_LINES) {
        return None;
    }
    let candidates = index.get(&fingerprint(&units[file], start, MIN_BLOCK_LINES))?;
    let spots = matching_spots(units, claimed, candidates, file, start);
    if spots.len() < 2 {
        return None;
    }

    let length = grow_run(units, claimed, &spots, file, start);
    if weight(&units[file], start, length) < MIN_BLOCK_CHARS {
        return None;
    }

    for &(spot, spot_start) in &spots {
        claimed[spot].push((spot_start, spot_start + length));
    }

    Some(Duplicate {
        lines: length,
        occurrences: spots
            .iter()
            .map(|&(spot, spot_start)| Occurrence {
                file: files[spot].0.clone(),
                line: units[spot][spot_start].0,
            })
            .collect(),
    })
}

/// Every duplicated block across the given files, keyed by their labels.
///
/// A block is reported once, at its longest: the run is grown while every
/// occurrence keeps matching, and the lines it covers are then claimed so the
/// window one line further along is not reported as a second finding.
pub fn detect(files: &[(String, String)]) -> Vec<Duplicate> {
    let units: Vec<Vec<Unit>> = files
        .iter()
        .map(|(_, content)| significant(content))
        .collect();

    let mut index: HashMap<u64, Vec<(usize, usize)>> = HashMap::new();
    for (file, lines) in units.iter().enumerate() {
        for start in 0..lines.len().saturating_sub(MIN_BLOCK_LINES - 1) {
            index
                .entry(fingerprint(lines, start, MIN_BLOCK_LINES))
                .or_default()
                .push((file, start));
        }
    }

    let mut claimed: Vec<Vec<(usize, usize)>> = vec![Vec::new(); units.len()];
    let mut duplicates = Vec::new();

    for file in 0..units.len() {
        for start in 0..units[file].len().saturating_sub(MIN_BLOCK_LINES - 1) {
            if let Some(duplicate) = duplicate_at(&units, &mut claimed, &index, files, file, start)
            {
                duplicates.push(duplicate);
            }
        }
    }

    duplicates
}

/// Whether a file is written by a tool rather than by hand, in which case two
/// of them agreeing line for line is the generator working.
fn generated(label: &str) -> bool {
    GENERATED_DIRS
        .iter()
        .any(|directory| label.contains(directory))
        || GENERATED_SUFFIXES
            .iter()
            .any(|suffix| label.ends_with(suffix))
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

    let mut files = Vec::new();
    for module in &modules {
        for path in collect_files(&module.dir.join("src"), &extensions, 10) {
            let label = relative(root, &path);
            if generated(&label) {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            files.push((label, content));
        }
    }

    if files.is_empty() {
        return CheckOutcome::new(
            CheckId::Duplication,
            CheckStatus::Skipped,
            "no source file to compare",
        );
    }

    let warnings: Vec<String> = detect(&files)
        .into_iter()
        .map(|duplicate| {
            let (first, rest) = duplicate.occurrences.split_first().expect("an occurrence");
            let elsewhere: Vec<String> = rest
                .iter()
                .map(|occurrence| format!("{}:{}", occurrence.file, occurrence.line))
                .collect();
            format!(
                "{}:{}  duplication.block  {} lines repeated at {}",
                first.file,
                first.line,
                duplicate.lines,
                elsewhere.join(", ")
            )
        })
        .collect();

    let scope = format!(
        "{} file{}",
        files.len(),
        if files.len() == 1 { "" } else { "s" }
    );

    static_outcome(
        CheckId::Duplication,
        &scope,
        "no block written twice",
        Vec::new(),
        warnings,
    )
    .with_hint(
        "Extract the block into a shared function, or move it behind the module that owns it",
    )
}
