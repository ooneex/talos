use std::path::PathBuf;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum TaskStatus {
    Pending,
    Success,
    Cached,
    Failed,
    Skipped,
}

pub(crate) struct Task {
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) target_key: Option<String>,
    pub(crate) command: String,
    pub(crate) cwd: PathBuf,
    pub(crate) argv: Vec<String>,
    pub(crate) cacheable: bool,
    pub(crate) deps: Vec<String>,
    pub(crate) status: TaskStatus,
    pub(crate) output: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) duration_ms: u64,
    pub(crate) hash: Option<String>,
}

pub(crate) fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        format!("{ms}ms")
    } else {
        format!("{:.1}s", ms as f64 / 1000.0)
    }
}
