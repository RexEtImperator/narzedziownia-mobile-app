param(
  [string]$DeviceAddressOverride
)

$ErrorActionPreference = 'Stop'

function Resolve-AdbPath {
  $candidates = @(
    "$Env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
    "$Env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "$Env:ANDROID_HOME\platform-tools\adb.exe",
    "$Env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) { return $candidates[0] }

  $cmd = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path }

  throw "Nie znaleziono adb.exe. Zainstaluj Android SDK (Platform-Tools) lub dodaj adb do PATH."
}

function Load-Config {
  $configPath = Join-Path $PSScriptRoot 'adb-wifi-config.json'
  if (-not (Test-Path $configPath)) {
    throw "Brak pliku konfiguracyjnego: $configPath. Utwórz go z polem 'deviceAddress'."
  }
  $json = Get-Content -Raw -Path $configPath | ConvertFrom-Json
  if ($DeviceAddressOverride) { $json.deviceAddress = $DeviceAddressOverride }
  if (-not $json.deviceAddress) { throw "Konfiguracja nie zawiera 'deviceAddress' (np. 192.168.10.99:37013)." }
  return $json
}

function Ensure-FirewallRule($adbPath) {
  try {
    $ruleName = "ADB WiFi Outbound"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Outbound -Program $adbPath -Action Allow -Profile Any | Out-Null
    }
  } catch {
    # ignoruj błędy zapory (brak uprawnień nie blokuje działania)
  }
}

function Connect-Adb($adbPath, $deviceAddress) {
  Write-Host "Uruchamianie ADB i łączenie z $deviceAddress" -ForegroundColor Cyan
  & $adbPath kill-server | Out-Null
  & $adbPath start-server | Out-Null

  $maxAttempts = 3
  for ($i = 1; $i -le $maxAttempts; $i++) {
    $out = & $adbPath connect $deviceAddress 2>&1
    Write-Host $out
    if ($out -match 'connected to') { return $true }
    Start-Sleep -Seconds 2
  }

  # sprawdź urządzenia
  $devices = & $adbPath devices | Out-String
  Write-Host $devices
  return ($devices -match [regex]::Escape($deviceAddress))
}

try {
  $adbPath = Resolve-AdbPath
  $cfg = Load-Config
  Ensure-FirewallRule -adbPath $adbPath
  $ok = Connect-Adb -adbPath $adbPath -deviceAddress $cfg.deviceAddress
  if ($ok) {
    Write-Host "ADB po Wi‑Fi połączony: $($cfg.deviceAddress)" -ForegroundColor Green
    exit 0
  } else {
    Write-Host "Nie udało się połączyć ADB po Wi‑Fi z $($cfg.deviceAddress)." -ForegroundColor Yellow
    Write-Host "Upewnij się, że w telefonie jest włączone Wireless debugging i ustawione 'Always allow on this network'."
    exit 1
  }
} catch {
  Write-Host "Błąd: $($_.Exception.Message)" -ForegroundColor Red
  exit 2
}

