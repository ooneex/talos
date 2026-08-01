//! Shared scratch-directory helper for the integration specs.
//!
//! Each spec is its own binary, so this is included with `mod support;` rather
//! than shared through the library.

#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

/// A scratch directory that removes itself when the test ends.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(tag: &str) -> Self {
        let base = std::env::temp_dir().join(format!(
            "talos-{tag}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("temp dir should be creatable");
        Self(base)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// Write a file, creating any parent directories it needs.
    pub fn write(&self, name: &str, content: &str) -> PathBuf {
        let target = self.0.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("parent dir should be creatable");
        }
        fs::write(&target, content).expect("fixture should be writable");
        target
    }

    pub fn dir(&self, name: &str) -> PathBuf {
        let target = self.0.join(name);
        fs::create_dir_all(&target).expect("dir should be creatable");
        target
    }

    pub fn read(&self, name: &str) -> String {
        fs::read_to_string(self.0.join(name)).expect("file should be readable")
    }

    /// Write `modules/<name>/<name>.yml` declaring the module's type.
    pub fn module(&self, name: &str, module_type: &str) -> &Self {
        self.write(
            &format!("{name}/{name}.yml"),
            &format!("name: \"{name}\"\ntype: \"{module_type}\"\n"),
        );
        self
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
