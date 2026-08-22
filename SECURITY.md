# Política de seguridad

Nexora es una aplicación local-first que ejecuta peticiones HTTP y administra instancias locales de
MongoDB y PostgreSQL. Una vulnerabilidad puede afectar datos de proyectos, credenciales del sistema,
procesos locales o contenido destinado a Git, por lo que los reportes deben gestionarse de forma
privada.

## Versiones con soporte

| Versión                    | Correcciones de seguridad |
| -------------------------- | ------------------------- |
| `0.3.x-alpha`              | Sí                        |
| `0.2.x-alpha` y anteriores | No                        |

Las versiones alpha pueden introducir cambios incompatibles cuando sean necesarios para cerrar una
vulnerabilidad. Se recomienda reproducir el problema sobre el último commit de `main` antes de
reportarlo.

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

- Descarga MongoDB y PostgreSQL únicamente de fuentes oficiales y utiliza distribuciones de
  confianza.
- No publiques `.nexora/runtime`; contiene datos locales, logs y estado interno.
- Conserva los secretos en variables de sesión y nunca dentro de peticiones versionadas.
- Utiliza cuentas con privilegios mínimos al conectar bases de datos externas.
- Revisa las operaciones destructivas antes de confirmarlas y mantén copias de seguridad de los
  datos importantes.
