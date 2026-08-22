# Registro de cambios

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
  acotan y sanea cualquier credencial antes de enviarlos a la interfaz.
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
- La animación comparte geometría y programa gráfico, evita asignaciones masivas durante el arranque
  y solo recalcula el lienzo cuando cambia su tamaño, eliminando trabajo por fotograma innecesario.
- Se eliminan las dependencias 3D generalistas y su carga diferida. El build completo del frontend
  queda en 356,78 kB de JavaScript, 106,05 kB comprimidos con gzip.
