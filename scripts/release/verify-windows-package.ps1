#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Path,
    [string] $ManifestName = 'SHA256SUMS.txt'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$packagePath = Assert-PlainPath $Path

if (Test-Path -LiteralPath $packagePath -PathType Container) {
    $count = Test-PackageDirectory $packagePath $ManifestName
}
else {
    $archive = [IO.Compression.ZipFile]::OpenRead($packagePath)
    try {
        $manifestEntry = $archive.GetEntry($ManifestName)
        if (-not $manifestEntry -or $manifestEntry.Length -gt 16MB) { throw 'Falta el manifiesto SHA-256 o es demasiado grande.' }
        $reader = [IO.StreamReader]::new($manifestEntry.Open())
        try { $hashes = Read-PackageChecksums $reader.ReadToEnd() $ManifestName }
        finally { $reader.Dispose() }
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $count = 0
        foreach ($entry in $archive.Entries) {
            $entryName = $entry.FullName
            Assert-PackageRelativePath $entryName
            if (-not $seen.Add($entryName)) { throw "Entrada ZIP duplicada: $entryName" }
            if ((($entry.ExternalAttributes -shr 16) -band 0xf000) -eq 0xa000) { throw "Enlace ZIP no permitido: $entryName" }
            if ($entryName -eq $ManifestName) { continue }
            if (-not $hashes.ContainsKey($entryName)) { throw "Archivo ZIP no inventariado: $entryName" }
            $stream = $entry.Open()
            try { $actual = Get-StreamSha256 $stream }
            finally { $stream.Dispose() }
            if ($actual -ne $hashes[$entryName]) { throw "SHA-256 incorrecto: $entryName" }
            $count++
        }
        if ($count -ne $hashes.Count) { throw 'Faltan archivos en el ZIP.' }
    }
    finally { $archive.Dispose() }
}

[pscustomobject]@{ Path = $packagePath; VerifiedFiles = $count; Status = 'Verified' }
