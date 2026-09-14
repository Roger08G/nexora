# Backport de GLib 0.18.5

Nexora conserva temporalmente GTK 3 y su dependencia `glib 0.18`. Esta copia incorpora la corrección de [RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) sin cambiar su versión ni introducir una migración incompatible de GTK.

## Procedencia y modificación

- Fuente: [crate oficial `glib 0.18.5`](https://static.crates.io/crates/glib/glib-0.18.5.crate), 267 679 bytes.
- SHA256 del archivo original: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
- Licencia: MIT; se conservan `LICENSE`, `COPYRIGHT` y `.cargo_vcs_info.json` originales.
- Corrección: [commit upstream `05dff0e`](https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb), procedente de [gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343).
- Única modificación: en `src/variant_iter.rs`, declarar `p` mutable y pasar `&mut p` a la función FFI. El [parche](./glib-variant-str-iter.patch) reproduce esas dos líneas.

[glib-backport.json](./glib-backport.json) registra los 121 archivos publicados, sus tamaños y hashes originales, y el hash del único archivo modificado. El verificador fija también el hash del inventario, por lo que actualizar sus entradas no basta para aceptar cambios adicionales.

No deben copiarse marcadores de la caché de Cargo ni generarse `Cargo.lock`, `target/` u otros archivos dentro de `src-tauri/vendor/glib-0.18.5`. Los formatos globales excluyen este directorio. Git conserva sus bytes sin normalizar finales de línea.

## Comprobaciones

```sh
node scripts/security/verify-glib-patch.mjs
node --test scripts/security/verify-glib-patch.test.mjs
node scripts/security/verify-glib-patch.mjs --metadata
cargo fmt --manifest-path scripts/security/glib-variant-iter/Cargo.toml -p nexora-glib-security-regression --check
cargo test --manifest-path scripts/security/glib-variant-iter/Cargo.toml -p nexora-glib-security-regression --locked --release
```

El modo `--metadata` consulta los grafos efectivos de Nexora y del harness para `x86_64-unknown-linux-gnu` con los lockfiles fijados. Debe alcanzar el mismo vendor local en ambos. Puede descargar las fuentes de las dependencias; no compila Nexora.

El harness requiere Linux, `pkg-config`, `libglib2.0-dev` y Rust 1.98. Se ejecuta en modo release porque el fallo FFI original depende de las optimizaciones. Cubre iteración directa, inversa, saltos, Unicode, cadenas vacías, mezcla de extremos y agotamiento. Esto no constituye una validación completa de Nexora para Linux.

## Límite de los avisos automáticos

La versión publicada `0.18.5` sigue incluida en el rango del aviso; Nexora aplica un backport local, no una versión upstream corregida. Algunos analizadores omiten dependencias `path`: la desaparición del aviso no demuestra la reparación. Su evidencia son la corrección upstream exacta, la integridad de la copia, su uso efectivo y las pruebas optimizadas. No se añade una excepción de auditoría ni se falsifica la versión de GLib.

Cuando la cadena GTK/Tauri permita una versión upstream corregida y compatible, deberá retirarse este override junto con sus verificaciones específicas tras validar la migración.
