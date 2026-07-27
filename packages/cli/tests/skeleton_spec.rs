use cli::utils::{
    SKELETON_CACHE_MAX_AGE, SKELETON_REPO_URL, clone_skeleton, is_cache_stale, read_template,
};
use filetime::{FileTime, set_file_mtime};
use std::time::{Duration, SystemTime};

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

#[test]
fn is_cache_stale_is_true_when_the_directory_is_missing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let missing = tmp.path().join("does-not-exist");

    assert!(is_cache_stale(&missing));
}

#[test]
fn is_cache_stale_is_false_for_a_freshly_created_directory() {
    let tmp = tempfile::tempdir().expect("tempdir");

    assert!(!is_cache_stale(tmp.path()));
}

#[test]
fn is_cache_stale_is_true_when_older_than_the_max_age() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let stale = SystemTime::now() - SKELETON_CACHE_MAX_AGE - Duration::from_secs(60);
    set_file_mtime(tmp.path(), FileTime::from_system_time(stale)).expect("set mtime");

    assert!(is_cache_stale(tmp.path()));
}

#[test]
fn is_cache_stale_is_false_when_within_the_max_age() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let recent = SystemTime::now() - SKELETON_CACHE_MAX_AGE + Duration::from_secs(60 * 60);
    set_file_mtime(tmp.path(), FileTime::from_system_time(recent)).expect("set mtime");

    assert!(!is_cache_stale(tmp.path()));
}
