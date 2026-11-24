# Rebuild the signed office APK. Keep the release key/properties outside Git.
# Back up both files in ~/.onclock-signing securely; updates require the same key.
param([string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME = $JavaHome
$env:ONCLOCK_KIOSK_SIGNING_FILE = Join-Path $env:USERPROFILE '.onclock-signing\office-kiosk.properties'
if (!(Test-Path -LiteralPath $env:ONCLOCK_KIOSK_SIGNING_FILE)) { throw 'Restore the private release signing properties and key before building.' }
Push-Location (Join-Path $workspace 'android-office-kiosk')
try {
  & .\gradlew.bat --no-daemon assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
  $apk = Join-Path $workspace 'android-office-kiosk\app\build\outputs\apk\release\app-release.apk'
  $signer = Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools\36.0.0\apksigner.bat'
  & $signer verify --verbose --print-certs $apk
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
  $destination = Join-Path $workspace 'public\downloads\onclock-office-kiosk-1.0.1.apk'
  Copy-Item -LiteralPath $apk -Destination $destination
  $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$destination.sha256" -Value "$hash  onclock-office-kiosk-1.0.1.apk" -Encoding ascii
} finally { Pop-Location }
