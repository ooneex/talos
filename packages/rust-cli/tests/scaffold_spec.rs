//! Integration tests for `rust_cli::utils::scaffold_resource`, mirroring
//! `packages/cli/src/scaffold.ts`'s `scaffoldResource`. Uses a representative
//! config (mirroring `CacheCreateCommand`) since every `*:create` command
//! that uses `scaffold_resource` shares the same code path.

use std::fs;

use rust_cli::utils::{ScaffoldConfig, ScaffoldOptions, scaffold_resource};

const TEMPLATE: &str = "export class {{NAME}}Cache {}\n";
const TEST_TEMPLATE: &str = "// {{NAME}} in {{MODULE}}\n";

fn cache_config() -> ScaffoldConfig {
    ScaffoldConfig {
        label: "Cache",
        prompt_message: "Enter cache name",
        suffix: "Cache",
        template: TEMPLATE,
        test_template: TEST_TEMPLATE,
        dir: "cache",
        dependency: None,
        ..Default::default()
    }
}

#[test]
fn scaffold_resource_writes_source_and_test_files_with_pascal_cased_name() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    fs::create_dir_all(cwd.join("modules/shared")).unwrap();
    fs::write(cwd.join("modules/shared/package.json"), "{}").unwrap();

    scaffold_resource(
        &cache_config(),
        ScaffoldOptions {
            name: Some("redis".to_string()),
            module: Some("shared".to_string()),
            r#override: false,
        },
        cwd,
    );

    let source = cwd.join("modules/shared/src/cache/RedisCache.ts");
    let test = cwd.join("modules/shared/tests/cache/RedisCache.spec.ts");
    assert!(source.exists());
    assert!(test.exists());
    assert_eq!(
        fs::read_to_string(source).unwrap(),
        "export class RedisCache {}\n"
    );
    assert_eq!(fs::read_to_string(test).unwrap(), "// Redis in shared\n");
}

#[test]
fn scaffold_resource_strips_the_suffix_when_the_user_already_included_it() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    fs::create_dir_all(cwd.join("modules/shared")).unwrap();
    fs::write(cwd.join("modules/shared/package.json"), "{}").unwrap();

    scaffold_resource(
        &cache_config(),
        ScaffoldOptions {
            name: Some("RedisCache".to_string()),
            module: Some("shared".to_string()),
            r#override: false,
        },
        cwd,
    );

    assert!(cwd.join("modules/shared/src/cache/RedisCache.ts").exists());
}

#[test]
fn scaffold_resource_creates_the_destination_module_when_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();

    scaffold_resource(
        &cache_config(),
        ScaffoldOptions {
            name: Some("redis".to_string()),
            module: Some("billing".to_string()),
            r#override: false,
        },
        cwd,
    );

    assert!(cwd.join("modules/billing/package.json").exists());
    assert!(cwd.join("modules/billing/src/cache/RedisCache.ts").exists());
}
