# Nexora

Nexora es un workspace de desarrollo backend local-first para Windows, construido con Tauri,
React, TypeScript y Rust. Su objetivo es centralizar pruebas de APIs REST y servidores locales de
MongoDB y PostgreSQL dentro de proyectos versionables con Git.

## Estado

El MVP local ya conecta el frontend con el núcleo Rust. Incluye:

- Shell de escritorio modular con navegación entre espacios de trabajo.
- Selector inicial para abrir un proyecto `.nexora` existente o crear uno nuevo.
- Cliente REST con ejecución HTTP real, status, headers, body, duración y tamaño de respuesta.
- Proyectos locales `.nexora` y una petición JSON por archivo para obtener diffs claros en Git.
- Carpetas persistentes, menú contextual para renombrar o eliminar rutas y guardado automático.
- Pestañas de ruta cerrables con `Ctrl+W` sin permitir cerrar la última petición abierta.
- Historial HTTP local con búsqueda, repetición y limpieza controlada.
- Monitores locales configurables, ejecución manual o periódica y registro en el historial.
- MongoDB local administrado por proyecto y conexión opcional a servidores externos.
- Consulta de MongoDB, creación de colecciones e inserción, edición y borrado de documentos.
- PostgreSQL 18.6 local administrado por proyecto, con esquemas, tablas y editor SQL.
- Variables de sesión para resolver `{{referencias}}` sin guardar secretos en el proyecto.
- Búsqueda global con `Ctrl+K` para módulos, peticiones, colecciones y tablas cargadas.
- Ajustes locales persistentes y notificaciones Sonner para las operaciones principales.
- Transición SilkWave durante la carga del proyecto, ajustada al tamaño de sus datos locales.
- Diseño adaptable, navegación accesible y soporte para movimiento reducido.

Las escrituras PostgreSQL requieren confirmación y se validan primero dentro de una transacción de
solo lectura. MongoDB exige filtros no vacíos para editar o borrar, y las URI externas solo viven
durante la sesión. El núcleo limita tiempos, respuestas HTTP, filas SQL y documentos MongoDB para
mantener estable la aplicación.

Todavía no forman parte de este MVP los workflows API → diff de base de datos, la importación de
cURL/OpenAPI/Postman, índices MongoDB y la exportación CSV.

## Tecnologías

- Tauri 2 y Rust.
- React 19 y TypeScript.
- Vite y Bun.
- Three.js para la animación de inicio.

## Estructura

```text
src/
├── app/       # arranque, providers, configuración y shell
├── modules/   # páginas, componentes, servicios y tipos por dominio
└── shared/    # componentes, servicios, hooks, estilos y tipos reutilizables

src-tauri/src/
├── commands/ # proyectos, HTTP, MongoDB y PostgreSQL
├── error.rs  # errores serializables para IPC
└── state.rs  # clientes HTTP y conexiones MongoDB en memoria
```

Las importaciones internas utilizan el alias `@/`.

## Desarrollo

Requisitos: Bun y el toolchain estable de Rust.

```bash
bun install
bun run dev
```

`bun run dev` solo previsualiza la interfaz. Para usar diálogos, proyectos y motores nativos debe
ejecutarse `bun run tauri dev`.

## Formato de proyecto

```text
mi-proyecto/
└── .nexora/
    ├── .gitignore       # excluye runtime/
    ├── folders/         # una carpeta JSON aunque todavía no tenga rutas
    │   └── general.json
    ├── monitors/        # definiciones versionables, nunca incluyen secretos
    │   └── monitor-<uuid>.json
    ├── project.json
    ├── runtime/         # datos e historial local, no versionados
    │   └── http-history.json
    └── requests/
        └── general/
            └── request-<uuid>.json
```

Los archivos de petición guardan referencias como `Bearer {{token}}`, no el valor de `token`.
Al ejecutar, Nexora resuelve variables en URL, nombres y valores de query y headers, y body. Las
referencias incompletas o sin valor producen un error antes de enviar tráfico. Nexora bloquea
credenciales directas en headers, parámetros y campos JSON sensibles conocidos.

El historial conserva un máximo de 500 ejecuciones en `runtime/`, que está ignorado por Git. Solo
registra método, ruta sin query ni credenciales, estado y métricas; no persiste variables de sesión,
headers, cuerpos de petición ni cuerpos de respuesta. Los monitores ejecutan peticiones guardadas
mientras Nexora permanece abierto y utilizan los valores de sesión que existan en ese momento.

## MongoDB local administrado

En Windows, Nexora busca MongoDB Community Server 8.3.8 en:

```text
%LOCALAPPDATA%\Nexora\runtimes\mongodb\8.3.8\mongod.exe
```

El proceso se inicia oculto en `127.0.0.1` con un puerto libre, autenticación habilitada y datos
aislados en `.nexora/runtime/mongodb`. Nexora crea una credencial distinta por proyecto y guarda la
contraseña en Windows Credential Manager; no la escribe en Git ni la expone en la interfaz. Al
desconectar o cerrar Nexora, el proceso administrado se detiene.

La variable `NEXORA_MONGOD_PATH` permite utilizar otro ejecutable durante desarrollo. No se debe
versionar `mongod.exe` dentro del repositorio.

## PostgreSQL local administrado

Nexora utiliza el ZIP de binarios para Windows publicado por EDB y enlazado desde PostgreSQL.org.
Busca PostgreSQL 18.6 en:

```text
%LOCALAPPDATA%\Nexora\runtimes\postgresql\18.6\pgsql\
```

No se importan archivos SQL ni bases SQLite. Al iniciar el espacio PostgreSQL, Nexora crea un
clúster real en `.nexora/runtime/postgresql`, lo enlaza exclusivamente a `127.0.0.1` en un puerto
libre y prepara la base `nexora`. Cada proyecto tiene una contraseña aleatoria almacenada en Windows
Credential Manager. Los datos, logs y credenciales quedan fuera de Git.

La variable `NEXORA_POSTGRESQL_HOME` permite indicar otra distribución completa durante desarrollo;
debe apuntar a la carpeta que contiene `bin`, `lib` y `share`.

## Verificación

```bash
bun run fmt:check
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
cargo build --manifest-path src-tauri/Cargo.toml --release
```

Las pruebas reales de los runtimes son opcionales porque requieren sus binarios y Windows Credential
Manager:

```bash
cargo test --manifest-path src-tauri/Cargo.toml runs_an_authenticated_project_database_end_to_end -- --ignored
cargo test --manifest-path src-tauri/Cargo.toml runs_managed_postgresql_end_to_end -- --ignored
```

## Aplicación de escritorio

```bash
bun run tauri dev
bun run tauri build
```

Nexora funciona sin cuentas, nube ni telemetría. Los proyectos y sus rutas de API permanecen en
local y se pueden versionar con Git sin incluir los valores de las variables de sesión.
