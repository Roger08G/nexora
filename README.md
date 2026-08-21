# Nexora

Nexora es un workspace de desarrollo backend local-first para Windows, construido con Tauri,
React, TypeScript y Rust. Su objetivo es centralizar pruebas de APIs REST, exploración de MongoDB
y trabajo con SQLite dentro de proyectos locales y versionables con Git.

## Estado

El frontend MVP está cerrado. Incluye:

- Shell de escritorio modular con navegación entre espacios de trabajo.
- Cliente REST con colecciones, pestañas, editor de URL, métodos, parámetros, headers y body.
- Vistas de exploración para MongoDB y SQLite.
- Estados vacíos honestos, datos de muestra y controles preparados para el núcleo local.
- Splash animado, identidad visual de Nexora y tipografía diferenciada para interfaz y datos.
- Diseño adaptable, navegación accesible y soporte para movimiento reducido.

El motor HTTP, los drivers de MongoDB y SQLite, la persistencia de proyectos y la gestión de
secretos todavía no están conectados. La interfaz no simula ejecuciones reales.

## Tecnologías

- Tauri 2 y Rust.
- React 19 y TypeScript.
- Vite y Bun.
- Three.js para la animación de inicio.

## Estructura

```text
src/
├── app/       # arranque, configuración y shell
├── modules/   # API, MongoDB, SQLite y módulos auxiliares
└── shared/    # componentes, hooks, estilos y tipos reutilizables

src-tauri/   # configuración y núcleo nativo
```

Las importaciones internas utilizan el alias `@/`.

## Desarrollo

Requisitos: Bun y el toolchain estable de Rust.

```bash
bun install
bun run dev
```

## Verificación

```bash
bun run fmt:check
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo build --manifest-path src-tauri/Cargo.toml --release
```

## Aplicación de escritorio

```bash
bun run tauri dev
bun run tauri build
```

Nexora funciona sin cuentas, sin nube y sin telemetría. Los proyectos y sus rutas de API se
diseñarán para permanecer en local y poder versionarse con Git sin incluir secretos.
