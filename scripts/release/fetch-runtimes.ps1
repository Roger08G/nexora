#Requires -Version 7.2
[CmdletBinding()]
param(
    [string] $Destination,
    [string] $ArchiveCache,
    [switch] $ExportEnvironment
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $IsWindows) { throw 'Estos runtimes requieren Windows x64.' }
if ($ExportEnvironment -and -not $env:GITHUB_ENV) { throw 'ExportEnvironment requiere GitHub Actions.' }
if ($ArchiveCache) {
    $ArchiveCache = Assert-PlainPath $ArchiveCache
    if (-not (Test-Path -LiteralPath $ArchiveCache -PathType Container)) { throw 'ArchiveCache no existe.' }
}
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $Destination) { $Destination = Join-Path $repositoryRoot 'artifacts/verified-runtimes' }
$destinationRoot = Assert-PlainPath $Destination
if (Test-Path -LiteralPath $destinationRoot) { throw 'Selecciona un destino nuevo para los runtimes verificados.' }
[IO.Directory]::CreateDirectory($destinationRoot) | Out-Null

function Get-VerifiedRuntime([string] $Name, [string] $Url, [string] $Sha256, [string] $IncludePattern) {
    $archivePath = Join-Path $destinationRoot "$Name.zip"
    if ($ArchiveCache) {
        $archivePath = Join-Path $ArchiveCache "$Name.zip"
        if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
            $archivePath = Join-Path $ArchiveCache ([IO.Path]::GetFileName(([uri]$Url).AbsolutePath))
        }
        if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw "Falta el archivo en ArchiveCache: $Name" }
        $archivePath = Assert-PlainPath $archivePath
    }
    else {
        Invoke-WebRequest -Uri $Url -OutFile $archivePath -MaximumRetryCount 2
    }
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Checksum del runtime incorrecto: $Name"
    }
    $extractRoot = Join-Path $destinationRoot $Name
    $zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $zip.Entries) {
            $relative = $entry.FullName.TrimEnd('/')
            Assert-PackageRelativePath $relative
            if (-not $seen.Add($relative)) { throw "Entrada ZIP duplicada: $relative" }
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
                throw "El archivo de runtime contiene un enlace: $relative"
            }
        }
        # Verify every archive entry before extracting only the required runtime.
        # MongoDB debug symbols and PostgreSQL's pgAdmin/StackBuilder are not used.
        foreach ($entry in $zip.Entries) {
            if (-not $entry.Name -or $entry.FullName -notmatch $IncludePattern) { continue }
            $destinationPath = Assert-PlainPath (Join-Path $extractRoot $entry.FullName)
            Get-PackageRelativePath $extractRoot $destinationPath | Out-Null
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destinationPath)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destinationPath, $false)
        }
    }
    finally { $zip.Dispose() }
    return $extractRoot
}

# MongoDB's SHA-256 is supplied by fastdl.mongodb.org alongside the archive.
$mongoRoot = Get-VerifiedRuntime 'mongodb-8.3.11' `
    'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.3.11.zip' `
    '55574b06b41848207213a5e69575dd3487abf3cf07ecfe01b3aef1bab0084241' `
    '^mongodb-win32-x86_64-windows-8\.3\.11/(?:bin/mongod\.exe|LICENSE-Community\.txt|THIRD-PARTY-NOTICES|MPL-2|README)$'
# EDB does not publish a separate checksum here. This pins the archive retrieved
# over HTTPS from the vendor on 2026-09-12; it is not a publisher signature.
$postgresRoot = Get-VerifiedRuntime 'postgresql-18.6-3' `
    'https://get.enterprisedb.com/postgresql/postgresql-18.6-3-windows-x64-binaries.zip' `
    '59f8ce701c63c2ed623c665a5e51b3ef6f2e37ccf837b68ffeed0742d0ae6abd' `
    '^pgsql/(?:(?:bin|lib|share)/.+|server_license\.txt|commandlinetools_3rd_party_licenses\.txt)$'
$mongoExecutable = @(Get-ChildItem -LiteralPath $mongoRoot -Directory | ForEach-Object {
    Join-Path $_.FullName 'bin/mongod.exe'
} | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($mongoExecutable.Count -ne 1) { throw 'Estructura inesperada del archivo MongoDB.' }
$postgresHome = Join-Path $postgresRoot 'pgsql'
Assert-X64Executable $mongoExecutable[0]
Assert-X64Executable (Join-Path $postgresHome 'bin/postgres.exe')
if ($ExportEnvironment) {
    $environmentFile = Assert-PlainPath $env:GITHUB_ENV
    [IO.File]::AppendAllText($environmentFile,
        "NEXORA_MONGOD_PATH=$($mongoExecutable[0])`nNEXORA_POSTGRESQL_HOME=$postgresHome`n",
        [Text.UTF8Encoding]::new($false))
}
[pscustomobject]@{ MongoDBExecutable = $mongoExecutable[0]; PostgreSQLHome = $postgresHome }
