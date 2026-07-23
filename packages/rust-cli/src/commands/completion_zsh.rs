use clap::Args;

const OO_TEMPLATE: &str = include_str!("../templates/completions/_oo.txt");
const TALOS_TEMPLATE: &str = include_str!("../templates/completions/_talos.txt");

/// Rust port of `packages/cli/src/commands/CompletionZshCommand.ts`.
#[derive(Args, Debug)]
pub struct CompletionZshArgs {}

pub fn run(_args: &CompletionZshArgs) {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
        eprintln!("✖ Could not resolve the home directory");
        return;
    };
    let completion_dir = home.join(".zsh");
    if let Err(error) = std::fs::create_dir_all(&completion_dir) {
        eprintln!("✖ Failed to create {}: {error}", completion_dir.display());
        return;
    }

    let oo_file_path = completion_dir.join("_oo");
    let talos_file_path = completion_dir.join("_talos");
    if std::fs::write(&oo_file_path, OO_TEMPLATE).is_err()
        || std::fs::write(&talos_file_path, TALOS_TEMPLATE).is_err()
    {
        eprintln!("✖ Failed to write zsh completion files");
        return;
    }

    println!("✔ {} created successfully", oo_file_path.display());
    println!("✔ {} created successfully", talos_file_path.display());
    println!(
        "Add the following to your .zshrc if not already present:\n  fpath=(~/.zsh $fpath)\n  autoload -Uz compinit && compinit"
    );
}
