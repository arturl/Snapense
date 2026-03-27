#!/bin/bash
# Creates a Microsoft Entra ID app registration for Snapense.
# Run this once before deploying infrastructure.
#
# Prerequisites: az login
# Usage: ./create-entra-app.sh [environment]

set -euo pipefail

ENV="${1:-dev}"
APP_NAME="snapense-${ENV}"

echo "Creating Entra ID app registration: ${APP_NAME}"

# Create the app registration (SPA, multi-tenant + personal accounts)
APP_ID=$(az ad app create \
  --display-name "${APP_NAME}" \
  --sign-in-audience AzureADandPersonalMicrosoftAccount \
  --enable-id-token-issuance true \
  --enable-access-token-issuance true \
  --query appId \
  --output tsv)

echo ""
echo "App registration created!"
echo "  Client ID: ${APP_ID}"

# Configure as SPA (single-page application) with redirect URIs
echo ""
echo "Configuring SPA redirect URIs..."
az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications(appId='${APP_ID}')" \
  --headers 'Content-Type=application/json' \
  --body "{
    \"spa\": {
      \"redirectUris\": [\"http://localhost:5173\", \"http://localhost:3000\"]
    }
  }"

# Note: Graph API permissions (Files.ReadWrite, User.Read) are requested dynamically
# at login time via MSAL scopes — no need to pre-configure in the app registration.

echo ""
echo "Done! Save these values:"
echo ""
echo "  ENTRA_CLIENT_ID=${APP_ID}"
echo "  VITE_ENTRA_CLIENT_ID=${APP_ID}"
echo ""
echo "Next steps:"
echo "  1. Create packages/api/.env with ENTRA_CLIENT_ID=${APP_ID}"
echo "  2. Create packages/web/.env with VITE_ENTRA_CLIENT_ID=${APP_ID}"
echo "  3. Run: npm install && npm run build"
echo "  4. After Azure deployment, add production redirect URI:"
echo "     az ad app update --id ${APP_ID} --spa-redirect-uris http://localhost:5173 https://<your-app-url>"
