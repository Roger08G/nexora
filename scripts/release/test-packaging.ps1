#Requires -Version 7.2
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('nexora-package-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$passed = [Collections.Generic.List[string]]::new()

function Assert-Rejected([string] $Name, [scriptblock] $Action) {
    $rejected = $false
    try { & $Action | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "No se rechazo: $Name" }
    $passed.Add($Name)
}

try {
    $fixture = Join-Path $testRoot 'fixture'
    Write-PackageText (Join-Path $fixture 'Nexora.exe') 'fixture-only'
    Write-PackageText (Join-Path $fixture 'runtimes/example/data.txt') 'runtime fixture'
    Write-PackageChecksums $fixture 'SHA256SUMS.txt'
    if ((Test-PackageDirectory $fixture 'SHA256SUMS.txt') -ne 2) { throw 'Inventario incompleto.' }
    $passed.Add('Verifica todos los archivos del directorio')

    $timestamp = [DateTimeOffset]::Parse('2026-01-01T00:00:00Z')
    $firstZip = Join-Path $testRoot 'first.zip'
    $secondZip = Join-Path $testRoot 'second.zip'
    New-DeterministicPackageZip $fixture $firstZip $timestamp
    New-DeterministicPackageZip $fixture $secondZip $timestamp
    if ((Get-FileHash -LiteralPath $firstZip).Hash -ne (Get-FileHash -LiteralPath $secondZip).Hash) {
        throw 'El ZIP no es determinista para los mismos archivos.'
    }
    $passed.Add('ZIP determinista con orden y fechas estables')
    & (Join-Path $PSScriptRoot 'verify-windows-package.ps1') -Path $firstZip | Out-Null
    $passed.Add('Verifica el ZIP sin extraer ni ejecutar su contenido')

    Assert-Rejected 'No sobrescribe un paquete existente' { New-DeterministicPackageZip $fixture $firstZip $timestamp }
    Assert-Rejected 'No sobrescribe un archivo existente' { Write-PackageText (Join-Path $fixture 'Nexora.exe') 'changed' }
    Assert-Rejected 'Rechaza una ruta fuera del paquete' { Get-PackageRelativePath $fixture (Join-Path $testRoot 'outside') }
    Assert-Rejected 'Rechaza traversal en manifiestos' { Read-PackageChecksums (('a' * 64) + '  ../outside.exe') 'SHA256SUMS.txt' }
    Assert-Rejected 'Rechaza rutas absolutas en manifiestos' { Read-PackageChecksums (('a' * 64) + '  C:/outside.exe') 'SHA256SUMS.txt' }
    Assert-Rejected 'Rechaza flujos alternativos NTFS' { Read-PackageChecksums (('a' * 64) + '  file.txt:payload') 'SHA256SUMS.txt' }
    Assert-Rejected 'Rechaza dispositivos reservados Windows' { Read-PackageChecksums (('a' * 64) + '  NUL.txt') 'SHA256SUMS.txt' }
    Assert-Rejected 'Rechaza nombres ambiguos Windows' { Read-PackageChecksums (('a' * 64) + '  file.txt.') 'SHA256SUMS.txt' }
    Assert-Rejected 'Rechaza duplicados de nombres Windows' {
        Read-PackageChecksums ((('a' * 64) + "  name.exe`n") + (('b' * 64) + '  NAME.exe')) 'SHA256SUMS.txt'
    }

    Write-PackageText (Join-Path $fixture 'extra.txt') 'unexpected'
    Assert-Rejected 'Rechaza archivos adicionales no inventariados' { Test-PackageDirectory $fixture 'SHA256SUMS.txt' }

    $tampered = Join-Path $testRoot 'tampered'
    Write-PackageText (Join-Path $tampered 'Nexora.exe') 'changed'
    Copy-PackageFile (Join-Path $fixture 'SHA256SUMS.txt') (Join-Path $tampered 'SHA256SUMS.txt')
    Assert-Rejected 'Rechaza contenido modificado' { Test-PackageDirectory $tampered 'SHA256SUMS.txt' }

    $missing = Join-Path $testRoot 'missing'
    Copy-PackageFile (Join-Path $fixture 'SHA256SUMS.txt') (Join-Path $missing 'SHA256SUMS.txt')
    Assert-Rejected 'Rechaza archivos ausentes' { Test-PackageDirectory $missing 'SHA256SUMS.txt' }

    $duplicateZip = Join-Path $testRoot 'duplicate.zip'
    $archive = [IO.Compression.ZipFile]::Open($duplicateZip, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entryName in @('SHA256SUMS.txt', 'Nexora.exe', 'nexora.EXE')) {
            $entry = $archive.CreateEntry($entryName)
            $writer = [IO.StreamWriter]::new($entry.Open())
            try {
                if ($entryName -eq 'SHA256SUMS.txt') {
                    $writer.Write((Get-FileHash -LiteralPath (Join-Path $fixture 'Nexora.exe')).Hash + '  Nexora.exe')
                }
                else { $writer.Write('fixture-only') }
            }
            finally { $writer.Dispose() }
        }
    }
    finally { $archive.Dispose() }
    Assert-Rejected 'Rechaza entradas ZIP duplicadas' { & (Join-Path $PSScriptRoot 'verify-windows-package.ps1') -Path $duplicateZip }

    Assert-Rejected 'Rechaza el traversal en el nombre del manifiesto' { Test-PackageDirectory $fixture '../outside.sha256' }
    $oversized = Join-Path $testRoot 'oversized'
    Write-PackageText (Join-Path $oversized 'SHA256SUMS.txt') ('a' * (16MB + 1))
    Assert-Rejected 'Rechaza manifiestos de directorio mayores de 16 MiB' { Test-PackageDirectory $oversized 'SHA256SUMS.txt' }
    $symlinkDirectory = Join-Path $testRoot 'symlink-manifest'
    New-Item -ItemType Directory -Path $symlinkDirectory | Out-Null
    $symlinkPath = Join-Path $symlinkDirectory 'SHA256SUMS.txt'
    $symlinkCreated = $false
    try {
        try {
            New-Item -ItemType SymbolicLink -Path $symlinkPath -Target (Join-Path $fixture 'SHA256SUMS.txt') | Out-Null
            $symlinkCreated = $true
        }
        catch {
            if (-not $IsWindows -or $_.Exception.Message -notmatch 'privilege|privilegio|Administrator|administrador') { throw }
            Write-Information 'Manifiesto symlink: omitido porque Windows no concede el privilegio.' -InformationAction Continue
        }
        if ($symlinkCreated) {
            Assert-Rejected 'Rechaza manifiestos symlink antes de leerlos' { Test-PackageDirectory $symlinkDirectory 'SHA256SUMS.txt' }
        }
    }
    finally { if ($symlinkCreated) { Remove-Item -LiteralPath $symlinkPath -Force } }
    [pscustomobject]@{ Passed = $passed.Count; Tests = $passed.ToArray() } | ConvertTo-Json -Depth 3
}
finally {
    $resolvedTestRoot = Assert-PlainPath $testRoot
    $allowedPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTestRoot.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedTestRoot) -notmatch '^nexora-package-test-[a-f0-9]{32}$') {
        throw 'La limpieza temporal sale del directorio de pruebas.'
    }
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
}
