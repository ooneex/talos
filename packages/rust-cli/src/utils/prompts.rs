//! Interactive prompts, mirroring `packages/cli/src/prompts/*.ts`.

use std::path::PathBuf;

use dialoguer::{Confirm, Input, Select, theme::ColorfulTheme};

use super::case::to_kebab_case;

/// Mirrors `AssertName`'s validation, extracted so it can be tested
/// independently of the interactive `Input` prompt that uses it.
pub fn validate_name(input: &str) -> Result<(), String> {
    let valid = input
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && input.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');

    if valid {
        Ok(())
    } else {
        Err("Name must start with a letter and contain only letters, numbers, and hyphens".into())
    }
}

/// Mirrors `AssertDestination`'s validation, extracted so it can be tested
/// independently of the interactive `Input` prompt that uses it.
pub fn validate_destination(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    let valid = !trimmed.is_empty()
        && input
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '~' | '/' | '-'));

    if valid {
        Ok(())
    } else {
        Err(
            "Destination must be a valid path (letters, numbers, dots, hyphens, underscores, and slashes)"
                .into(),
        )
    }
}

/// Mirrors `askName`'s `AssertName` validation.
pub fn ask_name() -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Enter application name")
        .validate_with(|input: &String| validate_name(input))
        .interact_text()
        .ok()
}

/// Mirrors `askDestination`'s `AssertDestination` validation.
pub fn ask_destination(initial: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Enter destination path")
        .with_initial_text(initial)
        .validate_with(|input: &String| validate_destination(input))
        .interact_text()
        .ok()
}

/// Mirrors `askConfirm`.
pub fn ask_confirm(prompt: &str, default: bool) -> bool {
    Confirm::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .default(default)
        .interact()
        .unwrap_or(default)
}

/// Mirrors `askCiProvider`'s `select` prompt (`github` / `gitlab` / `bitbucket`).
pub fn ask_select(prompt: &str, items: &[&str]) -> Option<usize> {
    Select::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .items(items)
        .default(0)
        .interact()
        .ok()
}

/// Resolves an optional `--name`/`--destination` pair, prompting interactively
/// for whichever is missing. Shared by `app:init` and `app:create`, whose CLI
/// options and prompt fallbacks are identical.
pub fn resolve_name_and_destination(
    name: Option<String>,
    destination: Option<String>,
) -> Option<(String, String, PathBuf)> {
    let name = match name {
        Some(name) => name,
        None => ask_name()?,
    };

    let kebab_name = to_kebab_case(&name);

    let destination = match destination {
        Some(destination) => destination,
        None => ask_destination(&kebab_name)?,
    };

    let destination_path = PathBuf::from(&destination);
    Some((name, kebab_name, destination_path))
}
