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

## Deploy to Azure (GitHub Actions on `main`)

Flow: push to `main` → GitHub Actions builds images → pushes to ACR → updates Container Apps.

One-time Azure setup, then every push to `main` redeploys automatically. Workflow file: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

| Piece | Azure service |
| --- | --- |
| Images | Azure Container Registry (ACR) |
| API + web | Azure Container Apps (2 apps) |
| Database | Azure Database for PostgreSQL Flexible Server |

Use [Azure Cloud Shell](https://shell.azure.com/) (bash) or local Azure CLI + Docker.

Replace placeholders: `<uniqueAcrName>`, `<unique-pg-name>`, `<StrongPassword123!>`, `<SUBSCRIPTION_ID>`.

---

### Step 0 — Tools

- GitHub account + [GitHub CLI](https://cli.github.com/) optional (`gh`)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Docker Desktop (for the one-time initial image push)

---

### Step 1 — Push this project to GitHub (`main`)

```bash
cd /path/to/hackyeah-2026

git add .
git commit -m "Initial scaffold"
gh repo create hackyeah-2026 --private --source=. --remote=origin --push
# or: create an empty repo on github.com, then:
# git remote add origin https://github.com/<YOU>/hackyeah-2026.git
# git branch -M main
# git push -u origin main
```

---

### Step 2 — Login to Azure and create a resource group

```bash
az login
az account set --subscription "<SUBSCRIPTION_ID>"

az group create --name rg-hackyeah --location westeurope
```

---

### Step 3 — Create ACR

ACR name must be globally unique (letters/numbers only):

```bash
az acr create \
  --resource-group rg-hackyeah \
  --name <uniqueAcrName> \
  --sku Basic \
  --admin-enabled true

az acr login --name <uniqueAcrName>
ACR_LOGIN=$(az acr show --name <uniqueAcrName> --query loginServer -o tsv)
echo "$ACR_LOGIN"
```

---

### Step 4 — Create PostgreSQL

```bash
az postgres flexible-server create \
  --resource-group rg-hackyeah \
  --name <unique-pg-name> \
  --location westeurope \
  --admin-user pgadmin \
  --admin-password "<StrongPassword123!>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --storage-size 32 \
  --public-access 0.0.0.0

az postgres flexible-server db create \
  --resource-group rg-hackyeah \
  --server-name <unique-pg-name> \
  --database-name app

az postgres flexible-server firewall-rule create \
  --resource-group rg-hackyeah \
  --name <unique-pg-name> \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

Build the DB URL (URL-encode special characters in the password):

```text
postgresql+psycopg2://pgadmin:<PASSWORD>@<unique-pg-name>.postgres.database.azure.com:5432/app?sslmode=require
```

Save this as `DATABASE_URL` for the next steps.

---

### Step 5 — Create Container Apps environment

```bash
az containerapp env create \
  --name cae-hackyeah \
  --resource-group rg-hackyeah \
  --location westeurope

ACR_NAME=<uniqueAcrName>
ACR_USER=$(az acr credential show -n $ACR_NAME --query username -o tsv)
ACR_PASS=$(az acr credential show -n $ACR_NAME --query passwords[0].value -o tsv)
ACR_LOGIN=$(az acr show -n $ACR_NAME --query loginServer -o tsv)
```

---

### Step 6 — First image build + create the two apps (one-time)

From the **repo root**:

```bash
# API
docker build -f backend/docker/Dockerfile -t $ACR_LOGIN/hackyeah-api:latest .
docker push $ACR_LOGIN/hackyeah-api:latest

# Temporary web image (API URL fixed after API exists)
docker build -f backend/docker/Dockerfile.frontend \
  --build-arg VITE_API_URL="" \
  -t $ACR_LOGIN/hackyeah-web:latest .
docker push $ACR_LOGIN/hackyeah-web:latest
```

Create API:

```bash
az containerapp create \
  --name ca-hackyeah-api \
  --resource-group rg-hackyeah \
  --environment cae-hackyeah \
  --image $ACR_LOGIN/hackyeah-api:latest \
  --registry-server $ACR_LOGIN \
  --registry-username $ACR_USER \
  --registry-password "$ACR_PASS" \
  --target-port 8000 \
  --ingress external \
  --cpu 0.5 --memory 1.0Gi \
  --secrets "database-url=$DATABASE_URL" \
  --env-vars "DATABASE_URL=secretref:database-url" 'CORS_ORIGINS=["*"]'
```

```bash
API_FQDN=$(az containerapp show -n ca-hackyeah-api -g rg-hackyeah \
  --query properties.configuration.ingress.fqdn -o tsv)
echo "https://$API_FQDN"
```

Rebuild web with the real API URL, create web app:

```bash
docker build -f backend/docker/Dockerfile.frontend \
  --build-arg VITE_API_URL=https://$API_FQDN \
  -t $ACR_LOGIN/hackyeah-web:latest .
docker push $ACR_LOGIN/hackyeah-web:latest

az containerapp create \
  --name ca-hackyeah-web \
  --resource-group rg-hackyeah \
  --environment cae-hackyeah \
  --image $ACR_LOGIN/hackyeah-web:latest \
  --registry-server $ACR_LOGIN \
  --registry-username $ACR_USER \
  --registry-password "$ACR_PASS" \
  --target-port 80 \
  --ingress external \
  --cpu 0.25 --memory 0.5Gi

WEB_FQDN=$(az containerapp show -n ca-hackyeah-web -g rg-hackyeah \
  --query properties.configuration.ingress.fqdn -o tsv)

az containerapp update -n ca-hackyeah-api -g rg-hackyeah \
  --set-env-vars "CORS_ORIGINS=[\"https://${WEB_FQDN}\"]"

echo "Web: https://$WEB_FQDN"
echo "API: https://$API_FQDN"
echo "Docs: https://$API_FQDN/docs"
```

Smoke-check: open the web URL and `https://$API_FQDN/health`.

---

### Step 7 — Give GitHub permission to deploy

Create a service principal scoped to the resource group (JSON used as a GitHub secret):

```bash
SUB_ID=$(az account show --query id -o tsv)
az ad sp create-for-rbac \
  --name "gh-hackyeah-deploy" \
  --role contributor \
  --scopes "/subscriptions/$SUB_ID/resourceGroups/rg-hackyeah" \
  --sdk-auth
```

Copy the entire JSON output. Also grant ACR push:

```bash
ACR_ID=$(az acr show -n <uniqueAcrName> -g rg-hackyeah --query id -o tsv)
SP_APP_ID=$(az ad sp list --display-name "gh-hackyeah-deploy" --query [0].appId -o tsv)
az role assignment create --assignee "$SP_APP_ID" --role AcrPush --scope "$ACR_ID"
```

---

### Step 8 — Configure the GitHub repo

In the repo: **Settings → Secrets and variables → Actions**

**Secret**

| Name | Value |
| --- | --- |
| `AZURE_CREDENTIALS` | Full JSON from `az ad sp create-for-rbac ... --sdk-auth` |

**Variables** (Settings → Secrets and variables → Actions → Variables)

| Name | Example value |
| --- | --- |
| `AZURE_RESOURCE_GROUP` | `rg-hackyeah` |
| `ACR_NAME` | `<uniqueAcrName>` |
| `API_APP_NAME` | `ca-hackyeah-api` |
| `WEB_APP_NAME` | `ca-hackyeah-web` |

With `gh` CLI:

```bash
gh secret set AZURE_CREDENTIALS < azure-creds.json   # paste/save the JSON to a file first
gh variable set AZURE_RESOURCE_GROUP --body "rg-hackyeah"
gh variable set ACR_NAME --body "<uniqueAcrName>"
gh variable set API_APP_NAME --body "ca-hackyeah-api"
gh variable set WEB_APP_NAME --body "ca-hackyeah-web"
```

---

### Step 9 — Automatic redeploy

Ensure `.github/workflows/deploy.yml` is on `main`, then:

```bash
git add .
git commit -m "Add Azure deploy workflow"
git push origin main
```

GitHub → **Actions** → workflow **Deploy to Azure** should run. On success it:

1. Logs into Azure / ACR  
2. Builds & pushes `hackyeah-api` and `hackyeah-web`  
3. Updates both Container Apps  

Later: any commit to `main` triggers the same redeploy. You can also run it manually via **Actions → Deploy to Azure → Run workflow**.

---

### Cost tips

- Basic ACR, Burstable `B1ms` Postgres, low Container Apps CPU/memory.  
- Tear down when done: `az group delete -n rg-hackyeah --yes --no-wait`.

---

## Useful endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/` | Sample API root |
| GET | `/api/db-check` | DB connectivity check |
| GET | `/docs` | OpenAPI UI |
