param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$aliceRoot = Join-Path $repoRoot 'apps\desktop-pet\public\assets\alice'
$targetDir = Join-Path $aliceRoot 'skins\default_black'
$manifestExamplePath = Join-Path $aliceRoot 'manifest.example.json'
$manifestPath = Join-Path $aliceRoot 'manifest.json'

if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "SourceDir not found: $SourceDir"
}

if (-not (Test-Path -LiteralPath $manifestExamplePath)) {
    throw "manifest.example.json missing: $manifestExamplePath"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

if (-not (Test-Path -LiteralPath $manifestPath)) {
    Copy-Item -LiteralPath $manifestExamplePath -Destination $manifestPath -Force
    Write-Host "[import] created local manifest.json from manifest.example.json"
}

$mappings = @(
    @{ Target = 'idle_open.webp'; Patterns = @('*ARI_A_01_08_00*.webp') }
    @{ Target = 'idle_closed.webp'; Patterns = @('*ARI_A_01_08_04*.webp') }
    @{ Target = 'soft_idle.webp'; Patterns = @('*ARI_A_01_02_03*.webp') }
    @{ Target = 'shy.webp'; Patterns = @('*ARI_A_01_10_04*.webp') }
    @{ Target = 'attention.webp'; Patterns = @('*ARI_A_01_08_02*.webp') }
    @{ Target = 'magic.webp'; Patterns = @('*ARI_A_01_19_00*.webp') }
    @{ Target = 'annoyed.webp'; Patterns = @('*ARI_A_01_14_02*.webp') }
    @{ Target = 'speaking.webp'; Patterns = @('*ARI_A_01_03_00*.webp') }
    @{ Target = 'thinking.webp'; Patterns = @('*ARI_A_01_16_00*.webp') }
    @{ Target = 'cold.webp'; Patterns = @('*ARI_A_01_14_00*.webp') }
    @{ Target = 'hand_mouth.webp'; Patterns = @('*ARI_A_01_10_00*.webp') }
)

foreach ($mapping in $mappings) {
    $match = $null

    foreach ($pattern in $mapping.Patterns) {
        $match = Get-ChildItem -LiteralPath $SourceDir -Recurse -File |
            Where-Object { $_.Name -like $pattern } |
            Sort-Object FullName |
            Select-Object -First 1

        if ($match) {
            break
        }
    }

    if (-not $match) {
        Write-Warning "missing source for $($mapping.Target); checked patterns: $($mapping.Patterns -join ', ')"
        continue
    }

    $destination = Join-Path $targetDir $mapping.Target
    Copy-Item -LiteralPath $match.FullName -Destination $destination -Force
    Write-Host "[import] $($mapping.Target) <- $($match.Name)"
}
