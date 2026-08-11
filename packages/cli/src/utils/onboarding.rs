//! The panel a freshly scaffolded project closes on.
//!
//! What `app:create` and `app:init` leave behind is a directory the user has
//! never seen, so the run ends on the three commands that take it from there to
//! a running API — each with the sentence saying what it does — and then the
//! handful worth knowing about once it is up.
//!
//! The two are drawn inside one frame: a rail down the left with a titled rule
//! opening each section. Only the left edge is drawn, so a line longer than the
//! frame runs past it instead of breaking the box — a long destination path or a
//! narrow terminal costs nothing.

use std::fs;
use std::path::Path;

use console::{Term, style};

use super::find_app_module_name;
use super::ports::parse_env_port;

/// The port the skeleton's `modules/app` declares, used when the scaffolded
/// `.env.yml` cannot be read.
const DEFAULT_APP_PORT: u16 = 8030;

/// How narrow the frame is allowed to get, whatever the terminal says.
const MIN_WIDTH: usize = 46;

/// The frame's own indent, then the rail and the gutter its content sits after.
const INDENT: &str = "  ";
const RAIL: &str = "│";
const GUTTER: usize = 3;

/// How wide a step's number column is — `1` and the two spaces after it.
const NUMBER_WIDTH: usize = 3;

/// The commands worth knowing about once the app is running.
const EXTRAS: [(&str, &str); 3] = [
    ("talos app:stop", "Stop the app and its Docker services"),
    (
        "talos check",
        "Install, build, format, lint and test everything",
    ),
    ("talos help", "Every command, with what it does"),
];

/// The port the app module will boot on.
fn app_port(destination: &Path) -> u16 {
    let app_name = find_app_module_name(destination).unwrap_or_else(|| "app".to_string());
    fs::read_to_string(destination.join("modules").join(app_name).join(".env.yml"))
        .ok()
        .as_deref()
        .and_then(parse_env_port)
        .unwrap_or(DEFAULT_APP_PORT)
}

/// A rule across the frame, opened by `corner` and naming the section it starts.
fn rule(corner: &str, title: Option<&str>, width: usize) -> String {
    let Some(title) = title else {
        return format!(
            "{INDENT}{}",
            style(format!("{corner}{}", "─".repeat(width.saturating_sub(1)))).dim()
        );
    };
    let used = 3 + title.chars().count() + 1;
    format!(
        "{INDENT}{} {} {}",
        style(format!("{corner}─")).dim(),
        style(title).bold(),
        style("─".repeat(width.saturating_sub(used))).dim()
    )
}

/// A line of content, hung off the rail.
fn rail(content: impl AsRef<str>) -> String {
    let content = content.as_ref();
    if content.is_empty() {
        return format!("{INDENT}{}", style(RAIL).dim());
    }
    format!(
        "{INDENT}{}{}{content}",
        style(RAIL).dim(),
        " ".repeat(GUTTER)
    )
}

/// The onboarding panel, line by line, so it can be exercised without a
/// terminal.
fn onboarding_lines(destination: &Path, port: u16, cols: usize) -> Vec<String> {
    let steps = [
        (
            format!("cd {}", destination.display()),
            "Enter the project".to_string(),
        ),
        (
            "talos app:start".to_string(),
            format!("Boot the Docker services and serve the API on http://localhost:{port}"),
        ),
        (
            "talos module:create".to_string(),
            "Scaffold your first domain module — entity, service, controller".to_string(),
        ),
    ];

    let command_width = EXTRAS
        .iter()
        .map(|(command, _)| command.chars().count())
        .max()
        .unwrap_or(0);
    let extras: Vec<String> = EXTRAS
        .iter()
        .map(|(command, detail)| {
            format!(
                "{}  {}",
                style(format!("{command:<command_width$}")).cyan(),
                style(detail).dim()
            )
        })
        .collect();

    let widest = steps
        .iter()
        .flat_map(|(command, detail)| {
            [
                NUMBER_WIDTH + command.chars().count(),
                NUMBER_WIDTH + detail.chars().count(),
            ]
        })
        .chain(
            EXTRAS
                .iter()
                .map(|(_, detail)| command_width + 2 + detail.chars().count()),
        )
        .max()
        .unwrap_or(0);
    let width = (GUTTER + widest + 2).clamp(MIN_WIDTH, cols.saturating_sub(4).max(MIN_WIDTH));

    let mut lines = vec![String::new(), rule("╭", Some("Next steps"), width)];
    for (index, (command, detail)) in steps.iter().enumerate() {
        lines.push(rail(""));
        lines.push(rail(format!(
            "{} {}",
            style(format!("{}.", index + 1)).dim(),
            style(command).cyan().bold()
        )));
        lines.push(rail(format!(
            "{}{}",
            " ".repeat(NUMBER_WIDTH),
            style(detail).dim()
        )));
    }

    lines.push(rail(""));
    lines.push(rule("├", Some("Good to know"), width));
    lines.push(rail(""));
    lines.extend(extras.into_iter().map(rail));
    lines.push(rail(""));
    lines.push(rule("╰", None, width));
    lines.push(String::new());
    lines
}

/// Close a scaffold run on the panel, reading the app's own port so the URL is
/// the one it will actually answer on.
pub fn print_onboarding(destination: &Path) {
    let cols = usize::from(Term::stdout().size().1);
    for line in onboarding_lines(destination, app_port(destination), cols) {
        println!("{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_destination_and_the_port_the_app_serves_on() {
        let lines = onboarding_lines(Path::new("Movie"), 8031, 100).join("\n");

        assert!(lines.contains("cd Movie"));
        assert!(lines.contains("talos app:start"));
        assert!(lines.contains("http://localhost:8031"));
        assert!(lines.contains("talos module:create"));
        assert!(lines.contains("talos app:stop"));
    }

    #[test]
    fn frames_every_section_and_hangs_its_content_off_the_rail() {
        let lines = onboarding_lines(Path::new("Movie"), 8030, 100);

        assert!(lines.iter().any(|line| line.contains("╭─")));
        assert!(lines.iter().any(|line| line.contains("├─")));
        assert!(lines.iter().any(|line| line.contains("╰─")));
        assert!(
            lines
                .iter()
                .any(|line| line.contains(RAIL) && line.contains("cd Movie"))
        );
    }

    #[test]
    fn keeps_the_frame_inside_a_narrow_terminal() {
        let narrow = onboarding_lines(Path::new("Movie"), 8030, 60);
        let opening = narrow
            .iter()
            .find(|line| line.contains("╭─"))
            .expect("an opening rule");

        assert_eq!(console::measure_text_width(opening), INDENT.len() + 56);
    }

    #[test]
    fn never_draws_a_frame_narrower_than_its_floor() {
        let cramped = onboarding_lines(Path::new("Movie"), 8030, 10);
        let opening = cramped
            .iter()
            .find(|line| line.contains("╭─"))
            .expect("an opening rule");

        assert_eq!(
            console::measure_text_width(opening),
            INDENT.len() + MIN_WIDTH
        );
    }

    #[test]
    fn reads_the_port_the_scaffolded_env_declares() {
        let temp = tempfile::tempdir().expect("temp dir");
        let app_dir = temp.path().join("modules").join("app");
        fs::create_dir_all(&app_dir).expect("app dir");
        fs::write(app_dir.join(".env.yml"), "app:\n  port: 8042\n").expect("env");

        assert_eq!(app_port(temp.path()), 8042);
    }

    #[test]
    fn falls_back_to_the_skeleton_port_without_an_env() {
        let temp = tempfile::tempdir().expect("temp dir");

        assert_eq!(app_port(temp.path()), DEFAULT_APP_PORT);
    }
}
