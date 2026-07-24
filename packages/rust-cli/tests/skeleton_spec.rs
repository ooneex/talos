use rust_cli::utils::{SKELETON_REPO_URL, clone_skeleton};

#[test]
fn skeleton_repo_url_points_at_the_ooneex_skeleton_repo() {
    assert_eq!(SKELETON_REPO_URL, "https://github.com/ooneex/skeleton.git");
}

#[test]
#[ignore = "requires network access to clone the real skeleton repository"]
fn clone_skeleton_clones_into_the_user_cache() {
    let cloned = clone_skeleton(true, true).expect("clone should succeed");
    assert!(cloned.ends_with(".talos/skeleton"));
    assert!(cloned.join("package.json").is_file());
}
