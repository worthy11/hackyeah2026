# HackYeah 2026

React + TypeScript frontend, FastAPI backend, PostgreSQL, Docker — deployable to Azure.

## Layout

```
.
├── requirements.txt          # Python deps (shared by backend image)
├── .gitignore
├── .dockerignore
├── README.md
├── frontend/                 # Vite + React + TypeScript
└── backend/
    ├── main.py               # FastAPI app (served by uvicorn)
    ├── compose.yaml          # 3 containers: frontend + backend + db
    ├── .env.example
    ├── app/                  # Application source
    │   ├── api/
    │   └── core/
    └── docker/               # Dockerfiles + nginx config
        ├── Dockerfile        # backend image → uvicorn
        ├── Dockerfile.frontend
        └── nginx.conf
```

## Prerequisites

- Node.js 22+
- Python 3.11+
- Docker Desktop (for Postgres locally / full container stack)

## Local development (uvicorn + npm)

Day-to-day: run the API with **uvicorn** and the UI with **npm**. Only Postgres runs in Docker.

### 1. Database container

```bash
cd backend
docker compose up db -d
```

Postgres: `localhost:5432` — user/password `postgres`, database `app`.

### 2. Backend (uvicorn)

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
copy backend\.env.example backend\.env   # or: cp backend/.env.example backend/.env

cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000  
- Swagger: http://localhost:8000/docs  

`backend/.env` should use `localhost` for Postgres (see `.env.example`).

### 3. Frontend (npm)

```bash
cd frontend
npm install
npm run dev
```

- UI: http://localhost:5173  
- Vite proxies `/api` and `/health` to uvicorn on port 8000.

## Docker stack (3 containers)

For a production-like run (Azure-style): one frontend, one backend (uvicorn), one db.

```bash
cd backend
docker compose up --build
```

| Service | URL |
| --- | --- |
| frontend | http://localhost:3000 |
| backend (uvicorn) | http://localhost:8000 |
| db | localhost:5432 |

---

## Deploy to Azure

One-time Azure setup, then redeploy with `.\scripts\deploy.ps1` (uses your `az login` session — no Entra / GitHub Actions needed).

| Piece | Azure service |
| --- | --- |
| Images | Azure Container Registry (ACR) |
| API + web | Azure Container Apps (2 apps) |
| Database | Azure Database for PostgreSQL Flexible Server |

Commands below are **PowerShell**. Set these once at the start of a session (edit to match your names):

```powershell
$RG = "hackyeah2026"
$LOCATION = "swedencentral"   # must be allowed by your subscription policy
$ACR_NAME = "hackyeah2026acr" # globally unique, letters/numbers only
$PG_NAME = "hackyeah2026pg"   # globally unique
$PG_PASSWORD = "ChangeMe_StrongPass123!"
$API_APP = "ca-hackyeah-api"
$WEB_APP = "ca-hackyeah-web"
$CAE = "cae-hackyeah"
```

If a region fails with `RequestDisallowedByAzure`, try another (e.g. `eastus`, `northeurope`). Resource groups and services should use an **allowed** location.

---

### Step 0 — Tools

- GitHub account + [GitHub CLI](https://cli.github.com/) optional (`gh`)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Docker Desktop (for the one-time initial image push)

---

### Step 1 — Push this project to GitHub (`main`)

```powershell
cd "C:\Users\slota\Documents\VS Code\Hackathony\hackyeah-2026"

git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/worthy11/hackyeah2026.git  # skip if already set
git push -u origin main
```

---

### Step 2 — Login to Azure and create a resource group

```powershell
az login --use-device-code
# optional: az account set --subscription "YOUR_SUBSCRIPTION_ID"

az group create --name $RG --location $LOCATION
```

Register providers (first time only; wait until each shows `Registered`):

```powershell
az provider register --namespace Microsoft.ContainerRegistry
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.DBforPostgreSQL
az provider register --namespace Microsoft.OperationalInsights

az provider show --namespace Microsoft.ContainerRegistry --query registrationState -o tsv
```

---

### Step 3 — Create ACR

```powershell
az acr create `
  --resource-group $RG `
  --name $ACR_NAME `
  --sku Basic `
  --admin-enabled true `
  --location $LOCATION

az acr login --name $ACR_NAME
$ACR_LOGIN = az acr show --name $ACR_NAME --query loginServer -o tsv
Write-Host $ACR_LOGIN
```

---

### Step 4 — Create PostgreSQL

```powershell
az postgres flexible-server create `
  --resource-group $RG `
  --name $PG_NAME `
  --location $LOCATION `
  --admin-user pgadmin `
  --admin-password $PG_PASSWORD `
  --sku-name Standard_B1ms `
  --tier Burstable `
  --version 16 `
  --storage-size 32 `
  --public-access 0.0.0.0

az postgres flexible-server db create `
  --resource-group $RG `
  --server-name $PG_NAME `
  --database-name app

az postgres flexible-server firewall-rule create `
  --resource-group $RG `
  --name $PG_NAME `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0
```

Build the DB URL (URL-encode special characters in the password if needed):

```powershell
$DATABASE_URL = "postgresql+psycopg2://pgadmin:${PG_PASSWORD}@${PG_NAME}.postgres.database.azure.com:5432/app?sslmode=require"
Write-Host $DATABASE_URL
```

---

### Step 5 — Create Container Apps environment

```powershell
az containerapp env create `
  --name $CAE `
  --resource-group $RG `
  --location $LOCATION

$ACR_USER = az acr credential show -n $ACR_NAME --query username -o tsv
$ACR_PASS = az acr credential show -n $ACR_NAME --query "passwords[0].value" -o tsv
$ACR_LOGIN = az acr show -n $ACR_NAME --query loginServer -o tsv
```

---

### Step 6 — First image build + create the two apps (one-time)

From the **repo root**:

```powershell
# API
docker build -f backend/docker/Dockerfile -t "$ACR_LOGIN/hackyeah-api:latest" .
docker push "$ACR_LOGIN/hackyeah-api:latest"

# Temporary web image (API URL fixed after API exists)
docker build -f backend/docker/Dockerfile.frontend `
  --build-arg VITE_API_URL="" `
  -t "$ACR_LOGIN/hackyeah-web:latest" .
docker push "$ACR_LOGIN/hackyeah-web:latest"
```

Create API:

```powershell
az containerapp create `
  --name $API_APP `
  --resource-group $RG `
  --environment $CAE `
  --image "$ACR_LOGIN/hackyeah-api:latest" `
  --registry-server $ACR_LOGIN `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 8000 `
  --ingress external `
  --cpu 0.5 --memory 1.0Gi `
  --secrets "database-url=$DATABASE_URL" `
  --env-vars "DATABASE_URL=secretref:database-url" "CORS_ORIGINS=*"
```

```powershell
$API_FQDN = az containerapp show -n $API_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv
Write-Host "https://$API_FQDN"
```

Rebuild web with the real API URL, create web app:

```powershell
docker build -f backend/docker/Dockerfile.frontend `
  --build-arg "VITE_API_URL=https://$API_FQDN" `
  -t "$ACR_LOGIN/hackyeah-web:latest" .
docker push "$ACR_LOGIN/hackyeah-web:latest"

az containerapp create `
  --name $WEB_APP `
  --resource-group $RG `
  --environment $CAE `
  --image "$ACR_LOGIN/hackyeah-web:latest" `
  --registry-server $ACR_LOGIN `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 80 `
  --ingress external `
  --cpu 0.25 --memory 0.5Gi

$WEB_FQDN = az containerapp show -n $WEB_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv

az containerapp update -n $API_APP -g $RG `
  --set-env-vars "CORS_ORIGINS=https://$WEB_FQDN"

Write-Host "Web: https://$WEB_FQDN"
Write-Host "API: https://$API_FQDN"
Write-Host "Docs: https://$API_FQDN/docs"
```

Smoke-check: open the web URL and `https://$API_FQDN/health`.

---

### Step 7 — Redeploy from your machine (no Entra / no GitHub required)

You already have Azure access via `az login`. Use the local script instead of a service principal:

```powershell
# once per terminal session if needed
az login --use-device-code

# from repo root
.\scripts\deploy.ps1
```

What it does: build API + web images → push to ACR → update both Container Apps → refresh CORS.

Optional:

```powershell
.\scripts\deploy.ps1 -Tag "v2"       # custom tag (still also pushes :latest)
.\scripts\deploy.ps1 -SkipBuild      # reuse already-built local images
```

By default the script uses a timestamp tag (e.g. `20261003-152700`) for the Container App update, and also pushes `:latest`. Azure often ignores a plain `:latest` update when the name didn’t change, so the unique tag is what actually forces a redeploy.

---

### Cost tips

- Basic ACR, Burstable `B1ms` Postgres, low Container Apps CPU/memory.  
- Tear down when done: `az group delete -n $RG --yes --no-wait`.

---

## Useful endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/` | Sample API root |
| GET | `/api/db-check` | DB connectivity check |
| GET | `/docs` | OpenAPI UI |
