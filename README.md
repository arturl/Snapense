# Snapense

A web app that scans receipts from your OneDrive, uses AI to extract expense details, and organizes work and 529 college expenses.

## How it works

1. Sign in with your Microsoft account (MSAL / Entra ID)
2. Browse your OneDrive files in a split-pane file explorer
3. Select receipt files (PDFs or images) and click "Process Receipts"
4. Azure OpenAI extracts merchant name, date, total, and expense category
5. Files are renamed to `YYYY-MM-DD-Merchant-Category-Amount-USD` and copied to `/Expenses`
6. Download all processed files as a ZIP

## 529 expense workflow

1. In Settings, add a beneficiary and select a dedicated OneDrive folder
2. Select receipt images or PDFs and scan them with the 529-specific prompt
3. Review and edit the merchant, date, amount, currency, items, and description
4. Submit the reviewed expenses; renamed receipt copies and `expenses.json` are saved in the beneficiary's folder
5. If an existing record has the same date and amount, explicitly cancel, replace it, or add another expense
6. View saved expenses grouped by calendar year and export one row per expense to CSV

Beneficiary/folder settings are stored in browser `localStorage`. Expense records remain in OneDrive; no database is used. Use a separate folder for each beneficiary.

**PDF receipts** have their text extracted and sent to GPT. **Image receipts** (JPEG, PNG, etc.) are sent directly via the vision API.

## Architecture

```
packages/
  shared/    Types and filename formatting logic
  api/       Express backend — auth, OneDrive proxy (Graph API), OCR (Azure OpenAI)
  web/       React + Vite frontend — MSAL auth, file browser, progress UI
infra/       Azure deployment (Bicep, Container Apps, ACR)
```

No database. OneDrive is the expense data store; the API is stateless.

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
