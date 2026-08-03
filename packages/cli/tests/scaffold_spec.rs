use std::fs;
use std::sync::Once;

use cli::utils::{
    ScaffoldConfig, ScaffoldOptions, current_dir, install_dependency, scaffold_resource,
};

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

#[test]
fn scaffold_resource_renders_template_data_and_updates_the_module_registry() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let cwd = tmp.path();
    fs::create_dir_all(cwd.join("modules/shared/src/cache")).unwrap();
    fs::write(cwd.join("modules/shared/package.json"), "{}").unwrap();
    fs::write(
        cwd.join("modules/shared/src/SharedModule.ts"),
        "import { ExistingCache } from \"./cache/ExistingCache\";\n\nexport const SharedModule = {\n  cache: [ExistingCache],\n};\n",
    )
    .unwrap();

    let config = ScaffoldConfig {
        label: "Cache",
        prompt_message: "Enter cache name",
        suffix: "Cache",
        template: "export const {{NAME}} = \"{{KIND}}\";\n".to_string(),
        test_template: "// {{NAME}} in {{MODULE}}\n".to_string(),
        dir: "cache",
        tests_dir: Some("generated"),
        module_field: Some("cache"),
        template_data: Some(Box::new(|name| vec![("KIND", format!("{name} cache"))])),
        ..Default::default()
    };

    scaffold_resource(
        &config,
        ScaffoldOptions {
            name: Some("redis".to_string()),
            module: Some("shared".to_string()),
            r#override: true,
        },
        cwd,
    );

    let source = cwd.join("modules/shared/src/cache/RedisCache.ts");
    assert_eq!(
        fs::read_to_string(&source).unwrap(),
        "export const Redis = \"Redis cache\";\n"
    );
    assert!(
        cwd.join("modules/shared/tests/generated/RedisCache.spec.ts")
            .exists()
    );

    let module_file = fs::read_to_string(cwd.join("modules/shared/src/SharedModule.ts")).unwrap();
    assert!(module_file.contains("import { RedisCache } from \"./cache/RedisCache\";"));
    assert!(module_file.contains("cache: [ExistingCache, RedisCache]"));
}

#[test]
fn install_dependency_returns_early_for_missing_invalid_or_already_present_package_json() {
    let tmp = tempfile::tempdir().expect("tempdir");
    install_dependency("left-pad", tmp.path());

    fs::write(tmp.path().join("package.json"), "{ definitely not json").unwrap();
    install_dependency("left-pad", tmp.path());

    fs::write(
        tmp.path().join("package.json"),
        r#"{"dependencies":{"left-pad":"1.0.0"}}"#,
    )
    .unwrap();
    install_dependency("left-pad", tmp.path());
}

#[test]
fn current_dir_matches_the_process_working_directory() {
    let here = std::env::current_dir().expect("cwd");

    assert_eq!(current_dir(), here);
}
