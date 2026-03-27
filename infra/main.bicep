@description('Environment name')
param envName string = 'dev'

@description('Azure region')
param location string = resourceGroup().location

@description('Container image (e.g. myacr.azurecr.io/snapense:tag)')
param containerImage string

@description('Entra ID client ID')
param entraClientId string

param tags object = {
  project: 'snapense'
  environment: envName
}

// Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrsnapense${envName}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
  tags: tags
}

// Container App
module containerApp 'modules/containerApp.bicep' = {
  name: 'containerApp'
  params: {
    envName: envName
    location: location
    containerImage: containerImage
    entraClientId: entraClientId
    acrLoginServer: acr.properties.loginServer
    acrName: acr.name
    tags: tags
  }
}

output appUrl string = containerApp.outputs.appUrl
output acrLoginServer string = acr.properties.loginServer
