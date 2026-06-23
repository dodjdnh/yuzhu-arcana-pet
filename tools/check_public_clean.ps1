param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$trackedAssetPatterns = @(
    'apps/desktop-pet/public/assets/alice/skins/**/*.webp',
    'apps/desktop-pet/public/assets/alice/skins/**/*.png',
    'apps/desktop-pet/public/assets/alice/skins/**/*.jpg',
    'apps/desktop-pet/public/assets/alice/skins/**/*.jpeg'
)

$trackedAssets = foreach ($pattern in $trackedAssetPatterns) {
    git ls-files $pattern
}
$trackedAssets = $trackedAssets | Where-Object { $_ }

$trackedManifest = git ls-files 'apps/desktop-pet/public/assets/alice/manifest.json'
$manifestExampleExists = Test-Path -LiteralPath 'apps/desktop-pet/public/assets/alice/manifest.example.json'
$importScriptExists = Test-Path -LiteralPath 'tools/import_alice_assets.ps1'
$readmeMentionsAssets = Select-String -Path 'README.md', 'apps/desktop-pet/README.md' -Pattern '不分发角色素材|不提供角色素材' -ErrorAction SilentlyContinue
$failed = $false

Write-Host '== Public Clean Check =='

if ($trackedAssets) {
    Write-Warning 'tracked role image assets still exist:'
    $trackedAssets | ForEach-Object { Write-Host "  $_" }
    $failed = $true
} else {
    Write-Host '[ok] no tracked role image assets'
}

if ($trackedManifest) {
    Write-Warning 'manifest.json is still tracked'
    $failed = $true
} else {
    Write-Host '[ok] manifest.json is not tracked'
}

if ($manifestExampleExists) {
    Write-Host '[ok] manifest.example.json exists'
} else {
    Write-Warning 'manifest.example.json missing'
    $failed = $true
}

if ($importScriptExists) {
    Write-Host '[ok] import_alice_assets.ps1 exists'
} else {
    Write-Warning 'import_alice_assets.ps1 missing'
    $failed = $true
}

if ($readmeMentionsAssets) {
    Write-Host '[ok] README mentions that character assets are not distributed'
} else {
    Write-Warning 'README does not clearly mention that character assets are not distributed'
    $failed = $true
}

if ($failed) {
    exit 1
}
