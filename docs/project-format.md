# Formato de proyecto Nexora

El formato actual usa `schemaVersion: 2`; ese número identifica el formato de archivos, no la
versión de la aplicación. Abre siempre la carpeta raíz del proyecto, no su subcarpeta `.nexora`.

## Contenido versionable y estado local

```text
mi-proyecto/
├── .nexora/
│   ├── project.json
│   ├── .gitignore
│   └── runtime/          # fuera de Git
├── folders/
│   └── general.json
├── requests/
│   └── general/
│       └── request-health.json
└── monitors/
    └── monitor-health.json
```

Versiona `.nexora/project.json`, `.nexora/.gitignore` y los archivos de `folders/`, `requests/` y
`monitors/`. Git no conserva directorios vacíos. No ignores `.nexora/` por completo: el clon necesita
su manifiesto para abrirse en Nexora.

El archivo `.nexora/.gitignore` debe excluir el estado local con esta regla:

```gitignore
runtime/
```

Al abrir el proyecto, Nexora conserva las reglas existentes y asegura una exclusión final de
`runtime/`. Esta regla no elimina archivos que Git ya estuviera siguiendo ni borra su historial.
Comprueba que no se hayan versionado datos antes de publicar el repositorio.

`runtime/` contiene clústeres MongoDB/PostgreSQL, logs, estado de procesos e historial HTTP local.
No debe compartirse como parte de las definiciones. El historial no almacena cuerpos ni headers de
petición/respuesta. Las contraseñas de los motores se guardan en Windows Credential Manager, no en
estos JSON. Los motores distribuidos con la aplicación tampoco pertenecen al repositorio de pruebas.

## Archivos JSON

Los ejemplos usan identificadores ficticios coherentes entre archivos. La interfaz genera los
identificadores nuevos. Los nombres de archivo deben coincidir con su campo `id`; cambiar el nombre
visible de una petición no requiere renombrar su archivo.

### Identidad: `.nexora/project.json`

```json
{
    "id": "d83fb1de-0920-4c80-a15e-d0cfb5077728",
    "schemaVersion": 2,
    "name": "API local"
}
```

El UUID identifica el proyecto y se conserva al clonarlo. No contiene rutas absolutas ni credenciales.

### Carpeta: `folders/general.json`

```json
{
    "id": "general",
    "name": "General"
}
```

Las carpetas existen independientemente de sus peticiones, por lo que una carpeta vacía puede
conservarse mediante su archivo en `folders/`.

### Petición: `requests/general/request-health.json`

```json
{
    "id": "request-health",
    "collectionId": "general",
    "collectionName": "General",
    "name": "Salud de la API",
    "method": "GET",
    "url": "{{baseUrl}}/health",
    "params": [
        {
            "id": "param-verbose",
            "enabled": true,
            "key": "verbose",
            "value": "true"
        }
    ],
    "headers": [
        {
            "id": "header-authorization",
            "enabled": true,
            "key": "Authorization",
            "value": "Bearer {{token}}"
        }
    ],
    "body": ""
}
```

`collectionId` referencia el `id` de la carpeta y su directorio dentro de `requests/`.
`collectionName` es su nombre visible. Cada fila de parámetros o headers contiene `id`, `enabled`,
`key` y `value`. El body se almacena como texto, incluso cuando contiene JSON; no es un objeto JSON
anidado del archivo de petición.

Adapta el endpoint a tu API. El ejemplo necesita las variables de sesión `baseUrl` y `token`; elimina
el header si la API no requiere autenticación. No sustituyas `{{token}}` por una credencial real en el
archivo. Nexora rechaza secretos directos detectados y variables incompletas o sin valor; esa
validación no sustituye la revisión de datos sensibles antes de un commit.

### Monitor: `monitors/monitor-health.json`

```json
{
    "id": "monitor-health",
    "name": "Salud local",
    "requestId": "request-health",
    "requestName": "Salud de la API",
    "intervalSeconds": 30,
    "enabled": false,
    "createdAtMs": 1789380000000,
    "updatedAtMs": 1789380000000
}
```

`requestId` referencia una petición guardada. El intervalo permitido va de 10 a 86 400 segundos.
Las marcas temporales son milisegundos Unix gestionados por Nexora; guardar un monitor sin cambios
no actualiza su fecha ni reescribe el archivo. El ejemplo está desactivado para no ejecutar tráfico
al abrirlo. Los monitores habilitados funcionan mientras la aplicación permanece abierta y utilizan
las variables disponibles en esa sesión.

Estos archivos describen peticiones reutilizables y monitores, no expectativas sobre el resultado.
Nexora permite ejecutar pruebas manuales y repetir peticiones, pero no dispone de una suite de
assertions ni de un ejecutor de estos proyectos para CI. Tampoco persiste respuestas HTTP como
fixtures o resultados esperados.

## Clonar y trabajar con Git

1. Clona el repositorio de definiciones y abre su carpeta raíz en Nexora.
2. Define tus variables en **Variables de sesión**: por ejemplo, `baseUrl` con la URL de la API que
   hayas iniciado y `token` con una credencial de prueba. Sus valores son de sesión y no viajan en Git.
3. Ejecuta una petición, revisa status, headers, body y tiempos; activa los monitores que necesites.
4. Si quieres datos locales, inicia MongoDB o PostgreSQL desde Nexora. Un clon de definiciones no
   incluye los datos originales: se inicializan motores locales nuevos. Para trasladar datos entre
   equipos, realiza una exportación/restauración independiente.
5. Revisa cambios e ignorados antes de preparar el commit:

```bash
git status --short
git diff --check
git diff -- .nexora/project.json folders requests monitors
git ls-files -- .nexora/runtime
```

El último comando no debe listar archivos. `git diff --check` detecta problemas de espacios en los
cambios, no valida los endpoints ni ejecuta pruebas contra la API.

Si Git u otro editor cambia una petición abierta, el siguiente guardado detecta la diferencia
respecto a la versión cargada y mantiene el borrador en memoria. No sobrescribe ese cambio detectado
ni recrea un archivo eliminado. Copia el borrador si quieres conservarlo y usa **Recargar** para
leer el archivo: se pide confirmación antes de descartarlo. Si la recarga falla, el borrador sigue
disponible. La aplicación no mezcla automáticamente ambas versiones ni vigila continuamente Git.

Evita cambiar ramas durante escrituras de otros programas. Al cerrar Nexora o cambiar de proyecto,
se coordinan los guardados pendientes; un error de autosave impide completar la salida. Estas
comprobaciones no sustituyen copias de seguridad ni ofrecen bloqueo transaccional con Git.

Consulta también [README](../README.md) y [SECURITY](../SECURITY.md).
