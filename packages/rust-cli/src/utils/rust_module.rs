//! Helper for detecting whether a module directory is a Rust module (i.e.
//! it has its own `Cargo.toml` at its root), mirroring the `package.json`
//! presence checks used elsewhere (see `run_module_scripts.rs`) but for
//! Rust-based modules.

use std::path::Path;

/// Returns `true` if `module_dir` has a `Cargo.toml` file at its root.
pub fn is_rust_module(module_dir: &Path) -> bool {
    module_dir.join("Cargo.toml").is_file()
}
