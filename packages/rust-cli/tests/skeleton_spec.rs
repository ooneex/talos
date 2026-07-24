use rust_cli::utils::{SKELETON_REPO_URL, clone_skeleton, read_template};

#[test]
fn skeleton_repo_url_points_at_the_ooneex_skeleton_repo() {
    assert_eq!(SKELETON_REPO_URL, "https://github.com/ooneex/skeleton.git");
}

#[test]
fn read_template_returns_the_file_contents_for_a_nested_template() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let templates_dir = tmp.path();
    std::fs::create_dir_all(templates_dir.join("module")).unwrap();
    std::fs::write(
        templates_dir.join("module/module.txt"),
        "export class {{NAME}}Module {}\n",
    )
    .unwrap();

    let content = read_template(templates_dir, "module/module.txt");

    assert_eq!(content.as_deref(), Some("export class {{NAME}}Module {}\n"));
}

#[test]
fn read_template_returns_none_when_the_template_is_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(read_template(tmp.path(), "does-not-exist.txt").is_none());
}

#[test]
#[ignore = "requires network access to clone the real skeleton repository"]
fn clone_skeleton_clones_into_the_user_cache() {
    let cloned = clone_skeleton(true, true).expect("clone should succeed");
    assert!(cloned.ends_with(".talos/skeleton"));
    assert!(cloned.join("package.json").is_file());
}
