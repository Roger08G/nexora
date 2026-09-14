# Política de seguridad

Nexora es una aplicación local-first que ejecuta peticiones HTTP y administra instancias locales de
MongoDB y PostgreSQL. Una vulnerabilidad puede afectar datos de proyectos, credenciales del sistema,
procesos locales o contenido destinado a Git, por lo que los reportes deben gestionarse de forma
privada.

## Versiones con soporte

| Versión | Correcciones de seguridad |
| ------- | ------------------------- |
| `2.x`   | Sí                        |
| `1.x`   | Actualizar a `2.x`        |
| Alpha   | No                        |

Se recomienda reproducir el problema con la última versión estable antes de reportarlo.
Los parches se incorporan a `main` y se distribuyen en una nueva versión; las publicaciones
anteriores conservan sus archivos originales.

## Cómo reportar una vulnerabilidad

Si la pestaña **Security** del repositorio muestra la opción **Report a vulnerability**, utiliza ese
formulario privado. Mientras esa opción no esté disponible, abre un issue titulado
`[Security] Solicitud de canal privado` sin incluir detalles técnicos: indica únicamente la versión
afectada y una forma de contacto que puedas hacer pública. El mantenedor proporcionará un canal
privado para continuar el reporte.

No publiques pruebas de concepto, datos sensibles ni instrucciones de explotación en issues,
discusiones o pull requests.

Incluye, cuando sea posible:

- Versión o commit afectado y versión de Windows.
- Componente afectado: Tauri/IPC, proyectos, HTTP, MongoDB, PostgreSQL o dependencias.
- Precondiciones y pasos mínimos para reproducirlo.
- Impacto observado y límite de seguridad atravesado.
- Una prueba de concepto con datos ficticios y sin acciones destructivas.
- Logs ya saneados y una posible corrección, si la conoces.

No adjuntes tokens, contraseñas, cadenas de conexión reales, bases de datos, proyectos privados ni
rutas personales completas. Sustituye cualquier dato sensible por valores de prueba.

## Proceso de respuesta

Los objetivos de respuesta son:

- Confirmar la recepción en un máximo de cinco días laborables.
- Completar una primera evaluación en un máximo de diez días laborables.
- Acordar la divulgación después de disponer de una corrección y validarla.

Los plazos de corrección dependen de la gravedad, la complejidad y las dependencias upstream. El
reporte se mantendrá privado durante la investigación. El crédito público es opcional y solo se
incluirá con autorización de la persona que reporta. Estos tiempos son objetivos de mantenimiento,
no un acuerdo de nivel de servicio.

## Alcance

Son especialmente relevantes:

- Lectura o escritura fuera del proyecto seleccionado, incluidos ataques mediante enlaces o rutas.
- Persistencia de secretos en archivos versionables, historial, logs o mensajes de error.
- Acceso entre proyectos o reutilización indebida de credenciales.
- Escalada desde el workbench SQL o MongoDB a un rol administrativo o al sistema operativo.
- Inyección de argumentos o ejecución de binarios no previstos al iniciar runtimes locales.
- Bypass de capabilities, CSP o validaciones en el límite IPC de Tauri.
- Corrupción o pérdida de datos durante migraciones y operaciones automáticas.
- Denegaciones de servicio reproducibles con una entrada razonable y no privilegiada.

Normalmente quedan fuera de alcance:

- El envío intencionado de HTTP, SQL o consultas MongoDB solicitado por el usuario local.
- Acciones que requieren control previo completo de la misma cuenta de Windows y no atraviesan otro
  límite de seguridad.
- Modificación manual de `.nexora/runtime` mientras sus motores están activos.
- Vulnerabilidades exclusivamente upstream sin una ruta de explotación específica a través de
  Nexora.
- Ingeniería social, pruebas sobre sistemas de terceros o escaneos no autorizados.

## Uso seguro

- Descarga la distribución desde los releases del repositorio y compara los archivos con
  `SHA256SUMS.txt`. Los ejecutables de `2.2.0` se distribuyen sin firma Authenticode.
- La edición portable incluye motores y dependencias nativas. Las credenciales de las bases
  locales siguen ligadas a la cuenta de Windows que las creó: mover el proyecto a otro equipo
  requiere exportar/restaurar los datos o una migración de credenciales independiente.

- Descarga MongoDB y PostgreSQL únicamente de fuentes oficiales y utiliza distribuciones de
  confianza.
- No publiques `.nexora/runtime`; contiene datos locales, logs y estado interno.
- Sí conserva en Git `.nexora/project.json` y `.nexora/.gitignore`, junto con las definiciones de
  peticiones, carpetas y monitores. Consulta la [guía del formato de proyecto](docs/project-format.md).
- Conserva los secretos en variables de sesión y nunca dentro de peticiones versionadas.
- Revisa las peticiones de repositorios ajenos antes de ejecutarlas. Sus monitores no envían tráfico
  automáticamente al abrirlos: **Iniciar programación** autoriza la sesión actual y **Pausar
  programación** revoca nuevos envíos. Las peticiones ya enviadas pueden terminar.
- Las redirecciones HTTP automáticas se limitan al mismo origen para evitar reenviar headers,
  parámetros o cuerpos sensibles a otro servidor. Las respuestas a otros orígenes se muestran
  como `3xx` para poder revisarlas.
- Utiliza cuentas con privilegios mínimos al conectar bases de datos externas.
- Revisa las operaciones destructivas antes de confirmarlas y mantén copias de seguridad de los
  datos importantes.

## Integridad de proyectos en 2.2.0

- El guardado de peticiones contrasta el archivo actual con la versión cargada. Un cambio externo
  detectado o un archivo eliminado producen un conflicto en lugar de sobrescribirlo o recrearlo.
  El borrador permanece en memoria; **Recargar** solo lo sustituye tras confirmación y lectura
  correcta. No es un mecanismo de bloqueo frente a otros procesos ni una copia de seguridad.
- Guardar peticiones y monitores sin cambios evita reescrituras y diferencias de formato
  innecesarias. El cierre y el cambio de proyecto coordinan las escrituras pendientes y no ignoran
  errores de guardado; con autosave desactivado se pide confirmar el descarte.
- Antes de recuperar motores existentes, se verifica la carpeta de datos comunicada por MongoDB o
  PostgreSQL contra la carpeta del proyecto. No se adopta un proceso solo por compartir PID, puerto
  o credenciales.
- Los enteros de 64 bits fuera del rango exacto de JavaScript se preservan como `$numberLong` en
  MongoDB y como texto en resultados PostgreSQL `BIGINT`. Esta protección no garantiza precisión
  arbitraria de números contenidos en JSON/JSONB.

## Dependencia upstream pendiente

En `2.2.0`, la cadena GTK de Tauri mantiene `glib 0.18.5`, afectado por
[GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
Esa dependencia no se compila en el destino Windows distribuido, pero permanece en el lockfile para
Linux. La alerta no se considera corregida en esta versión. RustSec la clasifica como `unsound`:
un control de auditoría que la trate como advertencia puede terminar correctamente sin resolverla.

Consulta la [revisión de 2.2.0](docs/security-review-2.2.0.md) y la
[revisión histórica de 2.0.0](docs/security-review-2.0.0.md) para conocer las correcciones y límites.
