//! Shared helpers used by multiple `rust-cli` commands, split by concern to
//! avoid duplicating prompt/validation/process logic across `app_init` and
//! `app_create` (mirrors the shared `packages/cli/src/{prompts,utils}.ts`
//! helpers those TypeScript commands both rely on).

mod case;
mod process;
mod prompts;
mod skeleton;

pub use case::{to_kebab_case, to_snake_case};
pub use process::{ensure_bin, run_step};
pub use prompts::{
    ask_confirm, ask_destination, ask_name, ask_select, resolve_name_and_destination,
    validate_destination, validate_name,
};
pub use skeleton::{SKELETON_REPO_URL, clone_skeleton};
