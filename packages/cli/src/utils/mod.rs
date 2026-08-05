mod case;
mod commitlint;
mod concurrently;
mod credentials;
mod frontend_modules;
mod git;
pub mod github;
mod index_exports;
mod issue;
pub mod linear;
mod marketing;
mod migration_version;
mod module_registry;
mod module_removal;
mod monorepo;
mod monorepo_batch;
mod monorepo_footer;
pub mod monorepo_group;
pub mod monorepo_scheduler;
pub mod monorepo_task;
mod parallel;
mod process;
mod prompts;
mod provider;
mod publish_targets;
mod rng;
mod run_module_scripts;
mod runnable_modules;
mod rust_module;
mod scaffold;
mod skeleton;
pub mod storage;
mod style;
mod yaml;

pub use case::{pluralize, to_kebab_case, to_pascal_case, to_snake_case};
pub use commitlint::{
    BODY_MAX_LINE_LENGTH, COMMIT_TYPES, COMMON_SCOPE, HEADER_MAX_LENGTH, check_commit_message_file,
    get_valid_scopes, lint_commit_message, strip_commit_comments,
};
pub use concurrently::{
    CloseEvent, ConcurrentCommand, ConcurrentlyOptions, ConcurrentlyOutcome, KillCondition,
    PrefixColor, PrefixStyle, StartupNotice, SuccessCondition, colorize, prefix_label,
    run as run_concurrently, run_is_successful, should_kill_others, truncate_command,
};
pub use credentials::{read_credentials, save_credentials};
pub use frontend_modules::{
    CREATE_NEW_DESIGN, DesignWithTargetCreateArgs, NO_TARGET, add_module_alias_if_present,
    clone_frontend_template, collect_modules_by_type, collect_used_ports, ensure_design_module,
    ensure_shared_placeholder, finalize_module_yml, find_free_port, install_frontend_dependencies,
    normalize_module_name, prompt_design_module, prompt_target_module, rewrite_frontend_package,
    rewrite_module_imports, rewrite_playwright_port, rewrite_vite_alias, visit_files_recursive,
    with_design_field, with_optional_yml_field, with_target_field,
};
pub use git::{
    discover as discover_git_repo, origin_url as git_origin_url, toplevel as git_toplevel,
};
pub use index_exports::write_export_index;
pub use issue::{IssueYaml, generate_issue_id, issue_to_yaml};
pub use marketing::{
    IMAGE_EXTENSION, MARKETING_PLATFORMS, MARKETING_STATES, MarketingYaml, VIDEO_EXTENSION,
    generate_marketing_id, generate_media_name, marketing_to_yaml, normalize_platform,
    normalize_state,
};
pub use migration_version::generate_migration_version;
pub use module_registry::{
    add_path_alias, add_to_app_module, add_to_microservice_module, add_to_shared_module,
    remove_from_app_module, remove_from_shared_module, remove_path_alias, strip_jsonc,
};
pub use module_removal::{
    ModuleIdentity, confirm_removal, declared_module_type, ensure_expected_type, ensure_removable,
    remove_block, remove_from_app_yml, remove_microservice_app_blocks,
    remove_standard_module_references, resolve_cwd, resolve_module_identity,
};
pub use monorepo::{
    CacheEntryMeta, CacheIndex, FileHashCache, FingerprintMemo, MONOREPO_CACHE_DIR,
    MONOREPO_CACHE_VERSION, MonorepoTarget, TargetType, compute_task_hash, discover_targets,
    fingerprint_target, hash_root_inputs, is_git_workspace_root, load_cache_index,
    load_file_hash_cache, read_cache_entry, resolve_biome_command, resolve_tsc_command,
    save_file_hash_cache, sort_targets_by_dependencies, write_cache_entry,
};
pub(crate) use monorepo_footer::Footer;
pub use monorepo_footer::{BAR_WIDTH, FooterState, build_footer_lines};
pub use monorepo_group::{INSTALL_COMMAND, build_group, build_install_group};
pub(crate) use monorepo_scheduler::{SchedulerContext, run_group};
pub use monorepo_task::{Task, TaskStatus, format_duration};
pub use parallel::{Action, run_actions, run_actions_rendered};
pub use process::{ensure_bin, run_spinner_step, run_step};
pub use prompts::{
    ask_confirm, ask_destination, ask_destination_module, ask_input, ask_input_with_default,
    ask_multiselect, ask_name, ask_password, ask_plain_input, ask_route_method, ask_route_name,
    ask_route_path, ask_select, find_destination_modules, prompt_if_missing,
    resolve_name_and_destination, validate_destination, validate_name, validate_route_method,
    validate_route_name, validate_route_path,
};
pub use provider::{Provider, resolve_provider_client};
pub use publish_targets::{
    PublishTarget, discover_publish_targets, resolve_publish_targets, split_csv,
};
pub use run_module_scripts::{RunModuleScriptsOptions, run_module_scripts};
pub use runnable_modules::{
    RunnableModule, RunnableModuleType, collect_runnable_modules, select_runnable_modules,
};
pub use rust_module::is_rust_module;
pub use scaffold::{
    ScaffoldConfig, ScaffoldOptions, current_dir, ensure_module, install_dependency,
    resolve_scaffold_module, scaffold_resource,
};
pub use skeleton::{
    SKELETON_CACHE_MAX_AGE, SKELETON_REPO_URL, TEMPLATES_DIR_ENV, clone_skeleton, is_cache_stale,
    read_template, skeleton_templates_dir,
};

pub use style::{
    BAR_EMPTY, BAR_FILLED, LOADER_WIDTH, Loader, LoaderGroup, LoaderRow, Spinner, error, info,
    step, success, warn,
};
