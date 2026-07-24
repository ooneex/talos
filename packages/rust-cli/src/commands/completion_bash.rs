use clap::Args;

const BASH_TEMPLATE: &str = include_str!("../templates/completions/talos.bash.txt");

#[derive(Args, Debug)]
pub struct CompletionBashArgs {}

pub fn run(_args: &CompletionBashArgs) {
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else {
        crate::utils::error("Could not resolve the home directory");
        return;
    };
    let completion_dir = home.join(".local/share/bash-completion/completions");
    if let Err(error) = std::fs::create_dir_all(&completion_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            completion_dir.display()
        ));
        return;
    }

    let oo_file_path = completion_dir.join("oo");
    let talos_file_path = completion_dir.join("talos");
    if std::fs::write(&oo_file_path, BASH_TEMPLATE).is_err()
        || std::fs::write(&talos_file_path, BASH_TEMPLATE).is_err()
    {
        crate::utils::error("Failed to write bash completion files");
        return;
    }

    crate::utils::success(format!("{} created successfully", oo_file_path.display()));
    crate::utils::success(format!(
        "{} created successfully",
        talos_file_path.display()
    ));
    println!(
        "Requires the bash-completion package, which loads this directory automatically.\n  Otherwise add the following to your .bashrc:\n  source ~/.local/share/bash-completion/completions/talos"
    );
}
