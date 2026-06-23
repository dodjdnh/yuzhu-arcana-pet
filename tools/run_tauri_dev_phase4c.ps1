$ErrorActionPreference = "Stop"

$env:PATH = "$env:USERPROFILE\.cargo\bin;" + $env:PATH

if (-not $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
}

Set-Location "E:\AstrbotYuzhuDesktopPet\apps\desktop-pet"
npm run tauri:dev
