mod case;
mod commitlint;
mod credentials;
mod git;
mod index_exports;
mod issue;
mod migration_version;
mod module_registry;
mod monorepo;
mod monorepo_fmt_group;
mod monorepo_footer;
mod monorepo_group;
mod monorepo_lint_group;
mod monorepo_scheduler;
mod monorepo_task;
mod monorepo_test_group;
mod parallel;
mod process;
mod prompts;
mod run_module_scripts;
mod runnable_modules;
mod rust_module;
mod scaffold;
mod skeleton;
mod style;
mod yaml;

pub use case::{pluralize, to_kebab_case, to_pascal_case, to_snake_case};
pub use commitlint::{
    BODY_MAX_LINE_LENGTH, COMMIT_TYPES, COMMON_SCOPE, HEADER_MAX_LENGTH, check_commit_message_file,
    get_valid_scopes, lint_commit_message, strip_commit_comments,
};
pub use credentials::{read_credentials, save_credentials};
pub use git::{
    discover as discover_git_repo, origin_url as git_origin_url, toplevel as git_toplevel,
};
pub use index_exports::write_export_index;
pub use issue::{IssueYaml, generate_issue_id, issue_to_yaml};
pub use migration_version::generate_migration_version;
pub use module_registry::{
    add_path_alias, add_to_app_module, add_to_microservice_module, add_to_shared_module,
    remove_from_app_module, remove_from_shared_module, remove_path_alias, strip_jsonc,
};
pub use monorepo::{
    CacheEntryMeta, FileHashCache, FingerprintMemo, MONOREPO_CACHE_DIR, MONOREPO_CACHE_VERSION,
    MonorepoTarget, TargetType, compute_task_hash, discover_targets, fingerprint_target,
    hash_root_inputs, is_git_workspace_root, load_file_hash_cache, read_cache_entry,
    resolve_biome_command, resolve_tsc_command, restore_cache_outputs, save_file_hash_cache,
    sort_targets_by_dependencies, write_cache_entry,
};
pub(crate) use monorepo_footer::Footer;
pub(crate) use monorepo_group::{INSTALL_COMMAND, build_group, build_install_group};
pub(crate) use monorepo_scheduler::run_group;
pub(crate) use monorepo_task::{Task, TaskStatus, format_duration};
pub use parallel::{Action, run_actions, run_actions_rendered};
pub use process::{ensure_bin, run_spinner_step, run_step};
pub use prompts::{
    ask_confirm, ask_destination, ask_destination_module, ask_input, ask_input_with_default,
    ask_multiselect, ask_name, ask_password, ask_plain_input, ask_route_method, ask_route_name,
    ask_route_path, ask_select, resolve_name_and_destination, validate_destination, validate_name,
    validate_route_method, validate_route_name, validate_route_path,
};
pub use run_module_scripts::{RunModuleScriptsOptions, run_module_scripts};
pub use runnable_modules::{
    RunnableModule, RunnableModuleType, collect_runnable_modules, select_runnable_modules,
};
pub use rust_module::is_rust_module;
pub use scaffold::{
    ScaffoldConfig, ScaffoldOptions, current_dir, ensure_module, install_dependency,
    scaffold_resource,
};
pub use skeleton::{SKELETON_REPO_URL, clone_skeleton};

pub use style::{Spinner, error, info, step, success, warn};
