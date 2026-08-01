#!/bin/sh
# Test + coverage for the Rust CLI, mirroring what bunfig.toml does for the bun packages:
# a text summary on the console, an lcov report under coverage/, and a threshold gate.
#
# Requires cargo-llvm-cov:
#   rustup component add llvm-tools-preview && cargo install cargo-llvm-cov --locked
set -e

# cargo-llvm-cov gates on the workspace total, not per file.
FAIL_UNDER_LINES=40
FAIL_UNDER_FUNCTIONS=50
FAIL_UNDER_REGIONS=40

cd "$(dirname "$0")/.."

cargo llvm-cov --no-report "$@"

mkdir -p coverage
cargo llvm-cov report --lcov --output-path coverage/lcov.info
cargo llvm-cov report \
  --summary-only \
  --fail-under-lines "$FAIL_UNDER_LINES" \
  --fail-under-functions "$FAIL_UNDER_FUNCTIONS" \
  --fail-under-regions "$FAIL_UNDER_REGIONS"
