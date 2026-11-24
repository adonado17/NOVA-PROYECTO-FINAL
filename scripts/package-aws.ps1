#requires -Version 7.0
# Portable Node.js application bundle; this script does not call AWS.
[CmdletBinding()]
param(
    [string]$OutputPath,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendSource = Join-Path $repositoryRoot 'backend/src'
$browserOutput = Join-Path $repositoryRoot 'frontend/dist/frontend/browser'
$requiredNode = '>=24.15.0 <25'
$startCommand = 'node backend/src/server.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Set-JsonProperty {
    param($Object, [string]$Name, $Value)
    if ($Object -is [System.Collections.IDictionary]) {
        $Object[$Name] = $Value
        return
    }
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

function Get-JsonProperty {
    param($Object, [string]$Name)
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Get-DependencyMap {
    param($Object, [string]$Name)
    $map = Get-JsonProperty $Object $Name
    if ($null -eq $map) { return '{}' }
    $ordered = [ordered]@{}
    if ($map -is [System.Collections.IDictionary]) {
        foreach ($property in ($map.GetEnumerator() | Sort-Object Key)) {
            $ordered[$property.Key] = $property.Value
        }
    }
    else {
        foreach ($property in ($map.PSObject.Properties | Sort-Object Name)) {
            $ordered[$property.Name] = $property.Value
        }
    }
    return ($ordered | ConvertTo-Json -Depth 20 -Compress)
}

function Assert-PackageLock {
    param($Package, $Lock)
    $packages = Get-JsonProperty $Lock 'packages'
    if ($null -eq $packages -or -not $packages.Contains('')) {
        throw 'El lock del backend debe usar lockfileVersion 2 o 3 y contener packages[""].'
    }
    $lockRoot = $packages['']
    foreach ($name in @('name', 'version')) {
        if ((Get-JsonProperty $Package $name) -ne (Get-JsonProperty $Lock $name) -or
            (Get-JsonProperty $Package $name) -ne (Get-JsonProperty $lockRoot $name)) {
            throw "package.json y package-lock.json no coinciden en '$name'."
        }
    }
    foreach ($name in @('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'engines')) {
        if ((Get-DependencyMap $Package $name) -cne (Get-DependencyMap $lockRoot $name)) {
            throw "package.json y la entrada raiz del lock no coinciden en '$name'."
        }
    }
    if ((Get-JsonProperty (Get-JsonProperty $Package 'scripts') 'start') -cne $startCommand -or
        (Get-JsonProperty (Get-JsonProperty $Package 'engines') 'node') -cne $requiredNode) {
        throw 'El paquete no contiene el inicio o el rango de Node.js requeridos.'
    }
}

function Assert-SourceLock {
    param($Package, $Lock)
    $packages = Get-JsonProperty $Lock 'packages'
    if ($null -eq $packages -or -not $packages.Contains('')) {
        throw 'El package-lock.json del backend debe usar lockfileVersion 2 o 3.'
    }
    $rootEntry = $packages['']
    foreach ($name in @('name', 'version')) {
        if ((Get-JsonProperty $Package $name) -ne (Get-JsonProperty $Lock $name) -or
            (Get-JsonProperty $Package $name) -ne (Get-JsonProperty $rootEntry $name)) {
            throw "Actualiza el lock del backend: '$name' no coincide con package.json."
        }
    }
    foreach ($name in @('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies')) {
        if ((Get-DependencyMap $Package $name) -cne (Get-DependencyMap $rootEntry $name)) {
            throw "Actualiza el lock del backend: '$name' no coincide con package.json."
        }
    }
}

function Assert-AllowedFile {
    param([string]$RelativePath)
    $path = $RelativePath.Replace('\', '/')
    if ($path.StartsWith('/') -or $path.Contains(':') -or $path -match '(^|/)\.\.(/|$)') {
        throw "Ruta de archivo no permitida: $RelativePath"
    }
    $isRootFile = $path -cin @('package.json', 'package-lock.json', 'Procfile')
    $isSource = $path.StartsWith('backend/src/', [System.StringComparison]::Ordinal)
    $isBrowser = $path.StartsWith('frontend/dist/frontend/browser/', [System.StringComparison]::Ordinal)
    if (-not ($isRootFile -or $isSource -or $isBrowser)) {
        throw "Archivo fuera de la lista de inclusion: $RelativePath"
    }
    if ($path -match '(?i)(^|/)(node_modules|\.git|\.env(?:\.[^/]*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|credentials(?:\.json)?|id_rsa|id_dsa|id_ed25519)(/|$)' -or
        $path -match '(?i)\.(pem|key|p12|pfx|keystore)$') {
        throw "El paquete no puede contener archivos de credenciales: $RelativePath"
    }
    if ($isBrowser -and $path -match '(?i)\.(map|ts|tsx|jsx|scss|sass|less|vue)$') {
        throw "El paquete solo debe incluir el frontend compilado, sin fuentes ni mapas: $RelativePath"
    }
}

function Assert-NoEmbeddedSecret {
    param([string]$RelativePath, [string]$Content)
    $rules = @(
        '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
        '(?i)mongodb(?:\+srv)?://[^\s''"<>:/]+:[^\s''"<>@]+@',
        '(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])',
        '(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
        '(?i)[''"]?\b(?:JWT_SECRET|MONGODB_URI|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\b[''"]?\s*[:=]\s*[''"][^''"\r\n]{8,}[''"]'
    )
    for ($index = 0; $index -lt $rules.Count; $index++) {
        if ($Content -cmatch $rules[$index]) {
            # Report the filename and rule, never the potentially sensitive value.
            throw "Posible credencial incorporada en '$RelativePath' (regla $($index + 1))."
        }
    }
}

function Test-TextFile {
    param([string]$RelativePath)
    return $RelativePath -match '(?i)(\.(js|mjs|cjs|json|html|css|config|yaml|yml|txt|xml|svg)$|(^|/)Procfile$)'
}

function Copy-AllowedTree {
    param([string]$Source, [string]$DestinationPrefix, [string]$Stage)
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Falta el directorio requerido: $Source"
    }
    $sourceItem = Get-Item -LiteralPath $Source
    if (($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "No se admite un directorio de origen enlazado: $Source"
    }
    $sourceRoot = $sourceItem.FullName.TrimEnd([char[]]'\/')
    $items = @(Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse)
    foreach ($item in $items) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "No se admiten enlaces ni puntos de reanalisis en el paquete: $($item.FullName)"
        }
        if ($item.PSIsContainer) { continue }
        $relative = $item.FullName.Substring($sourceRoot.Length).TrimStart([char[]]'\/').Replace('\', '/')
        $archiveName = "$DestinationPrefix/$relative"
        Assert-AllowedFile $archiveName
        if (Test-TextFile $archiveName) {
            Assert-NoEmbeddedSecret $archiveName ([System.IO.File]::ReadAllText($item.FullName))
        }
        $target = Join-Path $Stage $archiveName
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
        [System.IO.File]::Copy($item.FullName, $target, $false)
    }
}

function Read-ArchiveText {
    param($Entry)
    $reader = New-Object System.IO.StreamReader($Entry.Open(), [System.Text.Encoding]::UTF8, $true)
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
}

function Assert-Archive {
    param([string]$Path, [string[]]$ExpectedFiles)
    $expected = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($name in $ExpectedFiles) { [void]$expected.Add($name) }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            Assert-AllowedFile $name
            if ($name.Contains('\') -or -not $expected.Contains($name) -or -not $seen.Add($name)) {
                throw "Entrada ZIP inesperada, duplicada o con ruta no portable: $name"
            }
            if (Test-TextFile $name) {
                Assert-NoEmbeddedSecret $name (Read-ArchiveText $entry)
            }
        }
        if ($seen.Count -ne $expected.Count) { throw 'El ZIP no contiene todos los archivos preparados.' }
        foreach ($name in @('package.json', 'package-lock.json', 'Procfile',
                             'backend/src/server.js', 'frontend/dist/frontend/browser/index.html')) {
            if (-not $seen.Contains($name)) { throw "Falta una entrada obligatoria en el ZIP: $name" }
        }
        $package = (Read-ArchiveText $archive.GetEntry('package.json')) | ConvertFrom-Json -AsHashtable
        $lock = (Read-ArchiveText $archive.GetEntry('package-lock.json')) | ConvertFrom-Json -AsHashtable
        Assert-PackageLock $package $lock
        if ((Read-ArchiveText $archive.GetEntry('Procfile')).Trim() -cne 'web: npm start') {
            throw 'El Procfile no coincide con el proceso web esperado.'
        }
    }
    finally { $archive.Dispose() }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repositoryRoot 'outputs/nova-aws.zip'
}
$absoluteOutput = [System.IO.Path]::GetFullPath($OutputPath)
if ([System.IO.Path]::GetExtension($absoluteOutput) -ine '.zip') {
    throw 'OutputPath debe ser la ruta de un archivo .zip.'
}
foreach ($inputRoot in @($backendSource, $browserOutput)) {
    $inputPrefix = [System.IO.Path]::GetFullPath($inputRoot).TrimEnd([char[]]'\/') + [System.IO.Path]::DirectorySeparatorChar
    if ($absoluteOutput.StartsWith($inputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'El ZIP de salida no puede guardarse dentro de uno de los directorios que se empaquetan.'
    }
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npm) { $npm = Get-Command npm -ErrorAction Stop }
if (-not $SkipBuild) {
    Write-Host 'Compilando el frontend de produccion...'
    & $npm.Source --prefix (Join-Path $repositoryRoot 'frontend') run build
    if ($LASTEXITCODE -ne 0) { throw "La compilacion del frontend fallo con codigo $LASTEXITCODE." }
}
if (-not (Test-Path -LiteralPath (Join-Path $browserOutput 'index.html') -PathType Leaf)) {
    throw 'No existe frontend/dist/frontend/browser/index.html. Compila el frontend antes de usar -SkipBuild.'
}

$package = (Get-Content -LiteralPath (Join-Path $repositoryRoot 'backend/package.json') -Raw) | ConvertFrom-Json -AsHashtable
$lock = (Get-Content -LiteralPath (Join-Path $repositoryRoot 'backend/package-lock.json') -Raw) | ConvertFrom-Json -AsHashtable
Assert-SourceLock $package $lock
$packages = Get-JsonProperty $lock 'packages'
if ($null -eq $packages -or -not $packages.Contains('')) {
    throw 'El package-lock.json del backend debe usar lockfileVersion 2 o 3.'
}
$lockRoot = $packages['']
Set-JsonProperty $package 'main' 'backend/src/server.js'
Set-JsonProperty $package 'scripts' ([pscustomobject]@{ start = $startCommand })
Set-JsonProperty $package 'engines' ([pscustomobject]@{ node = $requiredNode })
foreach ($name in @('name', 'version', 'license', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'engines')) {
    if ($package.Contains($name)) { Set-JsonProperty $lockRoot $name $package[$name] }
    else { [void]$lockRoot.Remove($name) }
}
foreach ($name in @('name', 'version')) { Set-JsonProperty $lock $name (Get-JsonProperty $package $name) }
[void]$lockRoot.Remove('hasInstallScript')
Assert-PackageLock $package $lock

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
$stageName = 'nova-aws-' + [guid]::NewGuid().ToString('N')
$stage = Join-Path $tempRoot $stageName
$outputDirectory = [System.IO.Path]::GetDirectoryName($absoluteOutput)
$temporaryZip = $absoluteOutput + '.' + [guid]::NewGuid().ToString('N') + '.tmp'

try {
    [System.IO.Directory]::CreateDirectory($stage) | Out-Null
    Copy-AllowedTree $backendSource 'backend/src' $stage
    Copy-AllowedTree $browserOutput 'frontend/dist/frontend/browser' $stage
    [System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), ($package | ConvertTo-Json -Depth 100) + "`n", $utf8)
    [System.IO.File]::WriteAllText((Join-Path $stage 'package-lock.json'), ($lock | ConvertTo-Json -Depth 100) + "`n", $utf8)
    [System.IO.File]::WriteAllText((Join-Path $stage 'Procfile'), "web: npm start`n", $utf8)
    # Validate npm's dependency graph without installing packages or using the network.
    $lockCheck = & $npm.Source --prefix $stage ci --dry-run --omit=dev --ignore-scripts --offline --audit=false --fund=false 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci rechazo el lock generado (codigo $LASTEXITCODE). Revisa el lock del backend antes de empaquetar."
    }
    Write-Verbose $lockCheck.Trim()
    $expectedFiles = @(Get-ChildItem -LiteralPath $stage -Force -Recurse -File | ForEach-Object {
        $_.FullName.Substring($stage.Length).TrimStart([char[]]'\/').Replace('\', '/')
    })
    foreach ($name in $expectedFiles) { Assert-AllowedFile $name }
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    # .NET preserves dotfiles; includeBaseDirectory=false keeps package.json at the ZIP root.
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $temporaryZip,
        [System.IO.Compression.CompressionLevel]::Optimal, $false)
    Assert-Archive $temporaryZip $expectedFiles
    Move-Item -LiteralPath $temporaryZip -Destination $absoluteOutput -Force
    $result = Get-Item -LiteralPath $absoluteOutput
    [pscustomobject]@{
        Archive = $result.FullName
        Files = $expectedFiles.Count
        Bytes = $result.Length
        SHA256 = (Get-FileHash -LiteralPath $absoluteOutput -Algorithm SHA256).Hash.ToLowerInvariant()
        Node = $requiredNode
        HealthCheck = '/api/ready'
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryZip -PathType Leaf) {
        Remove-Item -LiteralPath $temporaryZip -Force
    }
    if (Test-Path -LiteralPath $stage -PathType Container) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        $resolvedParent = [System.IO.Path]::GetDirectoryName($resolvedStage).TrimEnd([char[]]'\/')
        if ($resolvedStage -cne $stage -or $resolvedParent -cne $tempRoot -or
            [System.IO.Path]::GetFileName($resolvedStage) -cne $stageName) {
            throw 'Se rechazo la limpieza: el directorio temporal no coincide con el creado por este proceso.'
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
