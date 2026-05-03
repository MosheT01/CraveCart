#Requires -Version 5.1
<#
  Deploy CraveCart kroger-mcp to Fly.io (hybrid workaround for Akamai on GCP).
  1) Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
  2) In this folder, run: flyctl auth login
  3) Production (same Kroger keys as Cloud Run): pull from Secret Manager - do NOT use repo .env

     .\deploy-fly.ps1 -KrogerRedirectUri "https://YOUR-WEB.run.app/auth/kroger/callback" `
       -FromGcpSecretManager -GcpProject YOUR_GCP_PROJECT

  Local dev only: -UseParentEnv reads repo root ..\.env (never use for prod Fly).

  Redirect is always set from -KrogerRedirectUri (must match Kroger Developer + Cloud Run web callback).
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $KrogerRedirectUri,

    [string] $AppName = "",

    [string] $GcpProject = "",

    [string] $KrogerLocationId = "",

    [switch] $FromGcpSecretManager,

    [switch] $UseParentEnv
)

function Get-KrogerLocationFromCloudRunWeb {
    param([string] $Project)
    try {
        $raw = & gcloud run services describe cravecart-web --region=us-central1 --project=$Project --format=json 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $raw) { return "" }
        $desc = $raw | ConvertFrom-Json
        $envList = $desc.spec.template.spec.containers[0].env
        foreach ($entry in $envList) {
            if ($entry.name -eq "KROGER_LOCATION_ID") {
                if ($entry.value) { return [string]$entry.value }
                return ""
            }
        }
    } catch {
        return ""
    }
    return ""
}

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

if (-not (Get-Command flyctl -ErrorAction SilentlyContinue)) {
    Write-Error "flyctl not on PATH. Install: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
}

flyctl auth whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in to Fly. Run this in a normal terminal (browser will open):"
    Write-Host "  flyctl auth login"
    exit 1
}

if (-not [string]::IsNullOrWhiteSpace($AppName)) {
    $cfg = Get-Content -Raw -LiteralPath ".\fly.toml"
    $cfg2 = [regex]::Replace($cfg, '(?m)^app\s*=\s*".*"', ('app = "' + $AppName.Replace('"','') + '"'))
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "fly.toml"), $cfg2, $enc)
    Write-Host "Set fly.toml app to: $AppName"
}

$name = ""
foreach ($line in Get-Content ".\fly.toml") {
    if ($line -match '^\s*app\s*=\s*"([^"]+)"') { $name = $Matches[1]; break }
}
if (-not $name) { Write-Error "Could not parse app name from fly.toml"; exit 1 }
Write-Host "Fly app name: $name"

$flyApps = @(
    flyctl apps list -q 2>&1 | ForEach-Object {
        $line = $_
        if ($line -is [string]) { $line.Trim() } elseif ($line.ToString()) { $line.ToString().Trim() } else { $null }
    } | Where-Object { $_ -and ($_ -notmatch '^Warning:|^Error:') }
)
if ($flyApps -notcontains $name) {
    Write-Host "Creating app $name ..."
    flyctl apps create $name --org personal 2>&1
    if ($LASTEXITCODE -ne 0) { flyctl apps create $name 2>&1 }
}

if ($FromGcpSecretManager -and $UseParentEnv) {
    Write-Error "Use -FromGcpSecretManager OR -UseParentEnv, not both."
    exit 1
}

if ($FromGcpSecretManager -and [string]::IsNullOrWhiteSpace($GcpProject)) {
    Write-Error "-FromGcpSecretManager requires -GcpProject (GCP project id that holds KROGER_* secrets)."
    exit 1
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    if ($FromGcpSecretManager) {
        Write-Error "gcloud not on PATH. Install Google Cloud SDK for -FromGcpSecretManager."
        exit 1
    }
}

$cId = ""
$cSec = ""
$loc = ""
$internalSecret = ""

if ($FromGcpSecretManager) {
    Write-Host "Reading KROGER_CLIENT_ID / KROGER_CLIENT_SECRET from Secret Manager (project: $GcpProject) ..."
    $cId = (& gcloud secrets versions access latest --secret=KROGER_CLIENT_ID --project=$GcpProject 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($cId)) {
        Write-Error "Could not read KROGER_CLIENT_ID from Secret Manager. Check IAM and secret name."
        exit 1
    }
    $cSec = (& gcloud secrets versions access latest --secret=KROGER_CLIENT_SECRET --project=$GcpProject 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($cSec)) {
        Write-Error "Could not read KROGER_CLIENT_SECRET from Secret Manager."
        exit 1
    }
    Write-Host "Reading INTERNAL_SIDECAR_SECRET (must match cravecart-web on Cloud Run) ..."
    $internalSecret = (& gcloud secrets versions access latest --secret=INTERNAL_SIDECAR_SECRET --project=$GcpProject 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($internalSecret)) {
        Write-Error "Could not read INTERNAL_SIDECAR_SECRET from Secret Manager. Create it once (openssl rand -base64 32 | gcloud secrets create INTERNAL_SIDECAR_SECRET --data-file=-)."
        exit 1
    }
}

if ($UseParentEnv) {
    Write-Host ""
    Write-Warning "UseParentEnv: reading repo-root .env - for LOCAL DEV only. Production Fly MUST use -FromGcpSecretManager."
    Write-Host ""
    $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
    if (-not (Test-Path $envPath)) { Write-Error "Missing $envPath"; exit 1 }
    Get-Content -LiteralPath $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $i = $line.IndexOf("=")
            $k = $line.Substring(0, $i).Trim()
            $v = $line.Substring($i + 1).Trim()
            switch ($k) {
                "KROGER_CLIENT_ID" { $cId = $v }
                "KROGER_CLIENT_SECRET" { $cSec = $v }
                "KROGER_LOCATION_ID" { $loc = $v }
                "INTERNAL_SIDECAR_SECRET" { $internalSecret = $v }
            }
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($KrogerLocationId)) {
    $loc = $KrogerLocationId.Trim()
}

if ($FromGcpSecretManager -and [string]::IsNullOrWhiteSpace($loc)) {
    $loc = Get-KrogerLocationFromCloudRunWeb -Project $GcpProject
    if (-not [string]::IsNullOrWhiteSpace($loc)) {
        Write-Host "Using KROGER_LOCATION_ID from Cloud Run service cravecart-web: $loc"
    }
}

if (-not $cId) { $cId = Read-Host "KROGER_CLIENT_ID" }
if (-not $cSec) {
    $cSec = Read-Host "KROGER_CLIENT_SECRET" -AsSecureString | ForEach-Object { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)) }
}
if (-not $loc) { $loc = Read-Host "KROGER_LOCATION_ID (e.g. YOUR_STORE_LOCATION_ID)" }

if (-not $internalSecret) {
    $internalSecret = Read-Host "INTERNAL_SIDECAR_SECRET (must match GCP INTERNAL_SIDECAR_SECRET used by cravecart-web)"
}

Write-Host "Publishing secrets on Fly (non-staged: Fly restarts machines with vault env, then deploy updates the image)..."
flyctl secrets set `
    "KROGER_CLIENT_ID=$cId" `
    "KROGER_CLIENT_SECRET=$cSec" `
    "KROGER_REDIRECT_URI=$KrogerRedirectUri" `
    "KROGER_LOCATION_ID=$loc" `
    "INTERNAL_SIDECAR_SECRET=$internalSecret" `
    --app $name

Write-Host "`nDeploying..."
flyctl deploy --app $name --remote-only 2>&1

$url = "$name.fly.dev"

Write-Host "`n--- Done ---"
Write-Host "Health: https://$($url)/health"
Write-Host "On Cloud Run cravecart-web, set:"
Write-Host "  KROGER_SIDECAR_URL=https://$($url)"
Write-Host "  KROGER_MCP_URL=https://$($url)"
Write-Host "Then deploy a new web revision."
