use std::fs;
use std::sync::Once;

use cli::utils::{ScaffoldConfig, ScaffoldOptions, scaffold_resource};

static INIT_TEMPLATES: Once = Once::new();

fn use_fixture_templates() {
    INIT_TEMPLATES.call_once(|| {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/templates");
        unsafe {
            std::env::set_var(cli::utils::TEMPLATES_DIR_ENV, dir);
        }
    });
}

const TEMPLATE: &str = "export class {{NAME}}Cache {}\n";
const TEST_TEMPLATE: &str = "// {{NAME}} in {{MODULE}}\n";

fn cache_config() -> ScaffoldConfig {
    ScaffoldConfig {
        label: "Cache",
        prompt_message: "Enter cache name",
        suffix: "Cache",
        template: TEMPLATE.to_string(),
        test_template: TEST_TEMPLATE.to_string(),
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
    use_fixture_templates();
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
