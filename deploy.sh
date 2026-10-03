#!/bin/bash
# Deploy Snapense to Azure Container Apps
# Prerequisites: az login, ENTRA_CLIENT_ID set
set -euo pipefail

# Load the ignored local configuration so secrets do not have to be placed on
# the command line (where they can be retained in shell history).
if [[ -f "packages/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "packages/api/.env"
  set +a
fi

: "${ENTRA_CLIENT_ID:?Set ENTRA_CLIENT_ID in packages/api/.env or the environment}"

ENV="${1:-dev}"
RG="rg-snapense-${ENV}"
ACR="acrsnapense${ENV}"
APP="ca-snapense-${ENV}"

TAG="$(git rev-parse --short HEAD)-$(date +%s)"
IMAGE="${ACR}.azurecr.io/snapense:${TAG}"

echo "=== Building image in ACR ==="
az acr build \
  --registry "${ACR}" \
  --image "snapense:${TAG}" \
  --build-arg "VITE_ENTRA_CLIENT_ID=${ENTRA_CLIENT_ID}" \
  .

echo ""
echo "=== Syncing application secrets ==="
EXISTING_SECRETS=$(az containerapp secret list --name "${APP}" --resource-group "${RG}" --query "[].name" -o tsv 2>/dev/null || echo "")

if [[ -n "${AZURE_OPENAI_API_KEY:-}" ]]; then
  az containerapp secret set \
    --name "${APP}" \
    --resource-group "${RG}" \
    --secrets "azure-openai-key=${AZURE_OPENAI_API_KEY}"
  EXISTING_SECRETS="${EXISTING_SECRETS} azure-openai-key"
fi

if [[ "${EXISTING_SECRETS}" == *"azure-openai-key"* ]]; then
  az containerapp update \
    --name "${APP}" \
    --resource-group "${RG}" \
    --set-env-vars \
      "AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}" \
      "AZURE_OPENAI_API_KEY=secretref:azure-openai-key" \
      "AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT:-gpt-5.4-nano}"
fi

if [[ -n "${FRED_API_KEY:-}" ]]; then
  az containerapp secret set \
    --name "${APP}" \
    --resource-group "${RG}" \
    --secrets "fred-api-key=${FRED_API_KEY}"
  EXISTING_SECRETS="${EXISTING_SECRETS} fred-api-key"
fi

if [[ "${EXISTING_SECRETS}" == *"fred-api-key"* ]]; then
  az containerapp update \
    --name "${APP}" \
    --resource-group "${RG}" \
    --set-env-vars "FRED_API_KEY=secretref:fred-api-key"
else
  echo "Warning: FRED_API_KEY is not configured; GBP conversion will be unavailable."
fi

echo ""
echo "=== Deploying to Container Apps ==="
az containerapp update \
  --name "${APP}" \
  --resource-group "${RG}" \
  --image "${IMAGE}" \
  --min-replicas 1 \
  --max-replicas 1

FQDN=$(az containerapp show --name "${APP}" --resource-group "${RG}" --query "properties.configuration.ingress.fqdn" -o tsv)
echo ""
echo "=== Deployed ==="
echo "URL: https://${FQDN}"
echo ""
echo "Don't forget to add the production redirect URI to your Entra app:"
echo "  az ad app update --id \${ENTRA_CLIENT_ID} --spa-redirect-uris http://localhost:5173 https://${FQDN}"
