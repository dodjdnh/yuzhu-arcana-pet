param(
    [string]$RuntimeRoot = 'E:\AstrbotYuzhuDesktopPet\astrbot_runtime_root',
    [string]$ExternalConfigRoot = 'E:\AstrbotYuzhuDesktopPet\astrbot_local_config',
    [switch]$DisablePlatforms = $true,
    [string[]]$EnabledPlatforms = @()
)

$ErrorActionPreference = 'Stop'

function Ensure-Dir {
    param([Parameter(Mandatory = $true)][string]$Path)
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Object
    )
    $dir = Split-Path -Parent $Path
    if ($dir) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $Object | ConvertTo-Json -Depth 10 | Set-Content -Path $Path -Encoding UTF8
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$labRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeRootPath = if ([System.IO.Path]::IsPathRooted($RuntimeRoot)) {
    $RuntimeRoot
} else {
    Join-Path $workspaceRoot ($RuntimeRoot -replace '^[.\\\/]+', '')
}

$runtimeDataPath = Join-Path $runtimeRootPath 'data'
$runtimePluginsPath = Join-Path $runtimeDataPath 'plugins'
$runtimeKnowledgeBasePath = Join-Path $runtimeDataPath 'knowledge_base'
$sourceDataPath = Join-Path $labRoot 'server_sync\data'
$workspaceConfigRoot = if ([string]::IsNullOrWhiteSpace($ExternalConfigRoot)) {
    Join-Path $workspaceRoot 'astrbot_local_config'
} elseif ([System.IO.Path]::IsPathRooted($ExternalConfigRoot)) {
    $ExternalConfigRoot
} else {
    Join-Path (Get-Location).Path ($ExternalConfigRoot -replace '^[.\\\/]+', '')
}
$externalCmdConfigPath = Join-Path $workspaceConfigRoot 'cmd_config.json'
$externalRuntimeConfigPath = Join-Path $workspaceConfigRoot 'runtime_config'
$externalKnowledgeBasePath = Join-Path $workspaceConfigRoot 'knowledge_base'

Ensure-Dir -Path $runtimeDataPath
Ensure-Dir -Path $runtimePluginsPath

Write-Host "[runtime] prepare data dir: $runtimeDataPath"
Copy-Item -Path (Join-Path $sourceDataPath '*') -Destination $runtimeDataPath -Recurse -Force

if (Test-Path $externalCmdConfigPath) {
    Write-Host "[runtime] overlay external cmd_config: $externalCmdConfigPath"
    Copy-Item -Path $externalCmdConfigPath -Destination (Join-Path $runtimeDataPath 'cmd_config.json') -Force
}

if (Test-Path $externalKnowledgeBasePath) {
    Write-Host "[runtime] overlay external knowledge_base: $externalKnowledgeBasePath"
    if (Test-Path $runtimeKnowledgeBasePath) {
        Remove-Item -Recurse -Force $runtimeKnowledgeBasePath
    }
    Copy-Item -Path $externalKnowledgeBasePath -Destination $runtimeKnowledgeBasePath -Recurse -Force
}

$runtimeDistPath = Join-Path $runtimeDataPath 'dist'
$runtimeDashboardZip = Join-Path $runtimeDataPath 'dashboard.zip'
if ((-not (Test-Path $runtimeDistPath)) -and (Test-Path $runtimeDashboardZip)) {
    Write-Host "[runtime] extract dashboard.zip -> data/dist"
    Expand-Archive -Path $runtimeDashboardZip -DestinationPath $runtimeDataPath -Force
}

$overlayPlugins = @(
    'astrbot_plugin_airi_context_sync',
    'astrbot_plugin_airi_voice_bridge',
    'astrbot_plugin_airi_screen_sync'
)

foreach ($plugin in $overlayPlugins) {
    $sourcePlugin = Join-Path $labRoot $plugin
    $targetPlugin = Join-Path $runtimePluginsPath $plugin
    if (Test-Path $sourcePlugin) {
        Write-Host "[runtime] overlay plugin: $plugin"
        if (Test-Path $targetPlugin) {
            Remove-Item -Recurse -Force $targetPlugin
        }
        Copy-Item -Path $sourcePlugin -Destination $targetPlugin -Recurse -Force
    }
}

$cmdConfigPath = Join-Path $runtimeDataPath 'cmd_config.json'
if (-not (Test-Path $cmdConfigPath)) {
    throw "cmd_config.json missing: $cmdConfigPath"
}

$prepareConfigScript = Join-Path $PSScriptRoot 'prepare_runtime_config.py'
$pythonArgs = @($prepareConfigScript, '--cmd-config', $cmdConfigPath)
if ($DisablePlatforms) {
    $pythonArgs += '--disable-platforms'
}
foreach ($platformId in $EnabledPlatforms) {
    if ($platformId) {
        $pythonArgs += @('--enable-platform', $platformId)
    }
}
python @pythonArgs

$runtimeConfigPath = Join-Path $runtimeDataPath 'config'
Ensure-Dir -Path $runtimeConfigPath

$contextConfigPath = Join-Path $runtimeConfigPath 'astrbot_plugin_airi_context_sync_config.json'
$voiceConfigPath = Join-Path $runtimeConfigPath 'astrbot_plugin_airi_voice_bridge_config.json'
$screenConfigPath = Join-Path $runtimeConfigPath 'astrbot_plugin_airi_screen_sync_config.json'
$companionPreviewConfigPath = Join-Path $runtimeConfigPath 'astrbot_plugin_companion_preview_config.json'
$sharedSnapshotDir = Join-Path $labRoot 'shared\context_snapshots'
$externalContextConfigPath = Join-Path $externalRuntimeConfigPath 'astrbot_plugin_airi_context_sync_config.json'
$externalVoiceConfigPath = Join-Path $externalRuntimeConfigPath 'astrbot_plugin_airi_voice_bridge_config.json'
$externalScreenConfigPath = Join-Path $externalRuntimeConfigPath 'astrbot_plugin_airi_screen_sync_config.json'
$externalCompanionPreviewConfigPath = Join-Path $externalRuntimeConfigPath 'astrbot_plugin_companion_preview_config.json'

if (Test-Path $externalContextConfigPath) {
    Write-Host "[runtime] overlay external runtime config: $externalContextConfigPath"
    Copy-Item -Path $externalContextConfigPath -Destination $contextConfigPath -Force
} else {
    Write-JsonFile -Path $contextConfigPath -Object @{
        enabled = $true
        snapshot_dir = $sharedSnapshotDir
        inject_position = 'append'
        max_chars = 4000
        include_source_meta = $true
    }
}

if (Test-Path $externalVoiceConfigPath) {
    Write-Host "[runtime] overlay external runtime config: $externalVoiceConfigPath"
    Copy-Item -Path $externalVoiceConfigPath -Destination $voiceConfigPath -Force
} else {
    Write-JsonFile -Path $voiceConfigPath -Object @{
        enabled = $true
        server_url = 'http://127.0.0.1:8787'
        token = 'local-airi-dev-token'
        token_env = 'AIRI_TOKEN'
        tts_model = 'local/edge-tts'
        tts_voice = 'zh-CN-XiaoxiaoNeural'
        tts_response_format = 'mp3'
        auto_tts_default = $false
        text_limit = 500
        audio_temp_dir = ''
    }
}

if (Test-Path $externalScreenConfigPath) {
    Write-Host "[runtime] overlay external runtime config: $externalScreenConfigPath"
    Copy-Item -Path $externalScreenConfigPath -Destination $screenConfigPath -Force
} else {
    Write-JsonFile -Path $screenConfigPath -Object @{
        enabled = $true
        capture_all_screens = $true
        image_format = 'jpeg'
        jpeg_quality = 75
        max_side = 1600
        attach_hint_context = $true
        image_temp_dir = ''
    }
}

if (Test-Path $externalCompanionPreviewConfigPath) {
    Write-Host "[runtime] overlay external runtime config: $externalCompanionPreviewConfigPath"
    Copy-Item -Path $externalCompanionPreviewConfigPath -Destination $companionPreviewConfigPath -Force
}

Write-Host "[runtime] runtime root prepared: $runtimeRootPath"
Write-Host "[runtime] external config root: $workspaceConfigRoot"
Write-Host "[runtime] all platforms disabled: $DisablePlatforms"
if ($EnabledPlatforms.Count -gt 0) {
    Write-Host "[runtime] explicitly enabled platforms: $($EnabledPlatforms -join ', ')"
}
Write-Host "[runtime] data/plugins includes AIRI overlay plugins"
