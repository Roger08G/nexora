# Paquetes Windows

Los scripts requieren PowerShell 7.2 o posterior. La descarga de runtimes es explícita, no se ejecutan
instaladores ni se leen credenciales y no se sobrescriben paquetes existentes. Los artefactos se generan en `artifacts/`, fuera
de Git. Las versiones de MongoDB y PostgreSQL deben coincidir con las fijadas por el backend.

## Preparar los runtimes

Descarga y verifica las distribuciones fijadas por esta versión:

```powershell
./scripts/release/fetch-runtimes.ps1
```

El destino predeterminado es `artifacts/verified-runtimes/`. `-ArchiveCache` permite reutilizar los ZIP
locales, comprobando de nuevo sus hashes; `-ExportEnvironment` se utiliza únicamente en GitHub Actions.
La extracción valida todas las entradas y omite componentes que Nexora no utiliza.

También puedes utilizar distribuciones oficiales previamente descargadas y verificadas. MongoDB puede tener
`mongod.exe` en la raíz o en `bin`; sus licencias deben estar en la raíz indicada. PostgreSQL requiere
la carpeta `pgsql` completa de la distribución EDB. Los hashes opcionales identifican los ZIP de
origen y se conservan en la procedencia; el script verifica además versión, arquitectura y cada
archivo que se copia.

```powershell
./scripts/release/package-windows.ps1 -PrepareOnly `
    -MongoDBRoot ./artifacts/verified-runtimes/mongodb-8.3.11/mongodb-win32-x86_64-windows-8.3.11 `
    -PostgreSQLHome ./artifacts/verified-runtimes/postgresql-18.6-3/pgsql `
    -MongoDBArchiveSha256 55574B06B41848207213A5E69575DD3487ABF3CF07ECFE01B3AEF1BAB0084241 `
    -PostgreSQLArchiveSha256 59F8CE701C63C2ED623C665A5E51B3EF6F2E37CCF837B68FFEED0742D0AE6ABD
```

El staging `artifacts/windows-runtime/` contiene:

- MongoDB Community Server 8.3.11, su licencia SSPL y sus avisos originales.
- PostgreSQL 18.6: `bin`, `lib`, `share` y las licencias del servidor y herramientas.
- El CRT x64 redistribuible de Visual Studio junto a los ejecutables que lo necesitan.
- `THIRD-PARTY-NOTICES.md`, con las fuentes correspondientes de los motores y las licencias.
- `runtime-provenance.json` y `runtime-checksums.sha256` para verificar todo su contenido.

No incluye pgAdmin, StackBuilder, clústeres, logs ni datos de proyectos. El CRT se localiza mediante
`vswhere`; `-MsvcRuntimeDirectory` permite especificar su directorio `Microsoft.VC*.CRT`. No se copian
DLL de `System32`. Si el staging ya existe, utiliza `-PackageOnly` o indica otro `-RuntimeDirectory`.
El instalador Tauri puede incorporar este mismo staging como recursos preservando su estructura.

## Generar y verificar el ZIP

Con los cambios confirmados y el árbol de Git limpio, compila con Tauri y genera el paquete desde
ese mismo commit. El manifiesto registra HEAD, pero no sustituye esa comprobación de procedencia:

```powershell
bun run tauri build --no-bundle --ci -- --locked
./scripts/release/package-windows.ps1 -PackageOnly -BinaryPath ./src-tauri/target/release/nexora.exe
$releaseVersion = (Get-Content ./package.json -Raw | ConvertFrom-Json).version
./scripts/release/verify-windows-package.ps1 -Path "./artifacts/releases/Nexora_${releaseVersion}_windows-x64-portable.zip"
```

Si la compilación usa `CARGO_TARGET_DIR`, pasa la ruta real del ejecutable. No hay rutas personales
fijadas en los scripts. `-RequireSignature` exige Authenticode válido cuando se dispone de firma;
sin ese parámetro, la procedencia registra su estado real. El SHA-256 no acredita la identidad del
editor. `-AllowDirty` queda reservado para pruebas locales y marca esa condición en el manifiesto.

El ZIP incluye `Nexora.exe`, los runtimes, licencias, instrucciones, `release-manifest.json` y un
`SHA256SUMS.txt` por archivo. Se acompaña de un `.zip.sha256` independiente. La verificación rechaza
archivos alterados, ausentes, adicionales y rutas o nombres duplicados. La construcción ordena los
archivos y usa la fecha del commit: con los mismos archivos y compresor .NET produce el mismo ZIP.
Esto no implica que las compilaciones de Rust/Tauri sean reproducibles bit a bit.

Para producir también el instalador NSIS con los mismos runtimes, utiliza `bun run release:windows`
en lugar del build sin bundle. Los instaladores quedan en `target/release/bundle/nsis/` dentro del
directorio Cargo configurado. La configuración de empaquetado no afecta a los builds de desarrollo.

El ZIP requiere WebView2 Evergreen del sistema. La aplicación y los motores no requieren instalar
servicios; las credenciales y preferencias permanecen ligadas a la cuenta de Windows. Mover una base
de datos a otro equipo requiere una exportación/migración, no basta con copiar su clúster.

## Regresiones del empaquetado

```powershell
./scripts/release/test-packaging.ps1
```

Esta suite usa archivos ficticios y comprueba integridad, rechazo de rutas peligrosas, ausencia de
sobrescrituras y reproducibilidad del ZIP. No inicia servidores ni altera certificados.
