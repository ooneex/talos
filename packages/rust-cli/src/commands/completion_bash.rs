use clap::Args;

const BASH_TEMPLATE: &str = include_str!("../templates/completions/talos.bash.txt");

/// Rust port of `packages/cli/src/commands/CompletionBashCommand.ts`.
#[derive(Args, Debug)]
pub struct CompletionBashArgs {}

pub fn run(_args: &CompletionBashArgs) {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
        eprintln!("✖ Could not resolve the home directory");
        return;
    };
    let completion_dir = home.join(".local/share/bash-completion/completions");
    if let Err(error) = std::fs::create_dir_all(&completion_dir) {
        eprintln!("✖ Failed to create {}: {error}", completion_dir.display());
        return;
    }

    let oo_file_path = completion_dir.join("oo");
    let talos_file_path = completion_dir.join("talos");
    if std::fs::write(&oo_file_path, BASH_TEMPLATE).is_err()
        || std::fs::write(&talos_file_path, BASH_TEMPLATE).is_err()
    {
        eprintln!("✖ Failed to write bash completion files");
        return;
    }

    println!("✔ {} created successfully", oo_file_path.display());
    println!("✔ {} created successfully", talos_file_path.display());
    println!(
        "Requires the bash-completion package, which loads this directory automatically.\n  Otherwise add the following to your .bashrc:\n  source ~/.local/share/bash-completion/completions/talos"
    );
}
