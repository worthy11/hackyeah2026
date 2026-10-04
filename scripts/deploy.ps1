# Redeploy API + web to Azure Container Apps from this machine.
# Prerequisites: Docker Desktop, Azure CLI, already logged in (`az login`).
# Usage (from repo root):
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -Tag "manual-1"
#   .\scripts\deploy.ps1 -SkipBuild

param(
    [string]$ResourceGroup = "hackyeah2026",
    [string]$AcrName = "hackyeah2026acr",
    [string]$ApiApp = "ca-hackyeah-api",
    [string]$WebApp = "ca-hackyeah-web",
    # Unique tag forces Container Apps to pull a new image.
    # "latest" alone often does NOT trigger a real redeploy.
    [string]$Tag = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

Require-Command az
Require-Command docker

if (-not $Tag) {
    $Tag = Get-Date -Format "yyyyMMdd-HHmmss"
}

Write-Host "==> Checking Azure login..."
az account show -o none
if ($LASTEXITCODE -ne 0) {
    throw "Not logged in. Run: az login --use-device-code"
}

$AcrLogin = az acr show -n $AcrName -g $ResourceGroup --query loginServer -o tsv
if (-not $AcrLogin) { throw "Could not resolve ACR login server for '$AcrName'" }

$ApiImage = "$AcrLogin/hackyeah-api:$Tag"
$WebImage = "$AcrLogin/hackyeah-web:$Tag"
$ApiLatest = "$AcrLogin/hackyeah-api:latest"
$WebLatest = "$AcrLogin/hackyeah-web:latest"

Write-Host "==> Deploy tag: $Tag"
Write-Host "==> Logging into ACR ($AcrLogin)..."
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) { throw "ACR login failed" }

if (-not $SkipBuild) {
    $ApiFqdn = az containerapp show -n $ApiApp -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
    if (-not $ApiFqdn) { throw "Could not resolve API FQDN for '$ApiApp'" }

    Write-Host "==> Building API image ($ApiImage)..."
    docker build -f backend/docker/Dockerfile -t $ApiImage -t $ApiLatest .
    if ($LASTEXITCODE -ne 0) { throw "API image build failed" }

    Write-Host "==> Building web image ($WebImage) proxying to https://$ApiFqdn ..."
    docker build -f backend/docker/Dockerfile.frontend `
        --build-arg "VITE_API_URL=" `
        --build-arg "API_UPSTREAM=https://$ApiFqdn" `
        --build-arg "API_HOST=$ApiFqdn" `
        -t $WebImage `
        -t $WebLatest .
    if ($LASTEXITCODE -ne 0) { throw "Web image build failed" }
}

Write-Host "==> Pushing images (unique tag + latest)..."
docker push $ApiImage
if ($LASTEXITCODE -ne 0) { throw "API push failed ($Tag)" }
docker push $ApiLatest
if ($LASTEXITCODE -ne 0) { throw "API push failed (latest)" }
docker push $WebImage
if ($LASTEXITCODE -ne 0) { throw "Web push failed ($Tag)" }
docker push $WebLatest
if ($LASTEXITCODE -ne 0) { throw "Web push failed (latest)" }

Write-Host "==> Updating Container Apps to $Tag (not :latest)..."
az containerapp update -n $ApiApp -g $ResourceGroup --image $ApiImage
if ($LASTEXITCODE -ne 0) { throw "API container app update failed" }

az containerapp update -n $WebApp -g $ResourceGroup --image $WebImage
if ($LASTEXITCODE -ne 0) { throw "Web container app update failed" }

$WebFqdn = az containerapp show -n $WebApp -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
az containerapp update -n $ApiApp -g $ResourceGroup `
    --set-env-vars "CORS_ORIGINS=https://$WebFqdn"
if ($LASTEXITCODE -ne 0) { throw "CORS update failed" }

$ApiFqdn = az containerapp show -n $ApiApp -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv

Write-Host ""
Write-Host "Deployed tag: $Tag"
Write-Host "  Web:  https://$WebFqdn"
Write-Host "  API:  https://$ApiFqdn"
Write-Host "  Docs: https://$ApiFqdn/docs"
Write-Host "  Health: https://$ApiFqdn/health"

Write-Host ""
Write-Host "==> Cleaning up local Docker images and build cache..."
docker image prune -af --filter "until=24h"
docker builder prune -af
