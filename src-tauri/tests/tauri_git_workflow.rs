mod common;

use common::{TempDirectory, TestApp};
use serde_json::{json, Value};

fn request() -> Value {
    json!({
        "id": "health", "collectionId": "general", "collectionName": "General",
        "name": "Salud", "method": "GET", "url": "{{baseUrl}}/health",
        "params": [], "headers": [], "body": ""
    })
}

#[test]
fn request_saves_preserve_external_edits_and_require_a_loaded_baseline() {
    let app = TestApp::new();
    let project = TempDirectory::new("git-conflict");
    let root = project.string();
    app.ok("create_project", json!({ "root": root, "name": "Git" }));
    let baseline = app.ok(
        "save_request",
        json!({ "projectRoot": root, "request": request() }),
    );
    let path = project.path().join("requests/general/health.json");
    let mut external = baseline.clone();
    external["url"] = json!("{{baseUrl}}/health/from-git");
    let external_bytes = serde_json::to_vec(&external).unwrap();
    std::fs::write(&path, &external_bytes).unwrap();
    let mut draft = baseline.clone();
    draft["name"] = json!("Borrador de Nexora");
    app.error(
        "save_request",
        json!({
            "projectRoot": root, "request": draft, "expectedRequest": baseline
        }),
        "conflict",
    );
    assert_eq!(std::fs::read(&path).unwrap(), external_bytes);
    app.error(
        "save_request",
        json!({ "projectRoot": root, "request": draft }),
        "conflict",
    );

    // A no-op must not create whitespace-only diffs in Git.
    app.ok(
        "save_request",
        json!({ "projectRoot": root, "request": external, "expectedRequest": baseline }),
    );
    assert_eq!(std::fs::read(&path).unwrap(), external_bytes);
    let updated = app.ok(
        "save_request",
        json!({
            "projectRoot": root, "request": draft, "expectedRequest": external
        }),
    );
    assert_eq!(updated["name"], "Borrador de Nexora");
    std::fs::remove_file(&path).unwrap();
    app.error(
        "save_request",
        json!({
            "projectRoot": root, "request": draft, "expectedRequest": updated
        }),
        "conflict",
    );
    assert!(
        !path.exists(),
        "autosave must not resurrect a file deleted by Git"
    );
    let folder = project.path().join("requests/general");
    let metadata = project.path().join("folders/general.json");
    std::fs::remove_dir(&folder).unwrap();
    std::fs::remove_file(&metadata).unwrap();
    app.error(
        "save_request",
        json!({
            "projectRoot": root, "request": draft, "expectedRequest": updated
        }),
        "conflict",
    );
    assert!(!folder.exists());
    assert!(!metadata.exists());
}

#[test]
fn unknown_request_fields_are_not_silently_discarded() {
    let app = TestApp::new();
    let project = TempDirectory::new("future-request");
    let root = project.string();
    app.ok("create_project", json!({ "root": root, "name": "Git" }));
    let baseline = app.ok(
        "save_request",
        json!({ "projectRoot": root, "request": request() }),
    );
    let path = project.path().join("requests/general/health.json");
    let mut external = baseline.clone();
    external["futureField"] = json!({ "mustSurvive": true });
    let external_bytes = serde_json::to_vec(&external).unwrap();
    std::fs::write(&path, &external_bytes).unwrap();
    assert!(app
        .invoke(
            "save_request",
            json!({
                "projectRoot": root, "request": baseline, "expectedRequest": baseline
            })
        )
        .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), external_bytes);
}

#[test]
fn git_clone_keeps_definitions_but_not_database_or_history_data() {
    fn git(directory: &std::path::Path, arguments: &[&str]) {
        let result = std::process::Command::new("git")
            .current_dir(directory)
            .args(arguments)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "git failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
    let app = TestApp::new();
    let project = TempDirectory::new("git-source");
    let clone_parent = TempDirectory::new("git-clone");
    let root = project.string();
    let original = app.ok(
        "create_project",
        json!({ "root": root, "name": "Proyecto compartido" }),
    );
    app.ok(
        "save_request",
        json!({ "projectRoot": root, "request": request() }),
    );
    let runtime = project.path().join(".nexora/runtime");
    std::fs::create_dir_all(runtime.join("mongodb/data")).unwrap();
    std::fs::write(runtime.join("mongodb/data/private.bin"), "private fixture").unwrap();
    std::fs::write(runtime.join("history.json"), "private fixture").unwrap();
    git(project.path(), &["init", "--quiet"]);
    for rules in [
        " runtime/\n",
        "\truntime/\n",
        "runtime/\n!runtime/\n!runtime/**\n",
    ] {
        std::fs::write(project.path().join(".nexora/.gitignore"), rules).unwrap();
        app.ok("open_project", json!({ "root": root }));
        git(
            project.path(),
            &[
                "check-ignore",
                "--quiet",
                ".nexora/runtime/mongodb/data/private.bin",
            ],
        );
    }
    git(project.path(), &["add", "."]);
    git(
        project.path(),
        &[
            "-c",
            "user.name=Nexora Test",
            "-c",
            "user.email=test@nexora.invalid",
            "commit",
            "--quiet",
            "-m",
            "Test definitions",
        ],
    );
    let clone = clone_parent.path().join("workspace");
    git(
        clone_parent.path(),
        &[
            "clone",
            "--quiet",
            "--no-hardlinks",
            &root,
            clone.to_str().unwrap(),
        ],
    );
    assert!(!clone.join(".nexora/runtime").exists());
    let opened = app.ok("open_project", json!({ "root": clone.to_str().unwrap() }));
    assert_eq!(opened["id"], original["id"]);
    assert_eq!(opened["requestCount"], 1);
    assert!(clone.join("requests/general/health.json").is_file());
    assert!(clone.join("folders/general.json").is_file());
}
