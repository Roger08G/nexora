# Revisión de seguridad y calidad — 2.0.0

Fecha: 12 de septiembre de 2026. Alcance: aplicación Windows, frontend React, comandos Tauri,
persistencia de proyectos, clientes HTTP/MongoDB/PostgreSQL, dependencias y distribución.
La revisión combina lectura del código con regresiones automatizadas y servicios locales de
prueba. No es una certificación ni una prueba sobre servidores de terceros.

## Correcciones

| Área         | Corrección                                                                                                | Comprobación                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| HTTP         | Redirecciones automáticas limitadas al mismo origen; no se reenvían datos a otro servidor.                | Servidores HTTP locales y pruebas del IPC.                         |
| Variables    | Presupuesto agregado después de resolver plantillas y validación de valores repetidos.                    | Regresiones de tamaño y variables en URL, headers y body.          |
| Proyectos    | Rechazo de identificadores incompatibles, duplicados y carpetas enlazadas; límites agregados de lectura.  | Archivos y junctions temporales de Windows.                        |
| Persistencia | Reemplazo atómico sin retirar primero el archivo original.                                                | Pruebas de reemplazo y conservación frente a entradas inválidas.   |
| Guardado     | Cola por petición; eliminación y cambio de proyecto coordinados con los guardados pendientes.             | Pruebas unitarias de concurrencia y WebView.                       |
| Selección    | Resultados asíncronos ligados a la petición, consulta o colección que los originó.                        | Regresiones de cambio de selección.                                |
| Sesión       | Estado de interfaz y variables de sesión aislados por raíz, incluso entre clones con el mismo ID.         | Claves del contexto y regresión de proyecto clonado.               |
| MongoDB      | Comandos del explorador/CRUD: respuesta de 30 s y hasta 16 operaciones pendientes sin cancelar el driver. | Tests del supervisor y CRUD real.                                  |
| PostgreSQL   | Conservación de columnas en resultados vacíos y de nombres repetidos sin pérdida de valores.              | Consultas reales y exportación CSV.                                |
| Arranque SQL | Uso de `pg_ctl` con privilegios reducidos en Windows, timeout y verificación de PID/puerto.               | IPC real en Windows local y runner de CI elevado.                  |
| Distribución | Runtimes junto al ejecutable, versiones y arquitectura comprobadas, inventario SHA-256.                   | Verificación del paquete y pruebas de manipulación del manifiesto. |

## Dependencias

- Se actualizan las dependencias directas y transitivas compatibles de Rust, React, TypeScript,
  Vite y WebdriverIO. Los manifiestos de bloqueo permanecen versionados.
- `js-yaml` y `diff` utilizan versiones corregidas mediante resoluciones explícitas.
- `extract-zip` no dispone de versión corregida para
  [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) y
  [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3).
  El parche local rechaza enlaces incluidos en el ZIP y destinos especiales existentes. La CI
  verifica ese comportamiento antes de aceptar exclusivamente esas dos excepciones.
- Cargo Audit mantiene avisos upstream de mantenimiento (`proc-macro-error` y familia `unic`)
  y un aviso de solidez de memoria en `glib`, dependencia de la plataforma Linux que no se compila
  en el ejecutable Windows. No se ocultan esos avisos ni se afirma que la auditoría está vacía.
- MongoDB pasa a `8.3.11`, que incorpora correcciones de seguridad publicadas por el proveedor.
  Se verifica el archivo con su SHA-256 oficial.
  [Notas de MongoDB 8.3](https://www.mongodb.com/docs/manual/release-notes/8.3/).
- PostgreSQL utiliza el paquete Windows `18.6-3` de EDB. Su hash se fija a partir de la descarga
  HTTPS del proveedor; no se presenta como una firma digital de EDB.

## Rendimiento y diseño

Los visores y editores memoizan la tokenización del código, y la clasificación de tokens JSON
evita crear una copia de todo el sufijo por cada cadena. La fuente monoespaciada, los colores,
la numeración y la indentación permanecen iguales. Los monitores evitan ejecuciones superpuestas.
Los logs de motores se leen por su tramo final acotado.

El nuevo icono conserva la luna violeta y una estrella, con menos detalle a tamaño de barra de
tareas. La interfaz utiliza un PNG de 128 píxeles: el recurso pasa de 287.170 a 14.706 bytes.
El perfil release utiliza LTO ligero, una unidad de generación y eliminación de símbolos.

## Controles de entrega

- Formato, TypeScript de aplicación y tests, regresiones Bun, build frontend y parche ZIP.
- Rustfmt, Clippy, Cargo Audit, tests unitarios y de integración del IPC.
- MongoDB y PostgreSQL reales sobre proyectos temporales, más suite WebView de Tauri.
- CI con acciones fijadas por revisión, compilador y Bun fijados, permisos mínimos por trabajo.
- Runtimes descargados por HTTPS, hashes fijados, licencias incluidas e inventario del ZIP.

La edición portable requiere WebView2 del sistema. El instalador puede preparar ese requisito.
Las credenciales de las bases locales permanecen asociadas a la cuenta de Windows, y no viajan
automáticamente al copiar una carpeta. Los ejecutables de esta versión se publican sin Authenticode.

Dos clones con el mismo UUID bajo la misma cuenta comparten la entrada nativa de credenciales;
el aislamiento por raíz descrito arriba se aplica a la interfaz y sus variables de sesión.
Un timeout MongoDB devuelve el control a la interfaz, pero la operación puede seguir terminando
en segundo plano. Antes de repetir una escritura debe comprobarse su resultado.

El arranque PostgreSQL utiliza el mecanismo de proceso restringido de `pg_ctl`, también cuando
Nexora hereda un token elevado. Las rutas con marcadores de expansión de `cmd.exe` se rechazan si
Windows no ofrece un nombre corto seguro, para no introducir interpretación de variables al
lanzar el motor. No se modifica la configuración de UAC ni se instala un servicio.
