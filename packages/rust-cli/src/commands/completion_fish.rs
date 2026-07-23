use clap::Args;

const FISH_TEMPLATE: &str = include_str!("../templates/completions/talos.fish.txt");

/// Rust port of `packages/cli/src/commands/CompletionFishCommand.ts`.
#[derive(Args, Debug)]
pub struct CompletionFishArgs {}

pub fn run(_args: &CompletionFishArgs) {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
        crate::utils::error("Could not resolve the home directory");
        return;
    };
    let completion_dir = home.join(".config/fish/completions");
    if let Err(error) = std::fs::create_dir_all(&completion_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            completion_dir.display()
        ));
        return;
    }

    let oo_file_path = completion_dir.join("oo.fish");
    let talos_file_path = completion_dir.join("talos.fish");
    if std::fs::write(&oo_file_path, FISH_TEMPLATE).is_err()
        || std::fs::write(&talos_file_path, FISH_TEMPLATE).is_err()
    {
        crate::utils::error("Failed to write fish completion files");
        return;
    }

    crate::utils::success(format!("{} created successfully", oo_file_path.display()));
    crate::utils::success(format!(
        "{} created successfully",
        talos_file_path.display()
    ));
    println!(
        "Fish loads completions from this directory automatically.\n  Start a new shell or run `exec fish` to pick them up."
    );
}
