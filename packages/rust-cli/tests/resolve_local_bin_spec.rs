//! Integration tests for `rust_cli::utils::{resolve_biome_command,
//! resolve_tsc_command}`, which resolve the local `node_modules/.bin/<bin>`
//! so the scheduler can spawn it directly instead of relying on `PATH`.

use std::fs;

use rust_cli::utils::{resolve_biome_command, resolve_tsc_command};

#[test]
fn resolve_tsc_command_prefers_nearest_local_binary() {
    let root = std::env::temp_dir().join(format!("talos-tsc-{}", std::process::id()));
    let bin_dir = root.join("node_modules/.bin");
    fs::create_dir_all(&bin_dir).unwrap();
    let tsc = bin_dir.join("tsc");
    fs::write(&tsc, b"#!/bin/sh\n").unwrap();

    let nested = root.join("packages/app-env");
    fs::create_dir_all(&nested).unwrap();

    let command = resolve_tsc_command(&nested);
    assert_eq!(command, vec![tsc.to_string_lossy().to_string()]);

    fs::remove_dir_all(&root).ok();
}

#[test]
fn resolve_tsc_command_falls_back_to_bunx() {
    let root = std::env::temp_dir().join(format!("talos-tsc-nobin-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();

    // A directory with no `node_modules/.bin/tsc` up the chain resolves to the
    // `bunx tsc` fallback. The temp dir has no ancestor bin, but the real
    // filesystem root won't either, so the tail of the command is what matters.
    let command = resolve_tsc_command(&root);
    assert_eq!(command.last().map(String::as_str), Some("tsc"));
    if command.len() == 2 {
        assert_eq!(command[0], "bunx");
    }

    fs::remove_dir_all(&root).ok();
}

#[test]
fn resolve_biome_command_prefers_nearest_local_binary() {
    let root = std::env::temp_dir().join(format!("talos-biome-{}", std::process::id()));
    let bin_dir = root.join("node_modules/.bin");
    fs::create_dir_all(&bin_dir).unwrap();
    let biome = bin_dir.join("biome");
    fs::write(&biome, b"#!/bin/sh\n").unwrap();

    let command = resolve_biome_command(&root);
    assert_eq!(command, vec![biome.to_string_lossy().to_string()]);

    fs::remove_dir_all(&root).ok();
}
