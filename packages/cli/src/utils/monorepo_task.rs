use std::path::PathBuf;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TaskStatus {
    Pending,
    Success,
    Cached,
    Failed,
    Skipped,
}

pub struct Task {
    pub key: String,
    pub label: String,
    pub target_key: Option<String>,
    pub command: String,
    pub cwd: PathBuf,
    pub argv: Vec<String>,
    pub cacheable: bool,
    pub deps: Vec<String>,
    pub status: TaskStatus,
    pub output: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub hash: Option<String>,
}

pub fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        format!("{ms}ms")
    } else {
        format!("{:.1}s", ms as f64 / 1000.0)
    }
}
