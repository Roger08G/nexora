# Registro de cambios

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
