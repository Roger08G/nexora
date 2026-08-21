# Registro de cambios

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
