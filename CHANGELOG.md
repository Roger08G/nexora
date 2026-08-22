# Registro de cambios

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
- Los cuerpos de petición y respuesta HTTP, documentos MongoDB y consultas PostgreSQL usan el
  mismo formato visual. Las variables `{{variable}}` conservan su resaltado específico.
- Las cabeceras HTTP se presentan en filas diferenciadas y los toasts limitan su contenido para
  evitar desbordamientos sin perder la distinción visual entre éxito, error, aviso e información.

### Correcciones visuales

- Se corrige el desfase entre el cursor y el texto coloreado en el editor del body HTTP mediante
  métricas tipográficas idénticas y ligaduras desactivadas.
- Se ajustan el tamaño y la alineación de las pestañas, sus botones de creación y cierre, los
  botones de ejecución y desconexión, la etiqueta de estado del historial y los estados activos
  del menú lateral.
- El logotipo elimina todo el margen transparente y ocupa el lienzo completo en los recursos PNG,
  ICO e ICNS.

### Calidad

- La suite WebView amplía la cobertura de formato JSON, alineación tipográfica, esquema e índices
  de MongoDB, exportación PostgreSQL y geometría de las pestañas.

## 0.2.0-alpha - 2026-08-21

### Formato de proyecto

- Las peticiones, carpetas y definiciones de monitores pasan de `.nexora/` a `requests/`,
  `folders/` y `monitors/` en la raíz del proyecto. Estos archivos quedan visibles y preparados
  para su revisión y versionado con Git.
- `.nexora/` queda limitado a la identidad del proyecto y a `runtime/`, donde Nexora conserva el
  estado local que no debe versionarse.
- Los proyectos con esquema 1 se migran al esquema 2 al abrirlos. La migración comprueba los
  destinos antes de mover datos y se cancela si encuentra contenido incompatible.

### Automatización del repositorio

- Se incorpora CI para Windows con validación de formato, TypeScript, frontend, tests Rust,
  característica WebView y build de Tauri.
- Se incorpora Dependabot para dependencias de Bun, Cargo y GitHub Actions con revisión semanal.
