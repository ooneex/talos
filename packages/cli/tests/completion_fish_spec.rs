use clap::Parser;
use cli::commands::completion_fish::{CompletionFishArgs, run};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: CompletionFishArgs,
}

#[test]
fn completion_fish_parses_with_no_arguments() {
    assert!(TestCli::try_parse_from(["talos"]).is_ok());
}

#[test]
fn completion_fish_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn completion_fish_writes_the_completion_files_into_home() {
    let home = tempfile::tempdir().expect("tempdir");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", home.path());
    }

    run(&CompletionFishArgs {});

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }

    assert!(
        home.path()
            .join(".config/fish/completions/oo.fish")
            .is_file()
    );
    assert!(
        home.path()
            .join(".config/fish/completions/talos.fish")
            .is_file()
    );
}

#[test]
fn completion_fish_returns_cleanly_without_home() {
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::remove_var("HOME");
    }

    run(&CompletionFishArgs {});

    if let Some(value) = previous {
        unsafe {
            std::env::set_var("HOME", value);
        }
    }
}

#[test]
fn completion_fish_handles_an_unusable_home_path() {
    let temp = tempfile::tempdir().expect("tempdir");
    let home_file = temp.path().join("home-file");
    std::fs::write(&home_file, "x").expect("home file");
    let previous = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &home_file);
    }

    run(&CompletionFishArgs {});

    match previous {
        Some(value) => unsafe {
            std::env::set_var("HOME", value);
        },
        None => unsafe {
            std::env::remove_var("HOME");
        },
    }
}
