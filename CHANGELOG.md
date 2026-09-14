# Registro de cambios

## 2.2.1 - 2026-09-14

- Corrige RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g en `glib::VariantStrIter` con el backport exacto del parche oficial, manteniendo compatibilidad con la cadena GTK de Tauri.
- Conserva el crate oficial y la licencia MIT; verifica los 121 archivos originales y las dos líneas modificadas mediante inventario, procedencia y hashes fijos.
- Comprueba que Nexora y la suite de regresión resuelven la misma dependencia local, sin ocultar una copia vulnerable adicional ni simular una versión upstream.
- Añade pruebas nativas optimizadas del iterador en Linux y regresiones del verificador; mantiene las comprobaciones completas de frontend, Rust, motores y WebView en CI.
- Sincroniza la versión `2.2.1` en los manifiestos, la pantalla inicial y los paquetes Windows. Incluye instalador, portable y hashes SHA-256; los ejecutables permanecen sin firma Authenticode.

## 2.2.0 - 2026-09-14

### Seguridad e integridad

- El guardado detecta cambios externos de Git y archivos eliminados, conserva el borrador y ofrece recarga explícita. Los guardados idénticos no reescriben las definiciones.
- El cierre y el cambio de proyecto coordinan escrituras pendientes; el modo manual permite cancelar el descarte.
- Los monitores requieren autorización de programación por sesión. Abrir, clonar o reabrir un proyecto no inicia peticiones por contener monitores habilitados.
- Se refuerzan la exclusión de datos privados en Git, la validación de secretos codificados, los identificadores portables y la inspección previa de migraciones.
- MongoDB y PostgreSQL verifican la carpeta real de datos antes de recuperar un proceso existente.

### Rendimiento y calidad

- El formato JSON conserva tokens numéricos sin redondearlos. BSON Int64 y SQL BIGINT fuera del rango exacto de JavaScript se representan sin pérdida; CSV conserva esos valores.
- Se evita preparar respuestas repetidamente y convertir filas SQL posteriores al límite de vista previa. El editor indenta bloques sin borrar su contenido.
- Se incorporan regresiones con Git real, IPC, motores locales y WebView, incluida la revocación de permisos de programación.
- CI verifica versiones coherentes en Cargo, Tauri, frontend y pantalla inicial. Se documentan el formato versionable del proyecto y los límites reales de las funciones.

### Distribución y límites

- Paquetes Windows x64 con runtimes verificados, procedencia por commit y hashes SHA-256. Ejecutables sin firma Authenticode.
- `glib 0.18.5` conserva en esta versión la alerta RUSTSEC-2024-0429 de Linux, no compilada en Windows; su corrección se entrega por separado en 2.2.1.

## 2.1.0 - 2026-09-12

- Se restaura el logotipo original en la aplicación, la documentación y los iconos de escritorio
  e instalación, conservando el recurso optimizado de 128 px en la interfaz.
- Se actualiza el versionado de la aplicación y de los paquetes Windows a `2.1.0`, sin cambios
  en las funcionalidades, dependencias ni mejoras de seguridad de `2.0.0`.

## 2.0.0 - 2026-09-12

### Seguridad y correcciones

- Las redirecciones HTTP automáticas se limitan al mismo origen para evitar reenviar headers,
  parámetros o cuerpos sensibles a otro servidor.
- Se limita el tamaño agregado tras resolver variables, el volumen de peticiones por proyecto y
  la lectura de logs. Se rechazan identificadores duplicados, archivos incompatibles y borrados
  que atraviesen enlaces de carpetas.
- Las escrituras locales reemplazan el archivo en una única operación atómica. El guardado
  automático, la eliminación y el cambio de proyecto se coordinan para evitar pérdida de cambios.
- MongoDB limita a 16 las operaciones pendientes del explorador y devuelve el control tras
  30 segundos sin cancelar directamente el driver. Una escritura puede terminar después del
  timeout, por lo que debe comprobarse su resultado antes de repetirla.
- PostgreSQL conserva las columnas de resultados vacíos y diferencia nombres repetidos para no
  sobrescribir valores. El arranque Windows utiliza pg_ctl con privilegios reducidos, timeout y
  validación del PID y puerto, corrigiendo el fallo con tokens de administrador.
- Se actualizan dependencias y herramientas, se corrigen dependencias transitivas vulnerables y
  se amplía el parche local de extract-zip con regresiones. Los avisos upstream restantes se
  documentan sin ocultarlos.
- La revisión técnica y sus límites quedan registrados en `docs/security-review-2.0.0.md`.

### Rendimiento e interfaz

- Se memoiza el resaltado de código y se eliminan copias repetidas del texto durante la
  clasificación de tokens JSON, conservando el formato y los colores existentes.
- Se descartan resultados asíncronos obsoletos y se evitan ejecuciones solapadas de monitores.
- Las variables de sesión y el estado de interfaz se aíslan por raíz de proyecto, incluso entre
  clones que comparten el mismo UUID.
- El logotipo simplifica la luna violeta y la estrella para mejorar su legibilidad en la barra de
  tareas. El recurso utilizado por la interfaz pasa de 287.170 a 14.706 bytes.
- Se incorpora optimización LTO ligera y eliminación de símbolos en los builds release, sin
  alterar la estructura `app/`, `modules/` y `shared/`.

### Distribución para Windows

- Se incorpora un paquete portable completo y un instalador NSIS con MongoDB 8.3.11,
  PostgreSQL 18.6 —distribución EDB 18.6-3— y las DLL redistribuibles necesarias.
- Los motores se descubren junto al ejecutable. Se mantienen las rutas de desarrollo y el
  fallback de instalaciones anteriores.
- Los paquetes incluyen licencias, procedencia de los motores y manifiestos SHA-256. Los
  ejecutables se distribuyen sin firma Authenticode.
- El portable requiere WebView2 del sistema. El instalador puede preparar ese requisito.
  Las credenciales locales permanecen ligadas a la cuenta de Windows.
- El changelog se conserva en las ramas de release y queda fuera de `main`.

### Verificación y CI

- Se amplían las pruebas Rust del IPC, los tests Bun de concurrencia y resaltado y los escenarios
  WebView de autosave, respuestas tardías y cambio de proyecto.
- La CI comprueba frontend y empaquetado en Windows y Linux, además de Rust, MongoDB,
  PostgreSQL y WebView reales en Windows.
- Se fijan las revisiones de GitHub Actions y las versiones de Rust y Bun; los diagnósticos del
  WebView se conservan temporalmente como artefactos de CI.
- Las actualizaciones de dependencias se agrupan para reducir PR duplicadas.

## 1.0.0 - 2026-08-22

### Producción

- Primera versión estable de Nexora para Windows, construida desde el estado validado de `main`.
- La aplicación, el paquete frontend y el núcleo Tauri comparten la versión `1.0.0`.
- El release incorpora el instalador NSIS para Windows y su suma SHA-256, además de los archivos
  fuente generados desde el tag `v1.0.0`.
- La documentación principal presenta la arquitectura de Nexora mediante Mermaid y resume sus
  funciones disponibles.

## 0.4.0-alpha - 2026-08-22

### Pruebas

- Se amplía la cobertura del núcleo Rust y de los comandos IPC para proyectos, peticiones HTTP,
  historial, monitores, MongoDB, PostgreSQL y supervisión de runtimes locales.
- Se incorporan pruebas de integración para validar el formato versionable de los proyectos, las
  migraciones, las variables de sesión, la exportación CSV y el rechazo de entradas inválidas.
- Se añaden escenarios administrados de extremo a extremo para MongoDB y PostgreSQL, aislados por
  proyecto y preparados para ejecutarse cuando sus runtimes locales están disponibles.

### Seguridad

- El almacenamiento local valida los límites del proyecto, rechaza enlaces y archivos especiales,
  limita el tamaño de las entradas y realiza escrituras atómicas para reducir el riesgo de pérdida
  o corrupción de datos.
- El cliente HTTP restringe protocolos, tiempos, tamaños y número de parámetros. Los errores se
  acotan y cualquier credencial se sanea antes de enviarlos a la interfaz.
- MongoDB y PostgreSQL refuerzan la validación de consultas y de procesos administrados. PostgreSQL
  opera desde la interfaz mediante un rol limitado, separado de la cuenta administrativa interna.
- Se endurecen CSP, permisos del WebView, rutas de ejecutables y configuración de los runtimes. La
  auditoría de dependencias frontend queda integrada en CI y se corrigen dependencias transitivas
  vulnerables mediante versiones verificadas.
- Se añade una política de seguridad con alcance, canal privado de reporte, proceso de respuesta y
  recomendaciones de uso seguro.

### Optimización

- SilkWave conserva sus shaders, dos capas animadas, malla de alta densidad, iluminación y calidad
  visual, pero pasa de Three.js y React Three Fiber a un renderizador WebGL nativo específico.
- La animación comparte geometría y programa gráfico, evita asignaciones masivas durante el
  arranque y solo recalcula el lienzo cuando cambia su tamaño.
- Se eliminan las dependencias 3D generalistas y su carga diferida, reduciendo el peso del frontend.

## 0.3.0-alpha - 2026-08-22

### Bases de datos locales

- Nexora recupera instancias de MongoDB y PostgreSQL que ya estaban activas para el proyecto,
  evitando falsos errores de arranque por archivos de bloqueo o puertos ocupados.
- MongoDB incorpora vistas funcionales de esquema e índices, oculta la colección protegida
  `config.system.sessions` y presenta mensajes de permisos breves y comprensibles.
- PostgreSQL permite exportar resultados a CSV mediante el diálogo nativo de Windows, con
  validación de ruta y protección frente a fórmulas ejecutables en hojas de cálculo.

### Editores y presentación de datos

- Se unifican los editores y visores de JSON y SQL con resaltado sintáctico, numeración de líneas,
  tabulación de cuatro espacios y desplazamiento sincronizado.
- Los cuerpos de petición y respuesta HTTP, documentos MongoDB y consultas PostgreSQL usan el mismo
  formato visual. Las variables `{{variable}}` conservan su resaltado específico.
- Las cabeceras HTTP se presentan en filas diferenciadas y los toasts limitan su contenido para
  evitar desbordamientos sin perder la distinción visual entre éxito, error, aviso e información.

### Correcciones visuales

- Se corrige el desfase entre el cursor y el texto coloreado en el editor del body HTTP mediante
  métricas tipográficas idénticas y ligaduras desactivadas.
- Se ajustan el tamaño y la alineación de las pestañas, sus botones de creación y cierre, los
  botones de ejecución y desconexión, la etiqueta de estado del historial y los estados activos del
  menú lateral.
- El logotipo elimina el margen transparente y ocupa el lienzo completo en los recursos PNG, ICO e
  ICNS.

### Calidad

- La suite WebView amplía la cobertura de formato JSON, alineación tipográfica, esquema e índices
  de MongoDB, exportación PostgreSQL y geometría de las pestañas.

## 0.2.0-alpha - 2026-08-21

### Formato de proyecto

- Las peticiones, carpetas y definiciones de monitores pasan de `.nexora/` a `requests/`, `folders/`
  y `monitors/` en la raíz del proyecto. Estos archivos quedan visibles y preparados para su
  revisión y versionado con Git.
- `.nexora/` queda limitado a la identidad del proyecto y a `runtime/`, donde Nexora conserva el
  estado local que no debe versionarse.
- Los proyectos con esquema 1 se migran al esquema 2 al abrirlos. La migración comprueba los
  destinos antes de mover datos y se cancela si encuentra contenido incompatible.

### Automatización del repositorio

- Se incorpora CI para Windows con validación de formato, TypeScript, frontend, tests Rust,
  característica WebView y build de Tauri.
- Se incorpora Dependabot para dependencias de Bun, Cargo y GitHub Actions con revisión semanal.

## 0.1.0-alpha - 2026-08-21

### Aplicación inicial

- Se crea el shell de escritorio con Tauri, React, TypeScript y Rust, organizado en `app/`,
  `modules/` y `shared/` con importaciones mediante el alias `@/`.
- Se incorpora el selector para crear o abrir proyectos locales, junto con la transición SilkWave
  durante su carga.
- Se implementa el cliente REST con rutas y carpetas persistentes, variables de sesión, guardado
  automático, historial, monitores y búsqueda global con `Ctrl+K`.

### Bases de datos

- Se integra MongoDB local administrado por proyecto y la conexión opcional a servidores externos,
  con consulta y edición de documentos.
- Se integra PostgreSQL local administrado por proyecto, con navegación por esquemas y tablas y un
  editor de consultas SQL.
- Las credenciales locales se generan por proyecto y se almacenan mediante Windows Credential
  Manager, fuera de los archivos versionables.

### Validación

- Se conectan los módulos visuales con los comandos nativos de Tauri y se establecen límites para
  peticiones HTTP, resultados SQL y documentos MongoDB.
- Se añade una suite WebView para probar los principales flujos de la aplicación y escenarios
  locales de API, MongoDB y PostgreSQL.
