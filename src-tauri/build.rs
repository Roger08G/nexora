fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        embed_resource::compile_for_tests("windows-test.rc", embed_resource::NONE)
            .manifest_required()
            .expect("failed to compile the Windows test manifest");
    }
}
