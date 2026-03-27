# Snapense

A web app that scans receipts from your OneDrive, uses AI to extract expense details (merchant, date, total), renames the files with a standardized naming convention, and uploads them to an `/Expenses` folder on your OneDrive.

## How it works

1. Sign in with your Microsoft account (MSAL / Entra ID)
2. Browse your OneDrive files in a split-pane file explorer
3. Select receipt files (PDFs or images) and click "Process Receipts"
4. Azure OpenAI extracts merchant name, date, total, and expense category
5. Files are renamed to `YYYY-MM-DD-Merchant-Category-Amount-USD` and copied to `/Expenses`
6. Download all processed files as a ZIP

**PDF receipts** have their text extracted and sent to GPT. **Image receipts** (JPEG, PNG, etc.) are sent directly via the vision API.

## Architecture

```
packages/
  shared/    Types and filename formatting logic
  api/       Express backend — auth, OneDrive proxy (Graph API), OCR (Azure OpenAI)
  web/       React + Vite frontend — MSAL auth, file browser, progress UI
infra/       Azure deployment (Bicep, Container Apps, ACR)
```

No database. OneDrive is the data store; the app is stateless.

## Setup

**Prerequisites:** Node 20+, an Azure subscription, Azure CLI (`az login`)

### 1. Create Entra app registration

```bash
./infra/scripts/create-entra-app.sh
```

This creates a multi-tenant SPA app with OneDrive permissions (`Files.ReadWrite`, `User.Read`). Note the Client ID it prints.

### 2. Configure environment

```bash
# packages/api/.env
ENTRA_CLIENT_ID=<your-client-id>
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT=gpt-5.4-nano

# packages/web/.env
VITE_ENTRA_CLIENT_ID=<your-client-id>
```

### 3. Run locally

```bash
npm install
npm run dev:api   # Express on :3000
npm run dev:web   # Vite on :5173 (proxies /api to :3000)
```

Open http://localhost:5173

## Deploy to Azure

```bash
# First time: deploy infrastructure
az group create -n rg-snapense-dev -l westus2
az deployment group create -g rg-snapense-dev -f infra/main.bicep -p infra/main.bicepparam

# Subsequent deploys
ENTRA_CLIENT_ID=<id> AZURE_OPENAI_API_KEY=<key> ./deploy.sh
```

Deploys to Azure Container Apps via ACR. The app runs on port 8080 in production and serves the React SPA from the Express server.
