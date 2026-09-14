# Revisión de seguridad y calidad — 2.2.0

Fecha: 14 de septiembre de 2026. Alcance: aplicación Windows, persistencia de proyectos,
interfaz React, comandos Tauri, HTTP, MongoDB, PostgreSQL y distribución. Se revisan funciones
existentes; no se añaden importadores, workflows ni un motor de assertions.

## Correcciones y regresiones

| Área                   | Corrección                                                                                                                                                   | Regresión                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Git y guardado         | Compara la petición con la versión cargada antes de modificarla. Un conflicto conserva el borrador y no recrea recursos eliminados.                          | IPC con edición y borrado externos; WebView con conflicto y recarga.                    |
| Integridad del formato | Rechaza campos de petición desconocidos antes de sobrescribirlos. Los guardados sin cambios no reescriben JSON ni fechas de monitores.                       | Conservación exacta de los bytes originales.                                            |
| Datos privados         | La regla que excluye `runtime/` se mantiene efectiva frente a negaciones y sangrías incorrectas.                                                             | Git real: exclusión, commit y clon con definiciones, sin historial ni datos de motores. |
| Secretos               | Decodifica nombres y valores de formularios/query antes de comprobar secretos, también con URL templada.                                                     | Claves percent-encoded, variables válidas y valores con `#`.                            |
| Migraciones            | Inspecciona todas las carpetas heredadas antes de moverlas, incluso cuando el destino no existe.                                                             | Un archivo anidado demasiado grande no provoca una migración parcial previa.            |
| Portabilidad           | Rechaza identificadores reservados de Windows y colisiones de IDs de petición por mayúsculas.                                                                | Nombres de dispositivos y validación de identidad.                                      |
| Motores                | Antes de recuperar un proceso activo, compara la carpeta real de datos con la del proyecto. PostgreSQL lo comprueba antes de reparar roles.                  | MongoDB y PostgreSQL reales con locks copiados a otra carpeta.                          |
| Precisión              | Mantiene los tokens numéricos originales al formatear JSON de API; representa BSON Int64 y SQL BIGINT fuera del rango seguro de JavaScript sin redondearlos. | Enteros grandes, exponentes, Extended JSON, consultas y CSV.                            |
| Cierre                 | Coordina el cierre nativo y el cambio de proyecto con los guardados pendientes; permite cancelar el descarte en modo manual.                                 | Colas unitarias y evento de cierre nativo con guardado retenido en WebView.             |
| Editor                 | Tab y Shift+Tab desplazan bloques seleccionados sin borrarlos.                                                                                               | Indentación de cuatro espacios y conservación de selección/contenido.                   |
| Versionado             | La pantalla inicial usa la versión de `package.json`; CI comprueba su concordancia con Cargo y Tauri.                                                        | Pruebas del verificador y ejecución previa a los builds.                                |

## Rendimiento

- La preparación del body de respuesta se memoiza y elimina el parseo duplicado durante renders
  no relacionados. El formateador limita la expansión y la profundidad sin alterar los tokens.
- Cuando SQL alcanza el presupuesto de vista previa, deja de convertir y serializar las filas
  posteriores. Sigue consumiendo el resultado para completar correctamente la operación;
  no se presenta como cancelación ni como límite del tráfico del servidor.
- Los guardados idénticos evitan serialización, reemplazo y sincronización a disco innecesarios.
- Los monitores no programan nuevas ejecuciones durante la selección o el cierre del proyecto.

## Límites y entrega

La comprobación de baseline protege frente a cambios externos detectables al guardar, pero no
equivale a una transacción compartida con Git u otro editor. No modifiques simultáneamente los
mismos archivos durante un guardado. El preflight de migración no sustituye una copia de seguridad
ni ofrece rollback frente a un fallo de disco después de comenzar los movimientos.

El cierre coordina escrituras pendientes, no garantiza esperar todas las peticiones HTTP en vuelo.
Los timeouts MongoDB pueden devolver el control mientras el driver termina una operación; comprueba
su resultado antes de repetir una escritura. La corrección de precisión SQL se aplica a BIGINT,
no a todos los números arbitrarios incluidos dentro de JSON/JSONB.

Los clones con el mismo UUID siguen compartiendo la entrada de credenciales bajo una misma cuenta
de Windows; la validación de carpeta impide adoptar la base activa de otra raíz. No copies un
clúster activo ni publiques `.nexora/runtime`. La detección de secretos es una protección adicional,
no un sustituto de revisar los archivos que se añaden a Git.

`glib 0.18.5` sigue presente como dependencia transitiva de Linux en esta versión. La alerta
RUSTSEC-2024-0429 no se considera corregida por un CI verde: no se compila en Windows y su reparación
se entrega separadamente. Se conservan también los avisos upstream de mantenimiento documentados
en la [revisión 2.0.0](security-review-2.0.0.md).

La entrega exige formato, TypeScript, pruebas frontend, Clippy, pruebas Rust/IPC, motores reales,
WebView y CI sobre el commit publicado. El paquete registra versión, commit e inventario SHA-256.
Los ejecutables se distribuyen sin Authenticode. Esta revisión no es una certificación de seguridad.
