use std::path::Path;

pub fn is_rust_module(module_dir: &Path) -> bool {
    module_dir.join("Cargo.toml").is_file()
}
