Set-StrictMode -Version Latest

function Assert-PlainPath([string] $Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $cursor = $fullPath
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "No se permiten enlaces ni junctions: $cursor"
            }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $fullPath
}

function Get-PackageFiles([string] $Root) {
    $rootPath = Assert-PlainPath $Root
    if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
        throw "No existe el directorio: $rootPath"
    }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($rootPath)
    $files = [Collections.Generic.List[string]]::new()
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "No se permiten enlaces en el paquete: $($item.FullName)"
            }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
            else { $files.Add($item.FullName) }
        }
    }
    $files.Sort([StringComparer]::Ordinal)
    return $files.ToArray()
}

function Get-PackageRelativePath([string] $Root, [string] $Path) {
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "El archivo sale del directorio permitido: $fullPath"
    }
    return $fullPath.Substring($prefix.Length).Replace('\', '/')
}

function Assert-PackageRelativePath([string] $Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path.Contains('\') -or
        $Path.Contains(':') -or $Path -match '[\x00-\x1f]' -or
        $Path.StartsWith('/') -or ($Path.Split('/') | Where-Object {
            $_ -in @('', '.', '..') -or $_ -match '[. ]$' -or $_ -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)'
        })) {
        throw "Ruta no valida en el manifiesto: $Path"
    }
}

function Write-PackageText([string] $Path, [string] $Content) {
    $fullPath = Assert-PlainPath $Path
    if (Test-Path -LiteralPath $fullPath) { throw "El archivo ya existe: $fullPath" }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($fullPath)) | Out-Null
    [IO.File]::WriteAllText($fullPath, $Content.Replace("`r`n", "`n"), [Text.UTF8Encoding]::new($false))
}

function Copy-PackageFile([string] $Source, [string] $Destination) {
    $sourcePath = Assert-PlainPath $Source
    $destinationPath = Assert-PlainPath $Destination
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Falta el archivo requerido: $sourcePath" }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destinationPath)) | Out-Null
    [IO.File]::Copy($sourcePath, $destinationPath, $false)
}

function Copy-PackageTree([string] $Source, [string] $Destination) {
    foreach ($file in Get-PackageFiles $Source) {
        Copy-PackageFile $file (Join-Path $Destination (Get-PackageRelativePath $Source $file))
    }
}

function Get-StreamSha256([IO.Stream] $Stream) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($algorithm.ComputeHash($Stream)).ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

function Write-PackageChecksums([string] $Root, [string] $Name) {
    $lines = foreach ($file in Get-PackageFiles $Root) {
        $relativePath = Get-PackageRelativePath $Root $file
        Assert-PackageRelativePath $relativePath
        if ($relativePath -eq $Name) { throw 'El manifiesto ya existe.' }
        '{0}  {1}' -f (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant(), $relativePath
    }
    Write-PackageText (Join-Path $Root $Name) (($lines -join "`n") + "`n")
}

function Read-PackageChecksums([string] $Content, [string] $ManifestName) {
    $hashes = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($line in $Content.Split("`n")) {
        if (-not $line.Trim()) { continue }
        if ($line.TrimEnd("`r") -notmatch '^([a-fA-F0-9]{64})  (.+)$') { throw 'Formato SHA-256 no valido.' }
        $digest = $Matches[1].ToLowerInvariant()
        $path = $Matches[2]
        Assert-PackageRelativePath $path
        if ($path -eq $ManifestName -or $hashes.ContainsKey($path)) { throw "Entrada duplicada o circular: $path" }
        $hashes.Add($path, $digest)
    }
    if (-not $hashes.Count) { throw 'El manifiesto esta vacio.' }
    return ,$hashes
}

function Test-PackageDirectory([string] $Root, [string] $ManifestName) {
    $rootPath = Assert-PlainPath $Root
    Assert-PackageRelativePath $ManifestName
    if ($ManifestName.Contains('/')) { throw 'El manifiesto debe estar en la raiz del paquete.' }
    $manifestPath = Assert-PlainPath (Join-Path $rootPath $ManifestName)
    Get-PackageRelativePath $rootPath $manifestPath | Out-Null
    $manifest = Get-Item -LiteralPath $manifestPath -Force
    if ($manifest.PSIsContainer -or $manifest.Length -gt 16MB) {
        throw 'El manifiesto SHA-256 no es un archivo valido o supera 16 MiB.'
    }
    $hashes = Read-PackageChecksums ([IO.File]::ReadAllText($manifestPath)) $ManifestName
    $count = 0
    foreach ($file in Get-PackageFiles $Root) {
        $relativePath = Get-PackageRelativePath $Root $file
        if ($relativePath -eq $ManifestName) { continue }
        if (-not $hashes.ContainsKey($relativePath)) { throw "Archivo no inventariado: $relativePath" }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $hashes[$relativePath]) {
            throw "SHA-256 incorrecto: $relativePath"
        }
        $count++
    }
    if ($count -ne $hashes.Count) { throw 'Faltan archivos del manifiesto.' }
    return $count
}

function Assert-X64Executable([string] $Path) {
    $stream = [IO.File]::OpenRead((Assert-PlainPath $Path))
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'Cabecera DOS no valida.' }
        $stream.Position = 0x3c
        $offset = $reader.ReadUInt32()
        if ($offset -gt $stream.Length - 6) { throw 'Cabecera PE fuera del archivo.' }
        $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x00004550 -or $reader.ReadUInt16() -ne 0x8664) {
            throw 'Se requiere un binario Windows x64.'
        }
    }
    finally { $reader.Dispose(); $stream.Dispose() }
}

function New-DeterministicPackageZip([string] $Root, [string] $Destination, [DateTimeOffset] $Timestamp) {
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite)
    $archive = [IO.Compression.ZipArchive]::new($output, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($file in Get-PackageFiles $Root) {
            $entry = $archive.CreateEntry((Get-PackageRelativePath $Root $file), [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = $Timestamp
            $input = [IO.File]::OpenRead($file)
            $entryOutput = $entry.Open()
            try { $input.CopyTo($entryOutput) }
            finally { $input.Dispose(); $entryOutput.Dispose() }
        }
    }
    finally { $archive.Dispose(); $output.Dispose() }
}
