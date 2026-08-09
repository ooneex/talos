use console::style;

use super::style::{BAR_EMPTY, BAR_FILLED, SPINNER_FRAMES as FRAMES};
use super::workspace_task::format_duration;

pub const BAR_WIDTH: usize = 22;

/// How far along the run is — a pure snapshot [`build_footer_lines`] draws
/// from, kept separate so the render can be exercised without a terminal.
pub struct FooterState {
    pub total: usize,
    pub finished: usize,
    pub failed: usize,
    pub running: Vec<String>,
    pub frame: usize,
}

/// A blank line, the bar with its counts, then one spinning line per task that
/// is still running.
pub fn build_footer_lines(state: &FooterState, cols: usize, elapsed_ms: u64) -> Vec<String> {
    let ratio = if state.total == 0 {
        1.0
    } else {
        state.finished as f64 / state.total as f64
    };
    let filled = ((ratio * BAR_WIDTH as f64).round() as usize).min(BAR_WIDTH);
    let filled_glyphs = BAR_FILLED.repeat(filled);
    let bar = format!(
        "{}{}",
        if state.failed > 0 {
            style(filled_glyphs).red()
        } else {
            style(filled_glyphs).green()
        },
        style(BAR_EMPTY.repeat(BAR_WIDTH - filled)).dim()
    );

    let mut summary = vec![format!("{}/{}", state.finished, state.total)];
    if !state.running.is_empty() {
        summary.push(format!("{} running", state.running.len()));
    }
    if state.failed > 0 {
        summary.push(format!("{} failed", state.failed));
    }

    let mut lines = vec![
        String::new(),
        format!(
            "  {}  {}{}",
            bar,
            style(summary.join(" · ")).cyan(),
            style(format!("  {}", format_duration(elapsed_ms))).dim()
        ),
    ];

    let frame = FRAMES[state.frame % FRAMES.len()];
    for label in &state.running {
        let label = truncate(label, cols.saturating_sub(6));
        lines.push(format!("  {} {}", style(frame).cyan(), label));
    }
    lines
}

fn truncate(label: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if label.chars().count() <= max {
        return label.to_string();
    }
    let kept: String = label.chars().take(max.saturating_sub(1)).collect();
    format!("{kept}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_returns_empty_for_zero_width() {
        assert_eq!(truncate("lint", 0), "");
    }
}
