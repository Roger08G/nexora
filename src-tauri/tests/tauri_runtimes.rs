mod common;

use common::TestApp;
use serde_json::json;

#[test]
fn managed_runtime_supervisors_are_exposed_and_reject_unknown_projects() {
    let app = TestApp::new();

    let mongo = app.ok("managed_mongodb_status", json!({}));
    assert!(mongo["available"].is_boolean());
    assert_eq!(mongo["active"], false);
    app.ok("stop_managed_mongodb", json!({}));
    app.error(
        "start_managed_mongodb",
        json!({ "projectRoot": "Z:/nexora-project-that-does-not-exist" }),
        "not_found",
    );

    let postgres = app.ok("managed_postgresql_status", json!({}));
    assert!(postgres["available"].is_boolean());
    assert_eq!(postgres["active"], false);
    app.ok("stop_managed_postgresql", json!({}));
    app.error(
        "start_managed_postgresql",
        json!({ "projectRoot": "Z:/nexora-project-that-does-not-exist" }),
        "not_found",
    );
}
