#Requires -Version 7.2
[CmdletBinding()]
param(
    [string] $BinaryPath,
    [string] $RuntimeDirectory,
    [string] $OutputDirectory,
    [string] $MongoDBRoot,
    [string] $PostgreSQLHome,
    [string] $MsvcRuntimeDirectory,
    [ValidatePattern('^\d+\.\d+\.\d+$')][string] $MongoDBVersion = '8.3.11',
    [ValidatePattern('^\d+\.\d+$')][string] $PostgreSQLVersion = '18.6',
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string] $MongoDBArchiveSha256,
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string] $PostgreSQLArchiveSha256,
    [switch] $PrepareOnly,
    [switch] $PackageOnly,
    [switch] $RequireSignature,
    [switch] $AllowDirty
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $IsWindows) { throw 'El empaquetado requiere Windows x64.' }
if ($PrepareOnly -and $PackageOnly) { throw 'PrepareOnly y PackageOnly son excluyentes.' }
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $RuntimeDirectory) { $RuntimeDirectory = Join-Path $repositoryRoot 'artifacts/windows-runtime' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot 'artifacts/releases' }
$runtimeRoot = Assert-PlainPath $RuntimeDirectory
$outputRoot = Assert-PlainPath $OutputDirectory

foreach ($engine in @('MONGODB', 'POSTGRESQL')) {
    $sourcePath = Join-Path $repositoryRoot ('src-tauri/src/commands/' + $engine.ToLowerInvariant() + '_runtime.rs')
    $source = Get-Content -LiteralPath $sourcePath -Raw
    if ($source -notmatch ('const PREFERRED_' + $engine + '_VERSION:\s*&str\s*=\s*"([^"]+)"')) {
        throw "No se pudo comprobar la version de $engine fijada por el backend."
    }
    $requestedVersion = if ($engine -eq 'MONGODB') { $MongoDBVersion } else { $PostgreSQLVersion }
    if ($Matches[1] -ne $requestedVersion) { throw "La version de $engine solicitada no coincide con el backend." }
}

function Find-MsvcRuntime {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Indica MsvcRuntimeDirectory con el CRT x64 redistribuible de Visual Studio.' }
    $installation = & $vswhere -latest -products '*' -property installationPath
    if ($LASTEXITCODE -ne 0 -or -not $installation) { throw 'No se ha encontrado Visual Studio Build Tools.' }
    $redistRoot = Join-Path $installation 'VC/Redist/MSVC'
    $versions = Get-ChildItem -LiteralPath $redistRoot -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.' } | Sort-Object { [version]$_.Name } -Descending
    foreach ($version in $versions) {
        $x64 = Join-Path $version.FullName 'x64'
        if (Test-Path -LiteralPath $x64) {
            $candidate = Get-ChildItem -LiteralPath $x64 -Directory | Where-Object { $_.Name -match '^Microsoft\.VC\d+\.CRT$' } | Select-Object -First 1
            if ($candidate) { return $candidate.FullName }
        }
    }
    throw 'No se ha encontrado el CRT x64 redistribuible de Visual Studio.'
}

if (-not $PackageOnly) {
    if (Test-Path -LiteralPath $runtimeRoot) { throw "El staging ya existe. Usa PackageOnly o un RuntimeDirectory nuevo: $runtimeRoot" }
    if (-not $MongoDBRoot) { $MongoDBRoot = Join-Path $env:LOCALAPPDATA "Nexora/runtimes/mongodb/$MongoDBVersion" }
    if (-not $PostgreSQLHome) { $PostgreSQLHome = Join-Path $env:LOCALAPPDATA "Nexora/runtimes/postgresql/$PostgreSQLVersion/pgsql" }
    if (-not $MsvcRuntimeDirectory) { $MsvcRuntimeDirectory = Find-MsvcRuntime }
    $mongoRoot = Assert-PlainPath $MongoDBRoot
    $postgresRoot = Assert-PlainPath $PostgreSQLHome
    $crtRoot = Assert-PlainPath $MsvcRuntimeDirectory
    $mongoExecutable = Join-Path $mongoRoot 'mongod.exe'
    if (-not (Test-Path -LiteralPath $mongoExecutable)) { $mongoExecutable = Join-Path $mongoRoot 'bin/mongod.exe' }
    Assert-X64Executable $mongoExecutable
    $mongoOutput = (& $mongoExecutable --version) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $mongoOutput -notmatch '(?s)Build Info:\s*(\{.*\})') { throw 'No se pudo verificar la version real de MongoDB.' }
    $mongoBuild = $Matches[1] | ConvertFrom-Json
    if ($mongoBuild.version -ne $MongoDBVersion -or $mongoBuild.environment.target_arch -ne 'amd64') { throw 'MongoDB no coincide con la version/arquitectura solicitada.' }
    foreach ($program in @('postgres', 'initdb', 'pg_ctl')) {
        $programPath = Join-Path $postgresRoot "bin/$program.exe"
        Assert-X64Executable $programPath
        $programOutput = (& $programPath --version) -join "`n"
        if ($LASTEXITCODE -ne 0 -or $programOutput -notmatch ('\(PostgreSQL\) ' + [regex]::Escape($PostgreSQLVersion) + '$')) {
            throw "Version inesperada de PostgreSQL: $program"
        }
    }
    foreach ($required in @('msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
        Assert-X64Executable (Join-Path $crtRoot $required)
    }
    $mongoDestination = Join-Path $runtimeRoot "runtimes/mongodb/$MongoDBVersion"
    $postgresDestination = Join-Path $runtimeRoot "runtimes/postgresql/$PostgreSQLVersion/pgsql"
    Copy-PackageFile $mongoExecutable (Join-Path $mongoDestination 'mongod.exe')
    foreach ($license in @('LICENSE-Community.txt', 'THIRD-PARTY-NOTICES', 'MPL-2')) {
        Copy-PackageFile (Join-Path $mongoRoot $license) (Join-Path $mongoDestination $license)
    }
    foreach ($directory in @('bin', 'lib', 'share')) {
        Copy-PackageTree (Join-Path $postgresRoot $directory) (Join-Path $postgresDestination $directory)
    }
    foreach ($license in @('server_license.txt', 'commandlinetools_3rd_party_licenses.txt')) {
        Copy-PackageFile (Join-Path $postgresRoot $license) (Join-Path $postgresDestination $license)
    }
    $crtFiles = @(Get-ChildItem -LiteralPath $crtRoot -File -Filter '*.dll' | Sort-Object Name)
    foreach ($library in $crtFiles) {
        Assert-X64Executable $library.FullName
        foreach ($destination in @($runtimeRoot, $mongoDestination, (Join-Path $postgresDestination 'bin'))) {
            Copy-PackageFile $library.FullName (Join-Path $destination $library.Name)
        }
    }
    $mongoSourceUrl = "https://github.com/mongodb/mongo/archive/refs/tags/r$MongoDBVersion.tar.gz"
    $postgresSourceUrl = "https://ftp.postgresql.org/pub/source/v$PostgreSQLVersion/postgresql-$PostgreSQLVersion.tar.bz2"
    $notices = @"
# Componentes redistribuidos

Nexora conserva su licencia MIT. Los siguientes componentes independientes se
distribuyen sin modificar y conservan sus propias licencias y avisos.

## MongoDB Community Server $MongoDBVersion

Copyright MongoDB, Inc. Licencia Server Side Public License, versión 1 (SSPL).
El paquete incluye mongod; no incluye mongos ni MongoDB Compass.

- Licencia: runtimes/mongodb/$MongoDBVersion/LICENSE-Community.txt
- Avisos de terceros: runtimes/mongodb/$MongoDBVersion/THIRD-PARTY-NOTICES
- Licencia Mozilla de componentes incluidos: runtimes/mongodb/$MongoDBVersion/MPL-2
- Código fuente de la versión publicada por MongoDB, incluido el sistema de construcción:
  $mongoSourceUrl
- Tag de fuentes upstream: r$MongoDBVersion
- Revisión comunicada por el binario: $($mongoBuild.gitVersion)
- Distribución oficial: https://www.mongodb.com/try/download/community

El código fuente se ofrece sin coste por el enlace anterior. El mantenedor de
Nexora debe mantener su disponibilidad mientras distribuya este binario. Las
licencias originales y los avisos de ausencia de garantía se conservan intactos.

## PostgreSQL $PostgreSQLVersion para Windows x64

PostgreSQL Global Development Group y contribuidores. Distribución binaria EDB.
Se incluyen bin, lib y share; no se incluyen pgAdmin, StackBuilder ni un clúster.

- Licencia del servidor: runtimes/postgresql/$PostgreSQLVersion/pgsql/server_license.txt
- Avisos: runtimes/postgresql/$PostgreSQLVersion/pgsql/commandlinetools_3rd_party_licenses.txt
- Código fuente: $postgresSourceUrl
- Distribución oficial: https://www.enterprisedb.com/download-postgresql-binaries

## Microsoft Visual C++ Runtime x64

Copyright Microsoft Corporation. DLL redistribuibles sin modificar procedentes
del directorio Redist de Visual Studio Build Tools, desplegadas junto a los
ejecutables para no requerir una instalación global del CRT. No están cubiertas
por la licencia MIT de Nexora. Los avisos internos y las firmas se conservan.

- Condiciones: https://visualstudio.microsoft.com/license-terms/
- Lista redistribuible: https://learn.microsoft.com/visualstudio/releases/2026/redistribution
- Despliegue local: https://learn.microsoft.com/cpp/windows/deployment-in-visual-cpp

## Microsoft Edge WebView2

El ZIP utiliza el WebView2 Evergreen del sistema y no redistribuye el navegador.
Si no está disponible, instálalo desde https://developer.microsoft.com/microsoft-edge/webview2/
El instalador de Nexora puede gestionar este requisito con su propio mecanismo.
"@
    Write-PackageText (Join-Path $runtimeRoot 'THIRD-PARTY-NOTICES.md') ($notices + "`n")
    $provenance = [ordered]@{
        schemaVersion = 1
        platform = 'windows-x86_64'
        mongodb = [ordered]@{
            version = $MongoDBVersion
            gitRevision = $mongoBuild.gitVersion
            sourceTag = "r$MongoDBVersion"
            licenseFiles = @('LICENSE-Community.txt', 'THIRD-PARTY-NOTICES', 'MPL-2')
            archiveUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoDBVersion.zip"
            archiveSha256 = $(if ($MongoDBArchiveSha256) { $MongoDBArchiveSha256.ToLowerInvariant() } else { $null })
            sourceUrl = $mongoSourceUrl
            binarySha256 = (Get-FileHash -LiteralPath $mongoExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        postgresql = [ordered]@{
            version = $PostgreSQLVersion
            distributionPage = 'https://www.enterprisedb.com/download-postgresql-binaries'
            archiveSha256 = $(if ($PostgreSQLArchiveSha256) { $PostgreSQLArchiveSha256.ToLowerInvariant() } else { $null })
            sourceUrl = $postgresSourceUrl
            binarySha256 = (Get-FileHash -LiteralPath (Join-Path $postgresRoot 'bin/postgres.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        microsoftCrt = [ordered]@{
            version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $crtRoot 'vcruntime140.dll')).ProductVersion
            files = @($crtFiles.Name)
            source = 'Microsoft Visual Studio Build Tools / VC / Redist / MSVC / x64 / CRT'
        }
        webview2 = 'System Evergreen runtime; not included in the portable ZIP'
        archiveHashNote = 'Hashes identify supplied archives; consult upstream provenance independently.'
    }
    Write-PackageText (Join-Path $runtimeRoot 'runtime-provenance.json') (($provenance | ConvertTo-Json -Depth 8) + "`n")
    Write-PackageChecksums $runtimeRoot 'runtime-checksums.sha256'
}

$runtimeFiles = Test-PackageDirectory $runtimeRoot 'runtime-checksums.sha256'
$runtimeMetadata = Get-Content -LiteralPath (Join-Path $runtimeRoot 'runtime-provenance.json') -Raw | ConvertFrom-Json
if ($runtimeMetadata.mongodb.version -ne $MongoDBVersion -or $runtimeMetadata.postgresql.version -ne $PostgreSQLVersion) {
    throw 'El staging contiene otras versiones de los motores. Prepara un RuntimeDirectory nuevo.'
}
if ($PrepareOnly) {
    [pscustomobject]@{ RuntimeDirectory = $runtimeRoot; VerifiedFiles = $runtimeFiles; Status = 'Prepared' }
    return
}
if (-not $BinaryPath) { throw 'Indica BinaryPath con el ejecutable de produccion ya compilado.' }
$binary = Assert-PlainPath $BinaryPath
Assert-X64Executable $binary
$packageJson = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$version = $packageJson.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'La version de produccion debe ser major.minor.patch.' }
$binaryVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($binary).ProductVersion
if ($binaryVersion -ne $version) { throw "El binario ($binaryVersion) no corresponde al package.json ($version)." }
$signature = Get-AuthenticodeSignature -LiteralPath $binary
if ($RequireSignature -and $signature.Status -ne 'Valid') { throw 'Se requiere una firma Authenticode valida.' }
$commit = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el commit de origen.' }
$dirty = [bool](@(& git -C $repositoryRoot status --porcelain).Count)
if ($dirty -and -not $AllowDirty) { throw 'El arbol Git tiene cambios. Cierra los commits antes de empaquetar o usa AllowDirty para pruebas locales.' }
$timestampSeconds = (& git -C $repositoryRoot show -s --format=%ct HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener la fecha del commit.' }
$timestamp = [DateTimeOffset]::FromUnixTimeSeconds([long]$timestampSeconds)
$packageName = "Nexora_${version}_windows-x64-portable"
$packageDirectory = Join-Path $outputRoot $packageName
$zipPath = Join-Path $outputRoot "$packageName.zip"
if ((Test-Path -LiteralPath $packageDirectory) -or (Test-Path -LiteralPath $zipPath)) { throw 'El paquete ya existe. Utiliza un OutputDirectory nuevo.' }
Copy-PackageTree $runtimeRoot $packageDirectory
Copy-PackageFile $binary (Join-Path $packageDirectory 'Nexora.exe')
Copy-PackageFile (Join-Path $repositoryRoot 'LICENSE') (Join-Path $packageDirectory 'LICENSE')
$portableReadme = @"
# Nexora $version - Windows x64 portable

Extrae todo el ZIP en una carpeta con permisos de escritura y abre Nexora.exe.
Conserva el directorio runtimes y las DLL junto al ejecutable: permiten usar
MongoDB y PostgreSQL sin instalar servidores ni servicios de Windows.

Requiere Windows 10/11 x64 y Microsoft Edge WebView2 Evergreen. Si falta WebView2:
https://developer.microsoft.com/microsoft-edge/webview2/

Selecciona o crea una carpeta de proyecto desde Nexora. Las peticiones y monitores
se guardan en archivos revisables con Git; los datos de motores permanecen en
.nexora/runtime. No se incluye ningún proyecto ni dato personal en este paquete.

Las credenciales de los motores están vinculadas a Windows Credential Manager
de la cuenta que las creó. Copiar un clúster a otro usuario/equipo no traslada
esas credenciales; utiliza exportaciones de datos para esa migración. Los ajustes
de la interfaz se conservan en el perfil WebView2 de esta cuenta de Windows.

Estado Authenticode del ejecutable: $($signature.Status).
El SHA-256 permite verificar integridad; no sustituye una firma del editor.
Consulta THIRD-PARTY-NOTICES.md para licencias y código fuente de los motores.
"@
Write-PackageText (Join-Path $packageDirectory 'LEEME.md') ($portableReadme + "`n")
$releaseManifest = [ordered]@{
    schemaVersion = 1
    product = 'Nexora'
    version = $version
    platform = 'windows-x86_64'
    sourceCommit = $commit
    sourceWorktreeDirty = $dirty
    sourceCommitDate = $timestamp.ToString('o')
    binary = [ordered]@{
        file = 'Nexora.exe'
        sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
        authenticode = $signature.Status.ToString()
        signer = $(if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null })
    }
    runtimes = 'runtime-provenance.json'
    archiveReproducibility = 'File order and timestamps are deterministic for identical inputs and the same .NET compressor; the application build is not claimed to be bit-reproducible.'
}
Write-PackageText (Join-Path $packageDirectory 'release-manifest.json') (($releaseManifest | ConvertTo-Json -Depth 6) + "`n")
Write-PackageChecksums $packageDirectory 'SHA256SUMS.txt'
New-DeterministicPackageZip $packageDirectory $zipPath $timestamp
& (Join-Path $PSScriptRoot 'verify-windows-package.ps1') -Path $zipPath | Out-Null
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-PackageText "$zipPath.sha256" ("$zipHash  $packageName.zip`n")
[pscustomobject]@{ Package = $zipPath; Sha256 = $zipHash; BinarySignature = $signature.Status.ToString(); SourceCommit = $commit; Status = 'PackagedAndVerified' }
