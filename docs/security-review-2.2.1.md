# Corrección de seguridad — 2.2.1

Fecha: 14 de septiembre de 2026. Esta entrega mantiene las mejoras funcionales de
[2.2.0](security-review-2.2.0.md) y corrige la dependencia señalada por Dependabot #1.

## Problema y corrección

[RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
afecta a los iteradores de cadenas de `glib::Variant`. Una salida de una llamada C se pasaba
mediante una referencia compartida a una variable Rust inmutable. El optimizador podía asumir que
la variable no cambiaba y producir comportamiento indefinido.

Se aplica el [parche oficial](https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb):
`let p` pasa a `let mut p` y el argumento de salida `&p` pasa a `&mut p`. La copia se extrae del
paquete oficial `glib 0.18.5`; los demás archivos originales, la versión y la licencia MIT se
conservan. Cargo la utiliza mediante `[patch.crates-io]`, sin cambiar la arquitectura de Nexora.

El [registro de procedencia y mantenimiento](../scripts/security/glib-backport.md) enlaza el
inventario completo y el diff aplicado. Ambos forman parte del código fuente de esta versión.

La cadena GTK de Tauri necesita la serie 0.18; sustituirla aisladamente por 0.20 no es una
actualización compatible. Este backport corrige el código afectado sin declarar una versión
upstream que el proyecto no utiliza. No se parchea el caché global de Cargo.

## Comprobaciones obligatorias

- Inventario completo de archivos, tamaños y SHA-256 del vendor; rechazo de enlaces, archivos
  adicionales y alteraciones. Se conserva la procedencia del archivo oficial y del parche.
- Comprobación de los manifiestos y lockfiles de Nexora y de la suite de regresión.
- Resolución real mediante `cargo metadata --locked` para Linux, verificando que ambos grafos
  utilizan la misma carpeta local y no la publicación vulnerable del registro.
- Pruebas nativas en Linux con GLib real y optimizaciones activadas: iteración directa e inversa,
  saltos, UTF-8, cadenas vacías, mezcla de direcciones y agotamiento.
- Regresiones del verificador y comprobación de integridad después de formato, Clippy y pruebas.
- Repetición de los controles habituales de Windows: formato, tipos, tests, motores reales,
  WebView y build de producción. Versiones de Cargo, Tauri y pantalla inicial alineadas en `2.2.1`.

La suite está en `scripts/security/glib-variant-iter/`; usa su propio lockfile y la misma dependencia
local que Nexora. No valida toda la aplicación gráfica de Linux. El ejecutable distribuido para
Windows no incluye GLib.

## Seguimiento

El estado de Dependabot es una señal de seguimiento, no la prueba del arreglo. Los analizadores
basados en versiones pueden omitir dependencias locales o seguir identificando su versión original;
la evidencia técnica es el parche, su integridad, el grafo efectivo y las regresiones optimizadas.

Al actualizar Tauri/GTK, revisa si ya puede utilizarse una publicación upstream corregida. Retira el
backport y su verificador solamente después de comprobar todos los destinos y repetir las pruebas.
Se mantienen los avisos de mantenimiento upstream documentados en revisiones anteriores. No se
afirma ausencia absoluta de vulnerabilidades ni se modifica el contenido de releases históricos.

Los paquetes Windows registran commit, versión y hashes. Continúan sin firma Authenticode; SHA-256
comprueba integridad, no identidad del editor.
