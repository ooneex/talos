//! The duplication check — copy-pasted blocks, and the things that only look
//! like them.
//!
//! Two layers are pinned here. `significant` decides what a line is worth
//! comparing as, which is where formatting, comments and imports are meant to
//! stop mattering. `detect` decides what counts as a clone, which is where the
//! budgets, the greedy extension and the claiming live — a block has to be
//! reported once, at its longest, however many windows of it match.

use std::fs;
use std::path::{Path, PathBuf};

use cli::commands::project_check::{CheckStatus, ProjectCheckArgs, duplication};

fn root() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let path = dir.path().to_path_buf();
    (dir, path)
}

fn write(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent directory");
    }
    fs::write(path, content).expect("write file");
}

/// A workspace holding one module, which is all the check discovers by.
fn workspace(root: &Path, name: &str, kind: &str) -> PathBuf {
    write(
        &root.join("package.json"),
        "{ \"workspaces\": [\"modules/*\"] }\n",
    );
    let dir = root.join("modules").join(name);
    write(
        &dir.join(format!("{name}.yml")),
        &format!("type: \"{kind}\"\n"),
    );
    write(
        &dir.join("package.json"),
        &format!("{{ \"name\": \"{name}\" }}\n"),
    );
    dir
}

/// A body of `count` distinct lines, each substantial enough that twelve of
/// them clear the character budget comfortably.
fn body(count: usize) -> String {
    (0..count)
        .map(|number| {
            format!(
                "const line{number} = await this.repository.findOneOrFail({{ id: order.reference{number} }});"
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

/// A body of the same shape sharing no line with `body`, for the cases where
/// two files are meant to have nothing in common.
fn unrelated_body(count: usize) -> String {
    (0..count)
        .map(|number| {
            format!("this.logger.info('step {number}', {{ attempt: state.attempt{number} }});")
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

/// The same body with one line replaced, so a copy can diverge partway.
fn body_diverging_at(count: usize, at: usize) -> String {
    body(count)
        .lines()
        .enumerate()
        .map(|(number, line)| {
            if number == at {
                "const total = lines.reduce((sum, line) => sum + line.amount, 0);".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

fn file(label: &str, content: &str) -> (String, String) {
    (label.to_string(), content.to_string())
}

// ---------------------------------------------------------------------------
// Significant lines
// ---------------------------------------------------------------------------

#[test]
fn a_line_keeps_the_number_it_had_in_the_original_file() {
    let units = duplication::significant("\n// a note\nconst total = order.total();\n");

    assert_eq!(units.len(), 1);
    assert_eq!(units[0].0, 3);
}

#[test]
fn formatting_is_flattened_so_two_wrappings_read_the_same() {
    let spread = duplication::significant("      const   total =    order.total( );\n");
    let tight = duplication::significant("const total = order.total( );\n");

    assert_eq!(spread[0].1, "const total = order.total( );");
    assert_eq!(spread[0].1, tight[0].1);
}

#[test]
fn a_comment_a_copy_picked_up_does_not_change_the_line() {
    let annotated = duplication::significant("const total = order.total(); // moved from cart\n");
    let plain = duplication::significant("const total = order.total();\n");

    assert_eq!(annotated[0].1, plain[0].1);
}

#[test]
fn a_double_slash_inside_a_string_is_not_a_comment() {
    let units = duplication::significant(
        "const endpoint = \"https://example.com/orders\"; // the public one\n",
    );

    assert_eq!(
        units[0].1,
        "const endpoint = \"https://example.com/orders\";"
    );
}

#[test]
fn an_escaped_quote_does_not_end_the_string_it_is_inside() {
    let units = duplication::significant("const quoted = \"say \\\"//\\\" twice\"; // note\n");

    assert_eq!(units[0].1, "const quoted = \"say \\\"//\\\" twice\";");
}

#[test]
fn the_lines_that_match_everywhere_are_dropped() {
    let units = duplication::significant(
        "import { Order } from '@module/order';\n\
         use std::fs;\n\
         export { Order };\n\
         export * from './order';\n\
         import type { Line } from './line';\n\
         /* a block */\n\
         * continued\n\
         # a hash comment\n\
         }\n\
         });\n\
         const total = order.total();\n",
    );

    assert_eq!(
        units
            .iter()
            .map(|(_, text)| text.as_str())
            .collect::<Vec<_>>(),
        vec!["const total = order.total();"]
    );
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

#[test]
fn the_same_block_in_two_files_is_reported_once_with_both_places() {
    let duplicates = duplication::detect(&[
        file("modules/order/src/order.service.ts", &body(12)),
        file("modules/cart/src/cart.service.ts", &body(12)),
    ]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 12);
    assert_eq!(
        duplicates[0]
            .occurrences
            .iter()
            .map(|occurrence| (occurrence.file.as_str(), occurrence.line))
            .collect::<Vec<_>>(),
        vec![
            ("modules/order/src/order.service.ts", 1),
            ("modules/cart/src/cart.service.ts", 1)
        ]
    );
}

#[test]
fn a_long_clone_is_one_finding_rather_than_one_per_window() {
    let duplicates = duplication::detect(&[
        file("modules/order/src/order.service.ts", &body(40)),
        file("modules/cart/src/cart.service.ts", &body(40)),
    ]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 40);
}

#[test]
fn the_run_stops_where_the_copies_stop_agreeing() {
    let duplicates = duplication::detect(&[
        file("modules/order/src/order.service.ts", &body(20)),
        file(
            "modules/cart/src/cart.service.ts",
            &body_diverging_at(20, 14),
        ),
    ]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 14);
}

#[test]
fn a_third_copy_joins_the_finding_rather_than_starting_its_own() {
    let duplicates = duplication::detect(&[
        file("modules/order/src/order.service.ts", &body(12)),
        file("modules/cart/src/cart.service.ts", &body(12)),
        file("modules/quote/src/quote.service.ts", &body(12)),
    ]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].occurrences.len(), 3);
}

#[test]
fn a_block_repeated_inside_one_file_is_reported_against_itself() {
    let twice = format!("{}{}", body(12), body(12));

    let duplicates = duplication::detect(&[file("modules/order/src/order.service.ts", &twice)]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 12);
    assert_eq!(
        duplicates[0]
            .occurrences
            .iter()
            .map(|occurrence| occurrence.line)
            .collect::<Vec<_>>(),
        vec![1, 13]
    );
}

#[test]
fn back_to_back_copies_never_overlap_each_other() {
    let thrice = format!("{}{}{}", body(12), body(12), body(12));

    let duplicates = duplication::detect(&[file("modules/order/src/order.service.ts", &thrice)]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].occurrences.len(), 3);
    // Three copies of a twelve-line block, so the run can never be longer than
    // the distance between two of them.
    assert_eq!(duplicates[0].lines, 12);
    assert_eq!(
        duplicates[0]
            .occurrences
            .iter()
            .map(|occurrence| occurrence.line)
            .collect::<Vec<_>>(),
        vec![1, 13, 25]
    );
}

#[test]
fn a_third_file_matching_partway_through_does_not_reopen_a_reported_block() {
    // The tail of the block also lives in a third file. Once the block is
    // reported the lines it covers are spoken for, so the offset match inside
    // it is not a second finding on top of the first.
    let offset = body(20).lines().skip(1).collect::<Vec<_>>().join("\n");

    let duplicates = duplication::detect(&[
        file("modules/order/src/order.service.ts", &body(20)),
        file("modules/cart/src/cart.service.ts", &body(20)),
        file("modules/quote/src/quote.service.ts", &offset),
    ]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 20);
    assert_eq!(duplicates[0].occurrences.len(), 2);
}

#[test]
fn a_run_never_grows_past_the_copy_that_follows_it() {
    // Two copies and the first line of a third, which is short enough not to
    // be a window of its own: the run can grow into it, and the two
    // occurrences it already has would then overlap by a line.
    let trailing = format!(
        "{}{}{}",
        body(12),
        body(12),
        body(12).lines().next().expect("a line")
    );

    let duplicates = duplication::detect(&[file("modules/order/src/order.service.ts", &trailing)]);

    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].lines, 12);
    assert_eq!(
        duplicates[0]
            .occurrences
            .iter()
            .map(|occurrence| occurrence.line)
            .collect::<Vec<_>>(),
        vec![1, 13]
    );
}

#[test]
fn a_block_shorter_than_the_budget_is_left_alone() {
    assert!(
        duplication::detect(&[
            file("modules/order/src/order.service.ts", &body(11)),
            file("modules/cart/src/cart.service.ts", &body(11)),
        ])
        .is_empty()
    );
}

#[test]
fn twelve_short_lines_are_not_worth_extracting() {
    let thin = (0..12)
        .map(|number| format!("a{number} = 1;"))
        .collect::<Vec<_>>()
        .join("\n");

    assert!(
        duplication::detect(&[
            file("modules/order/src/order.service.ts", &thin),
            file("modules/cart/src/cart.service.ts", &thin),
        ])
        .is_empty()
    );
}

#[test]
fn imports_alone_are_never_a_clone() {
    let imports = (0..20)
        .map(|number| format!("import {{ Thing{number} }} from '@module/order/thing{number}';"))
        .collect::<Vec<_>>()
        .join("\n");

    assert!(
        duplication::detect(&[
            file("modules/order/src/order.service.ts", &imports),
            file("modules/cart/src/cart.service.ts", &imports),
        ])
        .is_empty()
    );
}

#[test]
fn a_copy_with_its_identifiers_renamed_is_not_caught() {
    // The documented limit of matching on text: this is a clone to a reader,
    // and invisible here. Widening it would cost the false-positive rate that
    // makes the check safe to leave on by default.
    let renamed = body(12).replace("order.", "cart.");

    assert!(
        duplication::detect(&[
            file("modules/order/src/order.service.ts", &body(12)),
            file("modules/cart/src/cart.service.ts", &renamed),
        ])
        .is_empty()
    );
}

#[test]
fn a_file_on_its_own_is_compared_against_nothing() {
    assert!(
        duplication::detect(&[file("modules/order/src/order.service.ts", &body(40))]).is_empty()
    );
    assert!(duplication::detect(&[]).is_empty());
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

#[test]
fn a_copy_pasted_service_warns_with_both_locations() {
    let (_guard, root) = root();
    let order = workspace(&root, "order", "module");
    let cart = workspace(&root, "cart", "module");
    write(&order.join("src/order.service.ts"), &body(12));
    write(&cart.join("src/cart.service.ts"), &body(12));

    let outcome = duplication::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Warned);
    assert_eq!(outcome.details.len(), 1);
    assert!(outcome.details[0].contains("duplication.block"));
    assert!(outcome.details[0].contains("modules/cart/src/cart.service.ts:1"));
    assert!(outcome.details[0].contains("modules/order/src/order.service.ts:1"));
    assert!(outcome.details[0].contains("12 lines repeated at"));
    assert!(outcome.summary.contains("2 files"));
    assert!(!outcome.hints.is_empty());
}

#[test]
fn a_workspace_with_nothing_written_twice_passes() {
    let (_guard, root) = root();
    let order = workspace(&root, "order", "module");
    write(&order.join("src/order.service.ts"), &body(20));
    write(&order.join("src/cart.service.ts"), &unrelated_body(20));

    let outcome = duplication::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert!(outcome.summary.contains("no block written twice"));
}

#[test]
fn generated_output_is_allowed_to_repeat_itself() {
    let (_guard, root) = root();
    let order = workspace(&root, "order", "module");
    let cart = workspace(&root, "cart", "module");

    for (module, name) in [(&order, "order"), (&cart, "cart")] {
        write(
            &module.join(format!("src/database/migrations/17000000000-{name}.ts")),
            &body(20),
        );
        write(&module.join(format!("src/seeds/{name}.seed.ts")), &body(20));
        write(&module.join(format!("src/icons/{name}Icon.tsx")), &body(20));
        write(&module.join("src/bootstrap/routeTree.gen.ts"), &body(20));
        write(&module.join("src/shared/css.d.ts"), &body(20));
    }

    assert_eq!(
        duplication::run(&ProjectCheckArgs::default(), &root).status,
        CheckStatus::Skipped
    );
}

#[test]
fn only_the_requested_modules_are_compared() {
    let (_guard, root) = root();
    let order = workspace(&root, "order", "module");
    let cart = workspace(&root, "cart", "module");
    write(&order.join("src/order.service.ts"), &body(12));
    write(&cart.join("src/cart.service.ts"), &body(12));

    let outcome = duplication::run(
        &ProjectCheckArgs {
            modules: Some("order".to_string()),
            ..ProjectCheckArgs::default()
        },
        &root,
    );

    assert_eq!(outcome.status, CheckStatus::Passed);
    assert!(outcome.summary.contains("1 file"));
}

#[test]
fn a_workspace_with_no_sources_is_skipped() {
    let (_guard, root) = root();
    workspace(&root, "order", "module");

    let outcome = duplication::run(&ProjectCheckArgs::default(), &root);

    assert_eq!(outcome.status, CheckStatus::Skipped);
    assert!(outcome.summary.contains("no source file to compare"));
}
