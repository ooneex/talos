use clap::Parser;
use cli::commands::completion_zsh::{CompletionZshArgs, run};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CompletionZshArgs,
}

#[test]
fn completion_zsh_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talos"]).is_ok());
}

#[test]
fn completion_zsh_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn completion_zsh_writes_the_completion_files_into_home() {
    let home = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    run(&CompletionZshArgs {});

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }

    assert!(home.path().join(".zsh/_oo").is_file());
    assert!(home.path().join(".zsh/_talos").is_file());
}

#[test]
fn completion_zsh_returns_cleanly_without_home() {
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::remove_var("HOME");
    }

    run(&CompletionZshArgs {});

    if let Some(value) = previous {
        unsafe {
            std::env::set_var("HOME", value);
        }
    }
}

#[test]
fn completion_zsh_handles_an_unusable_home_path() {
    let temp = tempfile::tempdir().expect("tempdir");
    let home_file = temp.path().join("home-file");
    std::fs::write(&home_file, "x").expect("home file");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &home_file);
    }

    run(&CompletionZshArgs {});

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }
}

#[test]
fn completion_zsh_handles_write_failures() {
    let home = tempfile::tempdir().expect("tempdir");
    let completion_dir = home.path().join(".zsh");
    std::fs::create_dir_all(completion_dir.join("_oo")).expect("oo dir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    run(&CompletionZshArgs {});

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }

    assert!(completion_dir.join("_oo").is_dir());
    assert!(!completion_dir.join("_talos").exists());
}
