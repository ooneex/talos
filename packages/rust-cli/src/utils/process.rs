use std::process::Command;

pub fn ensure_bin(bin: &str) -> bool {
    let available = Command::new(bin)
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !available {
        super::style::error(format!(
            "\"{bin}\" is required but was not found on the PATH"
        ));
    }

    available
}

pub fn run_step(silent: bool, start_message: &str, command: &mut Command) -> bool {
    if !silent {
        println!("{start_message}");
    }

    match command.status() {
        Ok(status) if status.success() => true,
        Ok(status) => {
            super::style::error(format!(
                "Failed (exit code: {})",
                status.code().unwrap_or(-1)
            ));
            false
        }
        Err(error) => {
            super::style::error(format!("Failed to run command: {error}"));
            false
        }
    }
}

pub fn run_spinner_step(silent: bool, label: &str, command: &mut Command) -> bool {
    let spinner = super::style::Spinner::start(format!("{label}..."));
    let result = command.output();
    spinner.stop();

    match result {
        Ok(output) if output.status.success() => {
            if !silent {
                super::style::success(label);
            }
            true
        }
        Ok(output) => {
            super::style::error(format!(
                "{label} failed (exit code: {})",
                output.status.code().unwrap_or(-1)
            ));
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if !combined.trim().is_empty() {
                eprintln!("{}", combined.trim_end());
            }
            false
        }
        Err(error) => {
            super::style::error(format!("{label} failed: {error}"));
            false
        }
    }
}
